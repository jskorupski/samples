var request = require('request');
var fs = require('fs');
var http = require('http');
var path = require('path');
var csv = require('csv');
var async = require('async');
var colors = require('colors');
var mkdirp = require('mkdirp');
var moment = require('moment');
var JSONStream = require('JSONStream');
var es = require('event-stream');




function streamingJSONWrite(path, array, cb) {


    var fileOutputStream = fs.createWriteStream(path, { flags: 'w+', encoding: 'utf8' });


    fileOutputStream.once('open', function(){
        fileOutputStream.on('close', cb);

        var stringify = JSONStream.stringify('', '\n', '');
        var pipe = es.connect(
            es.readArray(array),
            stringify,
            fileOutputStream
        );


    });






}



/************************************** DATA IMPORTS ***********************************/


//Ebay Categories
var categories = require("./data/all-site-cats-merged.json");

//This country ID list is a modified version of eBay's internal list:
//Converted UK -> GB country code
//Converted QQ (Eritrea) -> ER
//Converted UK (Jersey UK) -> JE
//Converted QQ (Guernsey) -> GG
//Converted QQ (Moldova) -> MD
//Converted QQ (Saint Kitts-Nevis) -> KN
//Converted YU (Yugoslavia) -> MK Macedonia, the former Yugoslav Republic
var countryIds = require("./data/country_ids.json");


//Locations of center of countries
var countryLocations = require("./data/country_lat_lon.json");

//Mapping of sale id to sales types
var salesTypes = require("./data/sales_types.json");

//Locations of all cities over a population of 1000 (as of 2013)
var allCityLocations = require("./data/all-city-locations.json");


/**************************************************************************************/

var apiKeys = null;

try {
    apiKeys = require('./ebay-key');

}
catch(e) { console.log("JSON PARSE ERROR: ".bold.inverse.red + e.toString().bold.inverse.red);}

if( typeof apiKeys !== 'object' || !apiKeys || !apiKeys.DevId || !apiKeys.AppId || !apiKeys.CertId) {
    console.log("Error! A valid eBay Developer API Key is required, and must be stored as: \n".bold.inverse.red +
        "{\n".bold.inverse.red +
        "  \"DevId\": \"DEV-ID-HERE\" \n".bold.inverse.red +
        "  \"AppId\": \"APP-ID-HERE\" \n".bold.inverse.red +
        "  \"CertId\": \"CERT-ID-HERE\" \n".bold.inverse.red +
        "  \"IAFToken\": \"IAF-TOKEN-HERE\" \/*This is optional*\/\n".bold.inverse.red +
        "}\n".bold.inverse.red +
        "in a file called 'ebay-key.json'".bold.inverse.red);
    process.exit(1);
}

var eBayAPI = require('./eBayAPICalls')(apiKeys.AppId);



/******************************* environment checks *************************************/

http.globalAgent.maxSockets = 50;


if(process.argv.length < 3) {
    console.log("Usage: node app.js [input_tsv_filename.txt]");
    process.exit(0);
}


mkdirp(__dirname + '/output/', function (err) {
    if (err) {
        console.error("Error Creating Directory ./output : ".bold.inverse.red + err);
        console.error("Please Create ./output before running this script!".bold.inverse.red);
        process.exit(1);
    }

});
/**************************************************************************************/



var sellerIdToLocCache = {};
// { sellerId: { lat: <num>, lon: <num>, lastUse: <jsTimestamp> }, sellerId: { ... }, ... }

var newLocationCacheElements = false;
var countryAndPostalToLocCache = {};
// { countryCode+Postal: { lat: <num>, lon: <num>, lastUse: <jsTimestamp> }, countryCode+Postal: { ... }, ... }

try {
    countryAndPostalToLocCache = require('./data/locationCache.json');
    console.log("Loaded Location Cache file.");

} catch(e) { countryAndPostalToLocCache = {}; }



function findFirstMatchingCityFromCache(countryISO2Code, cityName) {
    //for(var countryName in allCityLocations) {


    var targetCity = cityName.toLocaleLowerCase();

    var country = allCityLocations[countryISO2Code.toUpperCase()];


    if (country) {

        for (var regionName in country['regions']) {

            var region = country['regions'][regionName];


            for (var i = 0; i < region['cities'].length; i++) {


                var city = region['cities'][i];
                if (city.name.toLowerCase() === targetCity) {

                    return {
                        lat: city.lat,
                        lon: city.lon
                    }
                }

            }


        }

     

    }


    return null;


}

