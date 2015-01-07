var request = require('request');
var async = require('async');
var color = require('colors');



var eBayAPI = function(ebayAppId) {

    var _this = this;

    _this.MAX_ITEM_COUNT_PER_SELLER = 250;
    _this.MIN_ITEM_COUNT_FOR_PROMO = 10;
    _this.METERS_PER_MILE = 1609.34;
    _this.OLD_DATA_AGE_MS = 60*1000;

    _this.eBayAppId = ebayAppId;
    _this.APIData = {
        FindingService: {

            header: "http://svcs.ebay.com/services/search/FindingService/v1?",
            operations : {
                findItemsAdvanced:"OPERATION-NAME=findItemsAdvanced&SERVICE-VERSION=1.12.0",
                findItemsInEBayStores: "OPERATION-NAME=findItemsIneBayStores&SERVICE-VERSION=1.12.0"
            },
            SortOrderType : {
                BestMatch: "BestMatch",
                BidCountFewest: "BidCountFewest",
                BidCountMost: "BidCountMost",
                CountryAscending:"CountryAscending",
                CountryDescending:"CountryDescending",
                CurrentPriceHighest: "CurrentPriceHighest",
                DistanceNearest:"DistanceNearest",
                EndTimeSoonest: "EndTimeSoonest",
                PricePlusShippingHighest:"PricePlusShippingHighest",
                PricePlusShippingLowest:"PricePlusShippingLowest",
                StartTimeNewest:"StartTimeNewest"
            },
            formatJson : "&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD",
            authPrefix:   "&SECURITY-APPNAME="
        },
        ShoppingAPI :{
            header: "http://open.api.ebay.com/shopping?siteid=0&version=837",
            operations: {
                GetMultipleItems: "&callname=GetMultipleItems&IncludeSelector=Details,Variations"  //IncludeSelector=Details gives us BOPIS info
                //and "Variations" gets us item size/color/etc variation info
            },
            formatJson:   "&responseencoding=JSON",
            authPrefix: "&appid="
        }
    };

    _this.apiUsageCounters = {
        reachMerchantAPI: 0,
        pubFindingAPI: 0,
        pubShoppingAPI: 0,
        collectionsAPI: 0,
        BOPISInventoryAPI: 0,
        nextGenStorefontAPI: 0,
        nextGenStorefrontOwnerIdAPI: 0,
        nextGenStorefrontStoreURLAPI: 0,
        lbsAPI: 0

    };



};






eBayAPI.prototype.getSingleBatchShoppingAPIDetails = function (itemIdArray, callbackFunc) {

    var queryString = this.APIData.ShoppingAPI.header + this.APIData.ShoppingAPI.operations.GetMultipleItems +
        this.APIData.ShoppingAPI.authPrefix + this.eBayAppId + this.APIData.ShoppingAPI.formatJson;

    queryString += "&ItemID=" + itemIdArray.join(',');

    this.apiUsageCounters.pubShoppingAPI++;

    request.get({url:queryString, json:true}, function(err, resp, body) {



        if(err || body.Ack === "Failure") {
            console.log("Error getting item details: ");
            console.log("Input: [" + itemIdArray + "]");

            if(body.Errors) {
                console.log(body.Errors);
                console.log(body);
                callbackFunc(body.Errors, null);

            }
            else {
                console.log(err);
                callbackFunc(err, null);
            }

        }
        else if (body.Ack === "PartialFailure") {


            if(body.Item.length > 0) {
                console.log("Warning!: Some Errors getting item details: ");
                console.log(body.Errors);

                console.log("Get Item Details: Requested " + itemIdArray.length + " item detail records, Fetched " +
                    body.Item.length + " detail results");

                callbackFunc(err, body.Item);

            }
            else {
                console.log("Error getting some item details: ");
                console.log("Input: [" + itemIdArray + "]");

                if(body.Errors) {
                    console.log(body.Errors);
                    console.log(body);
                    callbackFunc(body.Errors, null);

                }
                else {
                    console.log(err);
                    callbackFunc(err, null);
                }

            }


        }
        else {

            console.log("Get Item Details: Requested " + itemIdArray.length + " item detail records, Fetched " +
                body.Item.length + " detail results");

            callbackFunc(err, body.Item);
        }
    });


};


eBayAPI.prototype.getItemShoppingAPIDetails = function (itemIdArray, callbackFunc) {

    //The Shopping API GetMultipleItems call only allows up to 20 item ids to be queried at a time
    var MAX_ITEMID_COUNT = 20;
    var itemIdBatches = [];
    //Max number of shopping API item id's is 20, so we must batch them up for parallel calls
    if(itemIdArray.length > MAX_ITEMID_COUNT) {

        for(var i=0; i<itemIdArray.length; i+=MAX_ITEMID_COUNT) {

            itemIdBatches.push(itemIdArray.slice(i, i+MAX_ITEMID_COUNT));
        }
    }
    else {
        itemIdBatches.push(itemIdArray);
    }

    async.mapLimit(itemIdBatches, 10, this.getSingleBatchShoppingAPIDetails.bind(this), function(err, results){

        if(err) {

            console.log("Error getting all item details data: ");
            console.log(err);
            callbackFunc(err);

        }
        else {

            var allItemDetails = [];
            for(var i=0; i< results.length; i++) {

                allItemDetails = allItemDetails.concat(results[i]);
            }

            callbackFunc(err, allItemDetails);

        }

    });

};

