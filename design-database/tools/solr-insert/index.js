var offset = 0;
var solr = require("./solr");
var request = require('request');
var async = require('async');


var taxonomyData = require("../../data/taxonomy-sample.json");





function doInsert(solrerror, solr) {


    if (solrerror || !solr.connected) {
        var errObj = {Message: "Error in Solr Insert Function: Solr is not Ready/Connected!", Error: solrerror};
        console.log(errObj.Message);
        return;
    }

    //Add id's based on name field to each document
    taxonomyData.forEach(function(element, index, array){

        element.id = element.name;
        element['modification-timestamp'] = new Date();


        if(element.documentType === "component") {

            var renderDevice = "ChromeDesktop";
            for(var i=0; i<element.platform.length; i++) {
                if(element.platform[i].toLowerCase() === "mweb") {
                    renderDevice = "iPhone6";
                    break;
                }
            }



            request.get({url:"http://localhost:3000/screenshot/save", json:true,
                qs: {
                    name : element.name,
                    selector: element.pageSelector,
                    url: element.pageUrl,
                    deviceId: renderDevice,
                    crop: 'true',
                    update: 'false'
                }
            }, function (err, resp, body) {
                if(err) {
                    console.error("Error rendering component " + element.name + ":");
                    console.error(err);
                }
                else {
                    console.log("Saved Screenshot:" + JSON.stringify(body));
                }
            });


        }



        
    });


    solr.addAndCommit(taxonomyData, function (err, addCommResp){

        if(err) {
            console.log("Error Adding and Committing New Items into Solr:");
            console.log(err.message);

        }
        else {
            console.log(addCommResp);
            solr.optimize(function (err, optimizeResp){

                if(err) {
                    console.log("Error Optimizing after Insertion:");
                    console.log(err);
                }
                else {
                    console.log(optimizeResp);
                    console.log("Inserted " + (taxonomyData.length) + " items into Solr!");
                }

            });

        }


    });



}

//Connect and then do insert after connected

solr('*****', '8080', undefined, undefined,'designdatabase', false, doInsert);