function strStartsWith(sourceStr, searchStr) {

    return (sourceStr.lastIndexOf(searchStr, 0) == 0);

}


function getLocFromCache(countryCode, postalCode) {




    var searchKeyCC = countryCode.replace(/\s+/g, '');
    var searchKeyPostalCode = postalCode.replace(/\s+/g, '');

    var countryCache = countryAndPostalToLocCache[searchKeyCC];

    if(countryCache) {
        return countryCache[searchKeyPostalCode];
    }
    else {
        return null;
    }

   
}

function putLocInCache(countryCode, postalCode, lat, lon) {



    //Flag that we have new data for the cache (so we know to write it to disk periodically)
    newLocationCacheElements = true;

    var keyCC = countryCode.replace(/\s+/g, '');
    var keyPostalCode = postalCode.replace(/\s+/g, '');

    if (!countryAndPostalToLocCache[keyCC]) {
        countryAndPostalToLocCache[keyCC] = {};
    }

    countryAndPostalToLocCache[keyCC][keyPostalCode] = {
        countryCode: countryCode,
        postalCode: postalCode,
        lat: lat,
        lon: lon
        //lastUse: new Date().getTime()
    };


}

var _missingWebserviceErrors = {buyer: 0, seller: 0};

function getLatLonFromAnySource(index, countryCode, cityName, postalCode, isBuyer, callback) {


    var resultObj = {

        lat: 0,
        lon: 0
    };


    var cacheHit = getLocFromCache(countryCode, postalCode);
    if (cacheHit) {
        //console.log("Postal Code Cache Hit!");

        resultObj.lat = cacheHit.lat;
        resultObj.lon = cacheHit.lon;
        cacheHit.lastUse = new Date().getTime();
        callback(null, resultObj);
    }
    else {
        //console.log(countryCode + " " + postalCode);
        //Grab the new data from web service for first attempt

        eBayAPI.getLatLon(countryCode, postalCode, function (err, result) {

            if (err) {

                if (isBuyer) {
                    _missingWebserviceErrors.buyer++;
                }
                else {
                    _missingWebserviceErrors.seller++;
                }

                //Lat Lon lookup failed, use backup city cache, if we can

                if (typeof cityName === "string") {
                    console.log(index + ": Web service error: Postal Code " + postalCode + " in " + countryCode + " not found, using input city " + cityName + " with built-in city cache ..");


                    //console.log(index + ": Web service error: Data Not found for Postal Code " + postalCode + " in " + countryCode + ", Input city: " + cityName );
                    var cityCacheLoc = findFirstMatchingCityFromCache(countryCode, cityName);

                    if (cityCacheLoc) {

                        resultObj.lat = cityCacheLoc.lat;
                        resultObj.lon = cityCacheLoc.lon;


                    }
                    else {

                        console.log(index + ": City Cache error: City " + cityName + " in " + countryCode + " not found, using Country loc ..");


                        var countryLoc = countryLocations.countries[countryCode];

                        if (!countryLoc) {

                            fs.appendFile(__dirname + '/' + 'transaction-errors.log', index + ": Error - Can't Find Country " + countryCode + " - Input Postal Code: " + postalCode + ", Input city: " + cityName + "\n", function (err) {

                            });
                        }
                        else {

                            resultObj.lat = parseFloat(countryLoc.lat);
                            resultObj.lon = parseFloat(countryLoc.lon);

                        }


                    }


                }
                else {
                    console.log(index + ": Web service error: Postal Code " + postalCode + " in " + countryCode + " not found, no city given, using Country loc ..");

                    //console.log(index + ": Web service error: Data Not found for Postal Code " + postalCode + " in " + countryCode + ", No input city." );

                    var countryLoc = countryLocations.countries[countryCode];


                    if (!countryLoc) {


                        fs.appendFile(__dirname + '/' + 'transaction-errors.log', index + ": Error - Can't Find Country " + countryCode + ". Input Postal Code: " + postalCode + ", No input city\n", function (err) {

                        });


                    }
                    else {
                        resultObj.lat = parseFloat(countryLoc.lat);
                        resultObj.lon = parseFloat(countryLoc.lon);

                    }


                }

                //Put our new locally found data into cache

                putLocInCache(countryCode, postalCode, resultObj.lat, resultObj.lon);

                //Flag that we have new data for the cache (so we know to write it to disk periodically)


                callback(null, resultObj);


            }
            else {




                //Put our new web service data into cache
                putLocInCache(countryCode, postalCode, result.lat, result.lon);



                resultObj.lat = result.lat;
                resultObj.lon = result.lon;

                callback(null, resultObj);
            }
        });

    }

}