//Fill in the promoContent Store Data (which is normally just a comma separated list of item id's
// with either 1) cached item detail data we already have fetched or 2) a call to the eBay Shopping API for
//details from the GetMultipleItem API call
//After filling in existing item details, then we backfill the promo list with seller items up to the minimum
//count of promo items we want
eBayAPI.prototype.getStorePromoItemDetails = function (storeLocationArray, callbackFunc) {

    var itemIdArray = null;
    var itemDataResultsTemp = [];
    var missingDetailItemIds = [];
    var _this = this;

    //Choose first store as source of promocontent list, since we know all locations have the same promocontent data
    var promoContent = storeLocationArray[0].promoContent_js;

    //Missing or empty string promoContent fields are converted to empty arrays
    if(!promoContent || (promoContent.trim() === "")) {

        for(var j=0; j<storeLocationArray.length; j++) {

            storeLocationArray[j].promoContent_js = [];
        }

        callbackFunc(null, itemDataResultsTemp);
    }
    else {

        //Convert our promo content string into an array, then first look for item id's in our existing cache
        itemIdArray = promoContent.split(',');

        for(var i=0; i<itemIdArray.length; i++) {

            //First check to see if we already have the item details cached
            var itemData = _this.itemIdToItemDataTable[itemIdArray[i]];

            if(itemData) {
                itemDataResultsTemp.push(itemData);
            }
            else {

                //We don't already have the item details, so we add it to a list of id's to be fetched
                itemDataResultsTemp.push({missingItemId:itemIdArray[i]});   //Keep empty slot for later inserting
                // fetched data in the right order
                missingDetailItemIds.push(itemIdArray[i]);
            }
        }


        //The resulting array of promo item details
        var finalItemDetailArray = [];

        async.series([


                //First load any missing data
                function(callbackSeries) {


                    if(missingDetailItemIds.length == 0) {
                        //No missing item details, so we just send the temp array we made
                        finalItemDetailArray =  itemDataResultsTemp;

                        callbackSeries(null, finalItemDetailArray);
                    }
                    else {
                        //Now fetch the details of the items that aren't already cached
                        _this.getItemShoppingAPIDetails(missingDetailItemIds, function(err, results){

                            if(err) {
                                callbackSeries(err, null);
                            }
                            else {

                                var newItemListToInsert = {};

                                for(var i=0; i< results.length; i++) {
                                    //Store only what we need
                                    var storedItemObj = {};

                                    storedItemObj.type = "item";
                                    storedItemObj.itemId_s =  results[i].ItemID;
                                    storedItemObj.contentTimestamp = new Date(results[i].StartTime);
                                    storedItemObj.title_s = results[i].Title;
                                    storedItemObj.viewItemURL_s = results[i].ViewItemURLForNaturalSearch;
                                    storedItemObj.addToCartURL_s = "http://cart.payments.ebay.com/sc/add?ssPageName=CART:ATC&item=iid:"
                                        + storedItemObj.itemId_s + ",qty:1";
                                    if(results[i].PictureURL && results[i].PictureURL.length > 0) {

                                        storedItemObj.pictureURLLarge_s = results[i].PictureURL[0];
                                    }
                                    else {
                                        storedItemObj.pictureURLLarge_s = results[i].GalleryURL;
                                    }


                                    storedItemObj.sellerUserName_s = results[i].Seller.UserID;
                                    storedItemObj.currentPrice_s = parseFloat((results[i].CurrentPrice.Value)).toFixed(2);

                                    storedItemObj.BOPIS_b = _this.getBOPISState(results[i]);
                                    var variationDetails = _this.getVariationDetails(results[i]);
                                    if(variationDetails) {
                                        storedItemObj.hasVariations_b = true;
                                        storedItemObj.variationDetails_js = variationDetails;
                                    }
                                    else {
                                        storedItemObj.hasVariations_b = false;
                                    }

                                    //Pull in storefront location data for this item
                                    storedItemObj.city = storeLocationArray[0].city;
                                    storedItemObj.hood = storeLocationArray[0].hood;

                                    newItemListToInsert[storedItemObj.itemId_s ] = storedItemObj;

                                    //We will also add this item to the list of items to insert into our DB
                                    _this.addItemDataToDBList(storedItemObj);

                                }


                                //Now make a list of only the items that we were able to fetch details for
                                for(var j=0; j<itemDataResultsTemp.length; j++) {

                                    if(itemDataResultsTemp[j].missingItemId) {

                                        //Placeholder item to lookup in our details fetch cache
                                        if(newItemListToInsert[itemDataResultsTemp[j].missingItemId]) {
                                            finalItemDetailArray.push(newItemListToInsert[itemDataResultsTemp[j].missingItemId]);
                                        }
                                        //If we weren't able to fetch details, then it is left out of the promo content list entirely

                                    }
                                    else {
                                        //Normal item to insert
                                        finalItemDetailArray.push(itemDataResultsTemp[j]);
                                    }
                                }



                                callbackSeries(err, finalItemDetailArray);
                            }
                        });

                    }

                },
                //Now backfill any items from the store up to the minimum promo item count
                function(callbackSeries) {


                    //Insert updated item details array into first store location for next function call
                    storeLocationArray[0].promoContent_js = finalItemDetailArray;

                    //Do backfill on promoContent list (this function needs both the promoContent array full of existing items
                    //to add to, as well as the storefront info, so we will send in the first store location as a reference
                    _this.doStoreDataPromoBackfill(storeLocationArray[0], callbackSeries);


                },
                function (callbackSeries) {

                    //Now that the first store location has the full list of promo content filled in:
                    //For all remaining store locations (which share the same next gent storefront data which gave us the
                    // shared promo content field), insert fetched item detail list into promoContent field
                    for(var i=1; i < storeLocationArray.length;i++) {
                        storeLocationArray[i].promoContent_js = storeLocationArray[0].promoContent_js;
                    }

                    callbackSeries(null, storeLocationArray);
                }
            ],
            function (err){

                if(err) {
                    callbackFunc(err, null)
                }
                else {

                    callbackFunc(null, storeLocationArray);
                }

            });

    }

};

