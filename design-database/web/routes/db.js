var express = require('express');
var router = express.Router();
var log = require('debug')('app:db');
var error = require('debug')('app:error');
var fs = require('fs');
var path = require('path');

var solrLib = require('../lib/solr');




var solrClient = solrLib('*****', '8080', undefined, undefined,'designdatabase', false, false, function(err, result){
    if(err) {
        error("Solr Connection Error!:", err);
    }
    else {
        log("Connected to Solr DB!");
    }

});


var solrFacetFields = [
    "country",
    "type",
    "pages",
    "platform",
    "status"
];


//Wrap a string with a prefix and/or suffix, making sure not to add it these if they already exist
//in the input string
function prefixSuffix(prefixStr, suffixStr, input) {


    if(input) {

        if(prefixStr && (input.charAt(0) !== prefixStr)) {
            input = prefixStr + input;
        }


        if(suffixStr && (input.charAt(input.length - 1) !== suffixStr)) {
            input =  input + suffixStr;
        }

    }

    return input;


}



function prettifyFacets(facet_counts) {

    var facet_fields = facet_counts.facet_fields;

    var prettyFacets = [];

    for (var facetName in facet_fields) {

        var facetCountObject = {
            name: facetName,
            values: []

        };

        for (var i=0; i < facet_fields[facetName].length; i += 2) {
            facetCountObject.values.push({
                valueName: facet_fields[facetName][i],
                valueCount: facet_fields[facetName][i + 1]
            });
        }

        prettyFacets.push(facetCountObject);

    }

    return prettyFacets;


}

function startsWith(input, target) {

    return input.slice(0, target.length) == target;

}



router.post('/taxonomy/:name', function (req, res, next) {


    log(req.body);
    solrClient.db.add(req.body, function (err, obj){

        if(err){
            log("Error updating Solr  doc:");
            res.status(500).json(err);
        } else {

            solrClient.db.commit(function(err, objCommit) {

                if (err) {
                    log("Error committing Solr  doc:");
                    res.status(500).json(err);
                }
                else {

                    res.status(200).json(objCommit);
                }
            });
        }


    });





});

router.put('/taxonomy/:name', function (req, res, next) {



    log(req.body);
    solrClient.db.update(req.body, function (err, obj){

        if(err){
            error("Error updating Solr  doc:");
            res.status(500).json(err);
        } else {

            solrClient.db.commit(function(err, objCommit) {

                if (err) {
                    error("Error committing Solr  doc:");
                    res.status(500).json(err);
                }
                else {

                    res.status(200).json(objCommit);
                }
            });
        }


    });


});

//Multiple component get
router.get('/taxonomy/multiple', function (req, res, next) {



    var componentNames = [];

    for(var queryParam in req.query) {

        if(startsWith(queryParam, 'id')) {

            componentNames.push(req.query[queryParam]);

        }
    }



    if(componentNames.length > 0) {


        // Retrieve only one document
        solrClient.db.realTimeGet(componentNames, function(err, obj){
            if (err) {
                error(err);
                res.status(404).send(err);
            } else {

                if(obj.response.docs && obj.response.docs.length > 0) {



                    for(var i = 0; i < obj.response.docs.length; i++) {
                        obj.response.docs[i].imageUrl = "/upload/images/get/?seed=" + Math.random();

                    }


                    res.json({result:obj.response.docs});



                }
                else {
                    res.json({result: []})
                }


            }
        });


    }
    else {
        res.json({result:[]});
    }

});


//Single component get
router.get('/taxonomy/:name', function (req, res, next) {



    var componentName = req.params.name;


    log("comp name:"+componentName);

    if(componentName) {


        // Retrieve only one document
        solrClient.db.realTimeGet(componentName, function(err, obj){
            if (err) {
                        console.log(err);
                        res.status(404).send(err);
            } else {

                if(obj.response.docs && obj.response.docs.length > 0) {


                    //choose first as result
                    var resultDoc = obj.response.docs[0];
                  
                    res.json({result:resultDoc});



                }
                else {
                    res.json({result: null})
                }


            }
        });

    }
    else {
        res.json({result:[]});
    }


});




//Use Solr TermComponent feature to check whether the entire query term appears in the specific term field
router.get('/unique', function (req, res, next){

    var termField = req.query.field || "name";
    var termQuery = req.query.q || "";

    var termQuery = "terms.fl=" + encodeURIComponent(termField) + "&terms.regex=" + encodeURIComponent(termQuery);

    solrClient.db.get('terms', termQuery, function(err, obj){
        if (err) {
            console.log(err);
            res.status(404).send(err);
        } else {

            //Get the number of matches
            var resultCount = obj.terms[termField].length;
            res.json({
                unique: (resultCount == 0)
            });
        }
    });


});

// Use Solr TermComponent to provide a simple autosuggest list of values for a single field based on a query term. We look for all
// values that contain the entire provided query string (case insensitive) anywhere in the field
router.get('/autosuggest', function (req, res, next){

    var termField = req.query.field || "name";
    var termQuery = req.query.q || "";


    //TermComponent method (fast, easiest)


    var termQuery = "terms.fl=" + encodeURIComponent(termField) + "&terms.regex=" + ".*" + encodeURIComponent(termQuery) + ".*" + "&terms.regex.flag=case_insensitive";

    solrClient.db.get('terms', termQuery, function(err, obj){
        if (err) {
            console.log(err);
            res.status(404).send(err);
        } else {
            res.json({
                results: obj.terms
            });
        }
    });


});

router.get('/search', function (req, res, next) {


    var query = req.query.query || '*';
    var start = req.query.start || 0;
    var rows = req.query.rows || 20;


    var facetQueries = [];

    for(var queryParam in req.query) {

        if(startsWith(queryParam, 'fq')) {

            var facetQuery = req.query[queryParam];

            var facetQueryComponents = facetQuery.split(':');

            //Put in raw query
            facetQueries.push({field: facetQueryComponents[0], value: prefixSuffix('"', '"', facetQueryComponents[1])});

    

        }
    }



    var query = solrClient.db.createQuery()
        .q(query)
        .start(start)
        .rows(rows)
        .facet({
            mincount: 1,
            limit: 20,
            field: solrFacetFields
        });


    facetQueries.forEach(function(fqObject, index, array){
        query.matchFilter(fqObject.field, fqObject.value);

    });


    solrClient.db.search(query,function(err,obj) {
        if (err) {
            console.log(err);
            res.status(404).send(err);
        } else {


            res.json({
                results: obj.response.docs,
                facets: prettifyFacets(obj.facet_counts),
                totalResults: obj.response.numFound
            });
        }

    });


});


module.exports = router;