function getBuyerSellerLatLon(index, buyerCountryCode, buyerPostalCode, buyerCity, sellerCountryCode, sellerPostalCode, cb) {

    var resultObj = {

        buyerLat: 0,
        buyerLon: 0,
        sellerLat: 0,
        sellerLon: 0
    };

    async.parallel([

            //Buyer lookup
            function (parallelCallback) {


                getLatLonFromAnySource(index, buyerCountryCode, buyerCity, buyerPostalCode, true, function (err, result) {


                    if (err) {


                        parallelCallback(null, resultObj);
                    }
                    else {
                        resultObj.buyerLat = result.lat;
                        resultObj.buyerLon = result.lon;
                        parallelCallback(null, resultObj);

                    }


                });

            },
            //Seller Lookup
            function (parallelCallback) {

                getLatLonFromAnySource(index, sellerCountryCode, null, sellerPostalCode, false, function (err, result) {


                    if (err) {


                        parallelCallback(null, resultObj);
                    }
                    else {
                        resultObj.sellerLat = result.lat;
                        resultObj.sellerLon = result.lon;
                        parallelCallback(null, resultObj);

                    }


                });

            }
        ],
        //When finished
        function (err, results) {

            cb(err, resultObj);
        }
    );


}


function getCountryCodeFromEbayId(countryIdStr) {


    for (var i = 0; i < countryIds.length; i++) {

        var countryObj = countryIds[i];

        var currCountryIdStr = countryObj['RNCY_ID'].toString();
        if (currCountryIdStr === countryIdStr) {



            //return countryObj['CULTURAL'].toUpperCase();

            var foundCountryCode = countryObj['ISO_CNTRY_CODE'].toUpperCase();

            //if(foundCountryCode === "UK") { return "GB";}
            //else {
            return foundCountryCode;
            //}


        }
    }

    return null;


}

function getSalesTypeStringFromId(saleTypeIdStr) {


    for (var i = 0; i < salesTypes.length; i++) {

        var salesTypeObj = salesTypes[i];

        var currSalesTypeStr = salesTypeObj['sale_type'].toString();
        if (currSalesTypeStr === saleTypeIdStr) {
            return salesTypeObj['internal_type'];
        }
    }

    return "Unknown";

}

function getL1Category(categoryObj) {

    if (categoryObj && categoryObj.lv === "1") {
        return categoryObj;
    }
    else if (categoryObj && (typeof categoryObj.p !== 'undefined')) {
        //Recursively progress up the hierarchy
        return getL1Category(categories[categoryObj.p]);
    }
    else {
        return {n: "Unknown"};
    }
}