//Get the items from one or more sellers using the public API findItemsAdvanced call
eBayAPI.prototype.getMultipleSellerItems = function(sellerArray, entriesPerPage, pageNumber, sortOrder, callbackFunc) {

    var queryString = this.APIData.FindingService.header + this.APIData.FindingService.operations.findItemsAdvanced +
        this.APIData.FindingService.authPrefix + this.eBayAppId + this.APIData.FindingService.formatJson;



    //Hide duplicate items, where "duplicate" is defined here: http://developer.ebay.com/DevZone/finding/CallRef/types/ItemFilterType.html
    queryString += "&itemFilter(0).name=HideDuplicateItems&itemFilter(0).value=true";

    //Add parameter name for seller filter
    queryString += "&itemFilter(1).name=Seller";

    //Fill in multiple values for the seller names
    for(var i=0; i<sellerArray.length; i++) {
        queryString += "&itemFilter(1).value(" + i + ")=" + sellerArray[i];
    }

    queryString += "&paginationInput.entriesPerPage=" + entriesPerPage;
    queryString += "&paginationInput.pageNumber=" + pageNumber;
    queryString += "&sortOrder=" + sortOrder;
    queryString += "&outputSelector(0)=SellerInfo";
    queryString += "&outputSelector(1)=GalleryInfo";
    queryString += "&outputSelector(2)=PictureURLSuperSize";
    queryString += "&outputSelector(3)=PictureURLLarge";

    this.apiUsageCounters.pubFindingAPI++;
    request.get({url:queryString, json:true}, function(err, resp, body) {


        var appAck = body.findItemsAdvancedResponse[0] ? body.findItemsAdvancedResponse[0].ack[0] : "Failure";
        if(err || appAck === "Failure") {
            console.log("Error Finding Items for: " + sellerArray);
            if(err) {
                console.log(err);

            }
            else {
                callbackFunc(body.findItemsAdvancedResponse[0], null);
            }

        }
        else {
            var results = body.findItemsAdvancedResponse[0].searchResult[0].item;
            if(!results) {results = [];}
            var paginationOutput = body.findItemsAdvancedResponse[0].paginationOutput[0];
            var currentPage = paginationOutput.pageNumber[0];
            var entriesPerPage = paginationOutput.entriesPerPage[0];
            var totalPages = paginationOutput.totalPages[0];
            var totalItems = paginationOutput.totalEntries[0];

            callbackFunc(null, results, currentPage, entriesPerPage, totalPages, totalItems);
        }
    });


};


//Get featured items from a seller using findItemsAdvanced
eBayAPI.prototype.getFeaturedItemsFromSeller = function(sellerName, entriesPerPage, callbackFunc) {

    var queryString = this.APIData.FindingService.header + this.APIData.FindingService.operations.findItemsAdvanced +
        this.APIData.FindingService.authPrefix + this.eBayAppId + this.APIData.formatJson;

    queryString += "&itemFilter(0).name=Seller";
    queryString += "&itemFilter(0).value(0)=" + sellerName;
    queryString += "&itemFilter(1).name=FeaturedOnly";
    queryString += "&itemFilter(1).value=true";
    queryString += "&paginationInput.entriesPerPage=" + entriesPerPage;
    queryString += "&outputSelector=SellerInfo";

    this.apiUsageCounters.pubFindingAPI++;
    request.get(queryString, callbackFunc);
};


//Use the public FindingAPI to get all the items from a specific eBay.com store
eBayAPI.prototype.getStoreItems = function(storename, entriesPerPage, callbackFunc) {


    var queryString = this.APIData.FindingService.header + this.APIData.FindingService.operations.findItemsInEBayStores +
        this.APIData.FindingService.authPrefix + this.eBayAppId + this.APIData.formatJson;
    queryString += "&storeName=" + storename;
    queryString += "&paginationInput.entriesPerPage=" + entriesPerPage;
    queryString += "&outputSelector=StoreInfo";

    this.apiUsageCounters.pubFindingAPI++;
    request.get(queryString, callbackFunc);

};

//Get the next gen storefront API-specific owner id for a single eBay user
eBayAPI.prototype.getSellerNameOwnerId = function(eBayUserName, callbackFunc) {

    var userNameToIdService = "http://passionservice.stratus.ebay.com/psnserv/service/v1/sl/username/" + eBayUserName + "/userid";
    this.apiUsageCounters.nextGenStorefrontOwnerIdAPI++;
    request.get({url: userNameToIdService}, function(err, resp, body) {

        var ownerId = null;

        //Error string is usually something like: Status{code=500, errorCode=1004, message=lookupUserIdByUserName() null}
        var errorString = "Status{code=500, ";


        //Check to see if we got an error response
        if(!err && (body.slice(0, errorString.length) !== errorString)) {
            ownerId = resp.body;
        }
        else {
            console.log("Warning: No Storefront OwnerId for Seller: " + eBayUserName);
        }

        callbackFunc(null, ownerId);

    });

};

