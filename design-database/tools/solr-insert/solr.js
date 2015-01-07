var solr = function(serverAddress, port, username, password, coreName, autoCommitBool, connectedCallbackFunc){

    var solr = require('solr-client');

    var client = solr.createClient(serverAddress, port, coreName);
    client.autoCommit = autoCommitBool || false;

    if(username && password) {
        client.basicAuth(username, password);
    }

    var returnObj = {};

    returnObj.db = client;
    returnObj.connected = false;

    returnObj.addAndCommit = function(docs, callbackFunc) {


        client.add(docs, function (err, addResp){


            if(err) {
                callbackFunc(err, addResp);

            }
            else {

                client.commit(function (err, commitResp) {

                    callbackFunc(err, commitResp);

                });
            }


        });
    };

    returnObj.deleteAndCommit = function(field, text, callbackFunc) {


        client.delete(field, text, function (err, delResp){


            if(err) {
                callbackFunc(err, delResp);

            }
            else {

                client.commit(function (err, commitResp) {

                    callbackFunc(err, commitResp);

                });
            }


        });
    };

    returnObj.deleteByIDAndCommit = function(id, callbackFunc) {


        client.deleteByID(id, function (err, delResp){


            if(err) {
                callbackFunc(err, delResp);

            }
            else {

                client.commit(function (err, commitResp) {

                    callbackFunc(err, commitResp);

                });
            }


        });
    };

    //Optimize Solr core
    returnObj.optimize = function(callbackFunc) {

        // waitFlush - block until index changes are flushed to disk
        // waitSearcher - block until a new searcher is opened and registered as the main query searcher, making the changes visible

        client.optimize({waitSearcher: false}, callbackFunc);
    };



    var someObject = {idsomething: "lol", url:"http://www.ebay.com", somenumber: 22, othernumber: 23.0, subObject :{internalId:"internalid", subnumber: 10}};


    //Test Solr Connection
    client.add({documentType: '_test', id: '_test', type: 'what', a_t:'ok'}, function (err, obj){

        if(err){
            console.log("Error adding Solr test doc:");
            console.log(err);
            connectedCallbackFunc(err,null);
        } else {

            console.log("Solr Test 1. Inserted Solr test doc.");
            client.commit(function(err, objCommit){

                if(err) {
                    console.log("Error committing Solr test doc:");
                    console.log(err);
                    connectedCallbackFunc(err,null);
                }
                else {
                    console.log("Solr Test 2. Committed Solr test doc.");
                    //console.log(obj);

                    var testQuery= client.createQuery().q({id: '_test'});

                    client.search(testQuery, function(err, objQuery){

                        if(err){
                            console.log("Error executing Solr test query:");
                            console.log(err);
                            connectedCallbackFunc(err,null);
                        }
                        else if(objQuery.response.numFound == 0) {
                            console.log("Test doc not found!");
                            console.log(objQuery.response);
                            connectedCallbackFunc(objQuery.response,null);
                        }
                        else {
                            console.log("Solr Test 3. Found Solr test doc.");
                            //console.log(objQuery.response.docs);
                            client.delete('id', objQuery.response.docs[0].id, function (err, objDelete){

                                if(err) {

                                    console.log("Error deleting Solr test doc:");
                                    console.log(err);
                                    connectedCallbackFunc(err,null);
                                }
                                else {
                                    console.log("Solr Test 4. Deleted Test doc.");
                                    client.commit(function(err, delCommit){
                                        if(err) {
                                            console.log("Error deleting Solr test doc:");
                                            console.log(err);
                                            connectedCallbackFunc(err,null);
                                        }
                                        else {

                                            console.log("Solr Test 5. Commited Deleted Test doc.");
                                            console.log("Finished Solr Testing!");
                                            returnObj.connected = true;
                                            connectedCallbackFunc(null,returnObj);
                                        }
                                    });

                                }
                            });

                        }

                    });
                }

            });

        }
    });

    return returnObj;
};

module.exports = solr;