(function () {


    var lastIndex = 0;

    if (process.argv.length != 3) {
        console.log("syntax: node app.js [tsv-input-filename.txt]");
        process.exit();
    }


    var outputColumns = [
        'BuyerCC',
        'SellerCC',
        'BuyerLat',
        'BuyerLon',
        'SellerLat',
        'SellerLon',
        'L1Category',
        'TimeStamp',
        'SaleType'
    ];

    var outputColumnsTable = {
        'BuyerCC': 1,
        'SellerCC': 2,
        'BuyerLat': 3,
        'BuyerLon': 4,
        'SellerLat': 5,
        'SellerLon': 6,
        'L1Category': 7,
        'TimeStamp': 8,
        'SaleType': 9
    };


    var outputArray = [];
    csv()

        .from.path(path.resolve(process.argv[2]), { delimiter: '\t', escape: '"', /*escape:'"'*/ columns: true, relax: true}) //Source
        .transform(function (row, index, callback) { //New fields

            lastIndex = index;
            if (newLocationCacheElements && ((index % 50000) == 0)) {
                //Write out current cache version to save it to desk
                //Write out cache file
                fs.writeFile(__dirname + '/data/locationCache.json', JSON.stringify(countryAndPostalToLocCache), function (err) {

                    if (err) {
                        console.log("Error Writing Location Cache File: " + err);
                    }
                    else {
                        console.log("Updated Location Cache File!");
                    }
                });
            }


            if (index % 20000 == 0) {
                console.log(index);
            }

            //Convert from ebay country id to country code
            row.BuyerCC = getCountryCodeFromEbayId(row['BuyerCountryID']);
            row.SellerCC = getCountryCodeFromEbayId(row['SellerCountryID']);


            //Clean up zip codes
            row['BuyerZip'] = row['BuyerZip'].trim().toUpperCase();
            row['SellerZip'] = row['SellerZip'].trim().toUpperCase();


            if ((!row.BuyerCC) ||
                (!row.SellerCC) ||
                (!row['BuyerZip']) ||
                (!row['BuyerCity']) ||
                (!row['SellerZip'])) {


                //console.log("Encountered Bad Data at row " + index +": " + JSON.stringify(row));

                fs.appendFile(__dirname + '/' + 'transaction-errors.log', index + ": Encountered Bad Data at row " + index + ": " + JSON.stringify(row) + "\n", function (err) {
                });

                callback(null, null);
                return;
            }


//            if(row.SellerCC === "CN") {
//
//                console.log("China country id2:" + row['SellerCountryID2'] + ", zip: " + row['SellerZip']);
//            }

            if (!categories[row['leaf_categ_id']]) {
                fs.appendFile(__dirname + '/' + 'transaction-errors.log', index + ": Can't find category ID: " + row['leaf_categ_id'] + "\n", function (err) {
                });
                row.Category = "Unknown";
                row.L1Category ="Unknown";
            }
            else {
                row.Category = categories[row['leaf_categ_id']].n;
                row.L1Category = getL1Category(categories[row['leaf_categ_id']]).n;
            }


            row.SaleType = getSalesTypeStringFromId(row['sale_type']);

            var dateTime = moment(row['created_time']).zone(-6);

            row.TimeStamp = dateTime.valueOf();


            //Potentially remote call to remote service to grab lat lon data
            getBuyerSellerLatLon(index, row.BuyerCC, row['BuyerZip'], row['BuyerCity'], row.SellerCC, row['SellerZip'], function (err, result) {

                if (err) {

                    //Throw away row on error

                    fs.appendFile(__dirname + '/' + 'transaction-errors.log', index + ": Buyer Seller LatLon Fetch General Error:  " + err + "\n", function (err) {
                    });
                    callback(null, null);
                }
                else if ((result.buyerLat == 0 && result.buyerLon == 0) || (result.sellerLat == 0 && result.sellerLon == 0)) {

                    //Throw away transactions with zero-zero lat-lon for either buyer or seller - this means at least one of the locations could not be found

                    fs.appendFile(__dirname + '/' + 'transaction-errors.log', index + ": Discarded lat lon data for data at row " + index + ": " + JSON.stringify(result) + "\n", function (err) {
                    });

                    callback(null, null);

                }
                else {
                    row.BuyerLat = result.buyerLat;
                    row.BuyerLon = result.buyerLon;
                    row.SellerLat = result.sellerLat;
                    row.SellerLon = result.sellerLon;


                   var arrayVersion = [];

                    for(var i=0; i<outputColumns.length; i++) {
                        arrayVersion.push(row[outputColumns[i]]);
                    }

                    callback(null, arrayVersion);

                }


            });


        }, {parallel: 6})
        .on('end', function (count) {
            // when writing to a file, use the 'close' event
            // the 'end' event may fire before the file has been written
            console.log('Number of lines: ' + count);

        })
        .on('error', function (error) {
            console.log("Error Reading File!: " + error.message);
            console.log("Last Stored Index: " + lastIndex);
        })

        .to.array(function (data, count) {

            outputArray = data;


            var timeStampIndex = outputColumnsTable['TimeStamp'] - 1;
            outputArray.sort(function (a, b) { //Sort resulting data by time, since source data was not sorted by time originally

                return a[timeStampIndex] - b[timeStampIndex];

            });




            //STREAM WRITE VERSION:

            streamingJSONWrite(__dirname + '/output/' + path.basename(process.argv[2]) + '.out.json', outputArray, function (err) {

                if (err) {
                    console.log("Error Writing Output File: " + err);
                }
                else {
                    console.log("Wrote Output File: " + __dirname + '/output/' + path.basename(process.argv[2]) + '.out.json');

                    //Write out cache file using regular stringify routine
                    if(newLocationCacheElements) {
                        fs.writeFile(__dirname + '/data/locationCache.json', JSON.stringify(countryAndPostalToLocCache), function (err2) {

                            if (err2) {
                                console.log("Error Writing Location Cache File: " + err2);
                            }
                            else {
                                console.log("Wrote Location Cache File!");
                            }

                        });
                    }

                    console.log("Web Service Missing Data Errors:" + JSON.stringify(_missingWebserviceErrors));
                }

            });


         


        }, {columns: false, header: false});


})();