//Get the next gen storefront data for a single eBay user
eBayAPI.prototype.getStoreFrontData = function (storeInfoObj, callbackFunc) {



    if(storeInfoObj.ownerId == null) {

        console.log("Warning:  Missing Store Front Data for seller " + storeInfoObj.sellerUserName_s);
        //TODO In future: Do not return fake store data - this is for demo only
        callbackFunc(null,
            {
                sellerUserName_s:  storeInfoObj.sellerUserName_s,
                storeName_s: storeInfoObj.sellerUserName_s + " Storefront, San Francisco",
                storeDesc_s: "Welcome to " + storeInfoObj.sellerUserName_s + "'s Store! "
                    + "We are located in San Francisco, CA and sell clothing and accessories for the trendy, fun, & frugal. "
                    + "We offer hoodies, jackets, dresses for women, men, and kids at low prices. "
                    + "Our best sellers are fashion dresses, vintage watches, Hello Kitty, Disney, & HoodieBuddie (MP3, iPod & iPhone-ready.) ALWAYS FREE SHIPPING!",
                logoUrl_s: "http://ir.ebaystatic.com/f/fq3fje5fdmz5nnnj0c4i1bny4ql.png",
                mediaUrl_s:  "http://ir.ebaystatic.com/f/fq3fje5fdmz5nnnj0c4i1bny4ql.png",
                ownerId_i: 1 //Make up an owner id for now
            });
        return;
    }

    var queryString = "http://passionservice.stratus.ebay.com/psnserv/service/v1/sp/owner/" + storeInfoObj.ownerId;

    this.apiUsageCounters.nextGenStorefontAPI++;
    request.get({url: queryString,json:true}, function(err, resp, body) {

        if(resp.statusCode == 404) {
            callbackFunc({error:"Error Loading Store Data for: " + storeInfoObj.sellerUserName_s}, null);
        }
        else {

            //Store only the data we need
            var storedStoreDataObj = {};
            storedStoreDataObj.sellerUserName_s = storeInfoObj.sellerUserName_s;
            storedStoreDataObj.ownerId_i = body.ownerId;
            storedStoreDataObj.storeName_s = body.storeName;
            storedStoreDataObj.storeDesc_s = body.storeDesc;
            storedStoreDataObj.logoUrl_s = body.logoUrl;
            storedStoreDataObj.mediaUrl_s = body.mediaUrl;
            storedStoreDataObj.promoContent_js = body.promoContent ? body.promoContent : "";
            storedStoreDataObj.promoType_i = body.promoType;




            callbackFunc(null, storedStoreDataObj);
        }


    });

};





//Get the detailed information for a single collection
eBayAPI.prototype.getCollection = function(collection_id, callbackFunc) {

    this.apiUsageCounters.collectionsAPI++;
    var queryString = 'http://svcs.ebay.com/buying/collections/v1/collection/' + collection_id;
    request.get({ url:queryString, json:true },function(err, resp, body) {

        if(resp.statusCode == 404) {
            callbackFunc({error:"Error Loading Collection Data"}, null);
        }
        else {
            callbackFunc(null, body.response);
        }


    });
};


//Get all the collection summaries from a specific ebay User
eBayAPI.prototype.getAllCollectionSummaries = function (eBayUserName, callbackFunc) {

    var queryUrl = "http://svcs.ebay.com/buying/collections/v1/user/" + eBayUserName;

    this.apiUsageCounters.collectionsAPI++;
    request.get({ url:queryUrl, json:true },function(err, resp, body) {

        if(body.statusCode != 200) {
            callbackFunc({error:"Error Loading Collection Summary Data for user " + eBayUserName, message: err}, null);
        }
        else {
            callbackFunc(null, body.response.collections);
        }


    });

};

//Get the eBay.com store URL for a given ownerId (which is linked to eBay username)
eBayAPI.prototype.getStoreURL = function(ownerId, callbackFunc) {



    if(ownerId == null) {

        console.log("Warning:  Missing Store Front URL for ownerId " + ownerId);
        callbackFunc(null, "http://stores.ebay.com/missingdata");
        return;
    }

    this.apiUsageCounters.nextGenStorefrontStoreURLAPI++;
    var queryString = "http://passionservice.stratus.ebay.com/psnserv/service/v1/sl/userid/"+ownerId+"/storeurl";
    request.get(queryString, function(err, resp, body) {

        if(resp.statusCode == 404) {
            console.log("Warning:  Missing Store URL for ownerId " + ownerId);
            callbackFunc(null, "http://stores.ebay.com/missingdata");
        }
        else {
            callbackFunc(null, "http://stores.ebay.com/" + body);
        }


    });
};

//Get the detailed storefront BOPIS location info using the IDs we got previously from the same
//inventory service - this data includes physical location, addresses, store hours, etc
eBayAPI.prototype.getStoreFrontLocationInfo = function(storeFrontLocIDObj, callbackFunc) {
    var prodHost = "http://www.invsvcout.stratus.ebay.com/selling/merchantinventorylookup/v1/location?";

    var queryString = prodHost + "SellerID=" + storeFrontLocIDObj.sellerUserName_s + "&LocationID=" + storeFrontLocIDObj.LocationID_s;

    this.apiUsageCounters.BOPISInventoryAPI++;
    request.get({url: queryString, json:true}, function (err, resp, body) {

        if(err) {
            callbackFunc(err, null);
        }
        else if (resp.statusCode == 400) {

            console.log("Warning: Missing Location Info list for username " + storeFrontLocIDObj.sellerUserName_s + ", location id " + storeFrontLocIDObj.LocationID_s);
            callbackFunc(null, {LocationID: storeFrontLocIDObj.LocationID_s});
        }
        else {

            //console.log("username: " + storeFrontLocIDObj.sellerUserName_s + ", LocationID: " + storeFrontLocIDObj.LocationID_s );
            //console.log("StoreFrontLocationInfo:");
            //console.log(body);

            if(err) {

                callbackFunc(err, null);
            }
            else {


                callbackFunc(null, body);

            }



        }
    });


};

//Get the various physical storefront location id's for a particular seller (if they exist)
//from the BOPIS inventory service
eBayAPI.prototype.getStoreFrontLocationIDs = function(eBayUserName, callbackFunc) {
    var QAHost = "http://www.invsvcout.stg.stratus.qa.ebay.com/selling/merchantinventorylookup/v1/locations?SellerID=";
    var prodHost = "http://www.invsvcout.stratus.ebay.com/selling/merchantinventorylookup/v1/locations?SellerID=";

    var queryString = prodHost + eBayUserName;
    this.apiUsageCounters.BOPISInventoryAPI++;
    request.get({url: queryString, json:true}, function(err, resp, body) {

        if(err) {
            callbackFunc(err, null);
        }
        else if (resp.statusCode == 400) {

            console.log("Warning: Missing Location ID list for username " + eBayUserName);
            callbackFunc(null, [1]);
        }
        else {
            //Note that in this API call "LocationID" is lowercased to "locationID"
            callbackFunc(null, body.locationID);
        }




    });


};



//Get the list of SMB Reach-onboarded merchants
eBayAPI.prototype.getReachStores = function(callbackFunc) {
    var _this = this;
    this.apiUsageCounters.reachMerchantAPI++;
    request.get({url: "https://localretailers.ebay.com/v1/accounts/", json:true}, function (err, resp, body) {

        if(err) {

            callbackFunc(err, null);
        }
        else if (body == null) {
            console.log("Warning: Empty Reach Merchant List!");
            callbackFunc(null, []);
        }
        else {
            //Make array into common format across both incoming reach list and curated seller list
            var result = [];

            for(var j=0; j<body.length; j++) {


                //Only pull in active sellers
                if(body[j].active && !(_this.blackListSellerNames[body[j].username])) {
                    result.push({
                        sellerUserName_s: body[j].username,
                        active_b: body[j].active
                    });

                }

            }

            callbackFunc(null, result);

        }
    });

};




//Insert fake/demo store merchant info into our merchant list
eBayAPI.prototype.insertFakeStoreData = function(sellerList) {

    for (var i=0; i<this.sampleSellers.length; i++) {

        sellerList.push(this.sampleSellers[i]);
    }

    return sellerList;

};

eBayAPI.prototype.addItemDataToDBList = function (itemData) {

    var key = [itemData.city,itemData.hood,itemData.type,itemData.itemId_s];


    //Add item to our main cache that will be sent to DB
    var insertionKey = key.join(':');

    //Attach new unique item id field to identify this particular item - (used by web client)
    itemData.id = insertionKey;

    this.items[insertionKey] = itemData;


    //also put items into seller -> item list cache for promo content filling
    if(!this.sellerNameToItemListTable[itemData.sellerUserName_s]) {
        this.sellerNameToItemListTable[itemData.sellerUserName_s] = [];
    }

    this.sellerNameToItemListTable[itemData.sellerUserName_s].push(itemData);

    //Store item in our itemid lookup table for filling in promocontent
    this.itemIdToItemDataTable[itemData.itemId_s] = itemData;


};




eBayAPI.prototype.printAPIUsage = function() {
    var apiCallTotal = 0;
    console.log("** eBay API Calls **");
    for(var api in this.apiUsageCounters) {

        apiCallTotal += this.apiUsageCounters[api];
        console.log("   " + api + ": " + this.apiUsageCounters[api]);
    }
    console.log("** TOTAL: " + apiCallTotal);
};




//Do the data pulls necessary to get information about a single seller/merchant -
//this includes pulling NextGen storefront API data, plus location information from
//the BOPIS inventory service
eBayAPI.prototype.doSingleStoreGrab = function(smbSeller, callbackFunc) {

    var singleStoreDataArray = [];

    var _this = this;

    var ownerId = 0;
    var storeURL = "";
    var storeLocIdObjArray = [];
    var storeLocArray = [];
    var nextGenStoreFrontData = null;

    async.parallel([

            //In parallel, get the next gen storefront data, and BOPIS location data

            function(callbackParallel) {
                async.series([


                    //First get Owner ID which is required for Store URL and next gen storefront data
                    function(callbackSeries) {
                        _this.getSellerNameOwnerId(smbSeller.sellerUserName_s, function(err, result){
                            ownerId = result; //Save to local closure
                            callbackSeries(err);
                        });
                    },
                    function (callbackSeries) {

                        //Now, in parallel, get the next gen storefront data, and store url to save
                        async.parallel([

                            function (callbackParallel2) {
                                _this.getStoreFrontData({sellerUserName_s:smbSeller.sellerUserName_s, ownerId: ownerId}, function(err, result) {
                                    nextGenStoreFrontData = result;

                                    callbackParallel2(err);
                                });
                            },
                            function (callbackParallel2) {

                                _this.getStoreURL(ownerId, function(err, result) {
                                    storeURL = result;
                                    callbackParallel2(err);
                                });

                            }


                        ], callbackSeries);

                    }

                ], callbackParallel)

            },

            //Get BOPIS location data
            function(callbackParallel) {

                //First get location ID's from inventory service, then get location data for each ID
                async.series([

                    function(callbackSeries) {

                        _this.getStoreFrontLocationIDs(smbSeller.sellerUserName_s,function(err, result) {

                            for(var i=0; i<result.length; i++) {

                                storeLocIdObjArray.push({sellerUserName_s: smbSeller.sellerUserName_s, LocationID_s: result[i]});
                            }
                            callbackSeries(err);
                        });

                    },

                    function(callbackSeries) {
                        //Now that we have the location id array, in parallel we get all the Location data from the list of ID's

                        if(storeLocIdObjArray.length > 0) {
                            async.mapLimit(storeLocIdObjArray, 10, _this.getStoreFrontLocationInfo.bind(_this), function(err, result){

                                storeLocArray = result;
                                callbackSeries(err);

                            });
                        }
                        else {
                            callbackSeries(null);
                        }


                    }
                ], callbackParallel)

            }
        ],
        function(err) {


            if(err) {

                console.log("Error in Single Store Grab:  ");
                console.log(err);
                callbackFunc(err);
            }
            else {


                //For each storefront location, generate new store object/tile data
                for(var i=0; i< storeLocArray.length; i++) {


                    var newStore = {};

                    //Add our own "Type" flag
                    newStore.type = "store";

                    //Extract the location info we actually need for our app
                    newStore.LocationID_s = storeLocArray[i].LocationID;
                    if(!storeLocArray[i].Latitude_d || !storeLocArray[i].Longitude_d) {

                        //Fill in Fake location data if missing:
                        var fakeLocData = _this.getFakeLocationData();
                        newStore.Latitude_d = fakeLocData.Latitude_d;
                        newStore.Longitude_d = fakeLocData.Longitude_d;
                    }
                    else {
                        newStore.Latitude_d =  storeLocArray[i].Latitude;
                        newStore.Longitude_d =  storeLocArray[i].Longitude;
                    }


                    newStore.BOPISName_s =  storeLocArray[i].Name; //Name given by BOPIS inventory service
                    newStore.Address1_s =  storeLocArray[i].Address1;
                    newStore.Address2_s =  storeLocArray[i].Address2;
                    newStore.City_s = storeLocArray[i].City;
                    newStore.Region_s = storeLocArray[i].Region;
                    newStore.PostalCode_s = storeLocArray[i].PostalCode;
                    newStore.Country_s = storeLocArray[i].Country;
                    newStore.Phone_s = storeLocArray[i].Phone;

                    //Now add in the next gen store front data (which has already been filtered for what we need
                    //in getStoreFrontData()
                    newStore = extend(newStore, nextGenStoreFrontData);

                    //Add in fetched store URL
                    newStore.storeUrl_s = storeURL;


                    var neighborhoodInfo = _this.getNeighborhoodInfo(newStore.Latitude_d, newStore.Longitude_d);

                    newStore.city = neighborhoodInfo.city;
                    newStore.hood = neighborhoodInfo.hood;

                    //Generate new unique id from seller name and location id to
                    // identify this particular store - (used by web client)
                    newStore.id = [newStore.city, newStore.hood, newStore.sellerUserName_s, newStore.LocationID_s].join(':');


                    singleStoreDataArray.push(newStore);


                }

                callbackFunc(null, singleStoreDataArray);

            }

        });

};


//Do all data grabs required for our Reach merchants
eBayAPI.prototype.doStoreDataGrabs = function(smbSellerList, callbackFunc) {


    var allStoreData = [];

    if(smbSellerList.length > 0 ) {
        async.mapLimit(smbSellerList, 10, this.doSingleStoreGrab.bind(this), function(err, results){


            if(err) {

                console.log("Error getting all store data: ");
                console.log(err);
                callbackFunc(err);

            }
            else {
                for(var i=0; i< results.length; i++) {

                    allStoreData = allStoreData.concat(results[i]);
                }

                callbackFunc(err, allStoreData);

            }

        });

    }
    else {
        callbackFunc(null, allStoreData);
    }

};


//For each store, we look at the promoContent list and then fill it in with nested item data
eBayAPI.prototype.getAllStoresPromoContent = function (callbackFunc) {

    var _this = this;

    //For every one of the sellers we have, go and fetch the promo item details
    async.eachLimit(Object.keys(this.sellerNameToStoresTable), 10,

        function(sellerName, callbackEach){

            //Fetch all store locations associated with the seller
            var storeLocationsArray = _this.sellerNameToStoresTable[sellerName];

            //Go fetch item details for promo content either from cache or another call to eBay Shopping API,
            //then backfill with extra data to fill out our desired number of promo items
            _this.getStorePromoItemDetails(storeLocationsArray, callbackEach);

        },

        function (err){

            if(err) {

                console.log("Error merging items into store promo content:");
                console.log(err);
            }
            else {

                callbackFunc(null);
            }

        }
    );

};

//Get item details for all promoContent items from the next gen storefront API. In addition, since
//the promo content field is limited to 4 manually picked items, we backfill in up to the requested
//minimum promo item number
//Note: this function has a callback just in case future versions need to do a new http API request
//to get backfilled items
eBayAPI.prototype.doStoreDataPromoBackfill = function(storeDataObject, callbackFunc) {


    //Get recent items to back fill into Promo Content slot for store


    if(storeDataObject.promoContent_js.length < this.MIN_ITEM_COUNT_FOR_PROMO) {

        var requestedItemCount = this.MIN_ITEM_COUNT_FOR_PROMO - storeDataObject.promoContent_js.length;

        var itemList = this.sellerNameToItemListTable[storeDataObject.sellerUserName_s];

        if(itemList) {
            //We assume the item list is already sorted in the order we want the items coming in
            for(var i = 0; (i<itemList.length && i < requestedItemCount); i++) {
                storeDataObject.promoContent_js.push(itemList[i]);
            }

        }
        else {
            console.log("Warning: No store promo items available to look up for seller " + storeDataObject.sellerUserName_s);
        }

        callbackFunc(null, storeDataObject);

    }
    else {

        callbackFunc(null, storeDataObject);
    }


};



//Get all the items from a single seller (up to the max item limit) using findItemsAdvanced and then pull extra
//item detail about BOPIS from Shopping API GetItem
eBayAPI.prototype.doSingleSellerItemsGrab = function(smbSeller, callbackFunc) {


    var _this = this;
    var findItemAdvancedArray = [];

    var itemDetailsObj = {};
    var sellerTotalItemsNeeded = _this.MAX_ITEM_COUNT_PER_SELLER;
    var currentPage = 1;


    //First pull findItemsAdvanced details, then pull GetItemsMultiple details, then merge
    async.series([
            function(callbackSeries) {
                async.doWhilst(
                    //Get a single page here
                    function (callbackDoWhilst) {
                        _this.getMultipleSellerItems([smbSeller.sellerUserName_s], 100, currentPage, _this.APIData.FindingService.SortOrderType.StartTimeNewest,
                            function(err, results, currentPageResult, entriesPerPage, totalPages, totalSellerItems){


                                if(err) {

                                    console.log("Error while getting items from single seller " + smbSeller.sellerUserName_s + ":");
                                    console.log(err);
                                    callbackDoWhilst(err);
                                }
                                else {


                                    //After fetching the total item count for the seller (across all pages), make sure our requested item count is not more
                                    //than the seller has
                                    if(sellerTotalItemsNeeded > totalSellerItems) {
                                        sellerTotalItemsNeeded = totalSellerItems;
                                    }




                                    for(var i=0;(i < results.length) && (findItemAdvancedArray.length < sellerTotalItemsNeeded); i++) {


                                        var storedItemObj = {};


                                        //Add our own "Type" flag for items
                                        storedItemObj.type = "item";

                                        //Store only attributes from API that we need
                                        storedItemObj.itemId_s =  results[i].itemId[0];
                                        storedItemObj.contentTimestamp = new Date(results[i].listingInfo[0].startTime[0]);
                                        storedItemObj.title_s = results[i].title[0];
                                        storedItemObj.viewItemURL_s = results[i].viewItemURL[0];
                                        storedItemObj.addToCartURL_s = "http://cart.payments.ebay.com/sc/add?ssPageName=CART:ATC&item=iid:"
                                            + storedItemObj.itemId_s + ",qty:1";
                                        if(results[i].pictureURLLarge) {

                                            storedItemObj.pictureURLLarge_s = results[i].pictureURLLarge[0];
                                        }
                                        else {
                                            storedItemObj.pictureURLLarge_s = results[i].galleryInfoContainer[0].galleryURL[0].__value__;
                                        }


                                        storedItemObj.sellerUserName_s = results[i].sellerInfo[0].sellerUserName[0];
                                        storedItemObj.currentPrice_s = parseFloat((results[i].sellingStatus[0].currentPrice[0].__value__)).toFixed(2);


                                        findItemAdvancedArray.push(storedItemObj);

                                    }
                                    console.log("Page " + currentPage + ", Total items for " + smbSeller.sellerUserName_s + ":" + findItemAdvancedArray.length);

                                    currentPage++;

                                    callbackDoWhilst(null);

                                }

                            });

                    },

                    //Do-while loop test (while we have less than the total needed item count)
                    function() {
                        return findItemAdvancedArray.length < sellerTotalItemsNeeded;

                    },
                    function (err) {

                        if(err) {

                            console.log("Error Finding Items for Seller " + smbSeller.sellerUserName_s + ":");
                            console.log(err);
                            callbackSeries(err, null);
                        }
                        else {
                            callbackSeries(err, findItemAdvancedArray);
                        }

                    }
                );


            },
            //Extract Item ID list from findItemsAdvanced Results, then make a multi item detail call to getItemShoppingAPIDetails
            //to get BOPIS details
            function (callbackSeries) {

                var extractedItemIds = [];

                for(var i=0; i<findItemAdvancedArray.length; i++) {
                    extractedItemIds.push(findItemAdvancedArray[i].itemId_s);
                }


                if(extractedItemIds.length > 0) {

                    _this.getItemShoppingAPIDetails(extractedItemIds, function(err, result){

                        if(err) {
                            callbackSeries(err, null);
                        }
                        else {

                            //Now build up mapping of item id to item details
                            for(var i=0; i< result.length; i++) {
                                itemDetailsObj[result[i].ItemID] = result[i];
                            }
                            callbackSeries(err, itemDetailsObj);
                        }
                    });
                }
                else {
                    callbackSeries(null, {});
                }


            }],

        function (err) {


            if(err) {

                console.log("Error Getting Items and Item Details for Seller " + smbSeller.sellerUserName_s + ":");
                console.log(err);
                callbackFunc(err, null);
            }
            else {

                //Now merge together FindItemsAdvanced data and GetMultipleItems data

                for(var i=0; i< findItemAdvancedArray.length; i++) {

                    var itemDetails = itemDetailsObj[findItemAdvancedArray[i].itemId_s];

                    findItemAdvancedArray[i].BOPIS_b = _this.getBOPISState(itemDetails);
                    var variationDetails = _this.getVariationDetails(itemDetails);
                    if(variationDetails) {
                        findItemAdvancedArray[i].hasVariations_b = true;
                        findItemAdvancedArray[i].variationDetails_js = variationDetails;
                    }
                    else {
                        findItemAdvancedArray[i].hasVariations_b = false;
                    }


                }

                console.log("Seller: " + smbSeller.sellerUserName_s + ", Find API Calls:" + (currentPage-1) +
                    ", Retrieved Items: " + findItemAdvancedArray.length);
                callbackFunc(err, findItemAdvancedArray);
            }

        }
    );







};

eBayAPI.prototype.getBOPISState = function (itemDetailsObject) {

    if (itemDetailsObject && (itemDetailsObject.AvailableForPickupInStore == true)) {
        return true;
    }
    else {
        return false;
    }

};

eBayAPI.prototype.getVariationDetails = function (itemDetailsObject) {


    if( itemDetailsObject.Variations
        && itemDetailsObject.Variations.VariationSpecificsSet
        && itemDetailsObject.Variations.VariationSpecificsSet.NameValueList) {
        var nameValueList = itemDetailsObject.Variations.VariationSpecificsSet.NameValueList;

        var result = {};
        for(var i=0; i<nameValueList.length; i++) {
            result[nameValueList[i].Name] = nameValueList[i].Value;
        }
        return result;
    }
    else {
        return null;
    }

};

eBayAPI.prototype.doAllSellersItemsGrabs = function(smbSellerArray, callbackFunc) {


    var allItemData = [];

    if(smbSellerArray.length > 0) {
        async.mapLimit(smbSellerArray, 10, this.doSingleSellerItemsGrab.bind(this), function(err, results){

            if(err) {

                console.log("Error getting all item data: ");
                console.log(err);
                callbackFunc(err);

            }
            else {

                //Combine together into big list of items to eventually be pushed to our DB
                for(var i=0; i< results.length; i++) {

                    allItemData = allItemData.concat(results[i]);
                }

                callbackFunc(err, allItemData);

            }

        });

    }
    else {
        callbackFunc(null, allItemData);
    }




};

//From: http://stackoverflow.com/questions/280634/endswith-in-javascript
eBayAPI.prototype.strEndsWith = function (str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;

};



eBayAPI.prototype.getLatLon = function(iso2CountryCode, postalCode, cb) {

    var _this = this;
    var queryUrl = 'http://svcs.ebay.com/lbservice/geocode/v1/postalCodelocationinfo';

    //QA:
    //var queryUrl = 'http://lbsp.vip.stratus.ebay.com/lbservice/geocode/v1/postalCodelocationinfo';



    var options = {
        url: queryUrl,
        qs: {
            isoCountryCode: iso2CountryCode,
            postalCode: postalCode
        },
        headers: {
            'Authorization': 'APP ' +  _this.eBayAppId,
            'Accept': 'application/json'
        },
        json: true
    };


    try {

        request.get(options, function(err, resp, body){

            var errString;
            if(err) {
                errString = "Error fetching LatLong from LBS API for input: country: " + iso2CountryCode +
                    ", postal code: " + postalCode + ": " + err;
                cb(errString, null);


            }
            else if (resp.statusCode != 200) {


                errString = "Status Code Error fetching LatLong from LBS API for input: country: " +
                    iso2CountryCode + ", postal code: " + postalCode + ": " + resp.statusCode + "\n Error Body:\n" + body;
                cb(errString, null);
            }
            else {

                if(body.locations && body.locations.length > 0) {

                    cb(null, {lat: body.locations[0].latitude, lon: body.locations[0].longitude });

                }
                else {

                    errString ="Error Fetching LatLong from LBS API for input - no locations received! Input country: " +
                        iso2CountryCode + ", postal code: " + postalCode + "\nReceived Data\n " + body;
                    cb(errString, null);
                }


            }


        });

    } catch (e) {
        var errString ="Request Error fetching LatLong from LBS API: " + e;
        cb(errString, null);
    }

};



module.exports = function(ebayAPIAppId) {

    return new eBayAPI(ebayAPIAppId);
};