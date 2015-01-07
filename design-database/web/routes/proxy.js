var express = require('express');
var router = express.Router();
var request = require('request');
var http = require('http');
var log = require('debug')('app:proxy');
var error = require('debug')('app:error');
var httpProxy = require('http-proxy');
var devices = require('../lib/devices');

//A cache of IP -> last referer host strings to handle automatic resource requests coming from
//proxied pages (this obviously doesn't work behind routers/NAT)
//WARNING: This will infinitely grow until the server shuts down as more IP's connect to this proxy!
var requestCache = {};
var cacheIPCount = 0;

var proxy = httpProxy.createProxyServer({});
router.use('/newProxy/', function (req, res){
    var proxyUrl = req.query.proxyUrl;
    var userAgent = (req.query.deviceId && devices[req.query.deviceId]) ? devices[req.query.deviceId].userAgent : devices.iPhone6.userAgent;

    log(req.query);
    req.headers['user-agent'] = userAgent;
    proxy.web(req, res, { target: proxyUrl });


});


var proxyRouter = function(req,res) {


    var referer = req.headers.referer;


    //If we have a referer, then we assume that the client is coming from an existing proxy connection
    //and might have the existing proxyURL structure in that referer URL
    if(referer && (referer.indexOf("proxyUrl") !== -1)) {

        log(req.ip + ": Found referer url: ", referer);


        var pattern = /http:\/\/.+\/\?proxyUrl=(.*)&deviceId=(.*)/;
        var urlMatches = referer.match(pattern);

        if(urlMatches && urlMatches.length > 1) {


            var userAgent = (urlMatches[2] && devices[urlMatches[2]]) ? devices[urlMatches[2]].userAgent : devices.iPhone6.userAgent;

            //if(req.method === 'GET' || req.method === 'HEAD') {
            try {

                log("Filling in request cache with referer and userAgent");
                //urlMatches[1] should be original site URL
                requestCache[req.ip] = {
                    referer: urlMatches[1],
                    userAgent: userAgent
                };
                cacheIPCount++;


                //console.log(req);
                var x = request({url: urlMatches[1] + req.originalUrl, headers: {'user-agent': userAgent}, strictSSL: false}, function (error) {
                    if (error) {
                        res.header('Content-Type', 'text/html');
                        res.status(404).send('<html><body><div>URL Error:<br><pre>' + error + '</pre></div></body></html>');
                    }

                }).on('response', function(response){

                    //log("1*********************************************")
                    //log(response.request.uri.href);
                });

                req.pipe(x);
                x.pipe(res);


            } catch(e) {
                requestCache[req.ip] = null;
                res.header('Content-Type', 'text/html');
                res.status(404).send('<html><body><div>' + e + '</div></body></html>');
            }


        }

        //If we have a referer, but we don't have our expected proxyUrl parameter, then we silently use the previous
        //referer, so that image/script/other requests go through successfully
        else if (requestCache[req.ip]) {

            log(req.ip + ": No referer found, using requestCache: ", req.originalUrl);
            //Try grabbing previous referer from old request
            //if(req.method === 'GET' || req.method === 'HEAD') {
            try {


                //request.get(requestCache[req.ip] + req.path).pipe(res);

                var x = request({url: requestCache[req.ip].referer + req.originalUrl, headers: {'user-agent': requestCache[req.ip].userAgent}, strictSSL:false}, function (error) {
                    if (error) {
                        res.header('Content-Type', 'text/html');
                        res.status(404).send('<html><body><div>URL Error:<br><pre>' + error + '</pre></div></body></html>');
                    }

                })
                .on('response', function(response){

                    //log("2*********************************************");
                    //log(response.request.uri.href);
                });

                req.pipe(x);
                x.pipe(res);


            } catch(e) {
                //Clear cache if fails
                requestCache[req.ip] = undefined;
                cacheIPCount--;
                res.header('Content-Type', 'text/html');
                res.status(404).send('<html><body><div>' + e + '</div></body></html>');
            }



        }
        else {

            res.header('Content-Type', 'text/html');
            res.status(404).send('<html><body><div>Error: proxyURL format missing, and no previous referer host in cache. Referer: ' + referer + '</div></body></html>');

        }


    }
    //No referer, so we just serve up the page using the proxyURL as a required parameter
    else {


        log(req.ip + ": Proxy serving up normal url, no referer: " + req.query);

        var proxyUrl = req.query.proxyUrl;
        var userAgent = (req.query.deviceId && devices[req.query.deviceId]) ? devices[req.query.deviceId].userAgent : devices.iPhone6.userAgent;

        //Clear any old referers
        if(requestCache[req.ip]) {requestCache[req.ip] = null;}

        if(proxyUrl) {
            //if(req.method === 'GET' || req.method === 'HEAD') {
            try {

                var x = request({url: proxyUrl, headers: {'user-agent': userAgent}, strictSSL: false}, function (error) {
                    if (error) {
                        res.header('Content-Type', 'text/html');
                        res.status(404).send('<html><body><div>URL Error:<br><pre>' + error + '</pre></div></body></html>');
                    }

                }).on('response', function(response){

                    //log("3*********************************************")
                    //log(response.request.uri.href);
                });


                req.pipe(x);
                x.pipe(res);
                //request.get(proxyUrl).pipe(res);
            } catch(e) {
                res.header('Content-Type', 'text/html');
                res.status(404).send('<html><body><div>' + e + '</div></body></html>');
            }


        }
        else {

            var err = new Error('Not Found');
            err.status = 404;

            res.header('Content-Type', 'text/html');
            res.status(404).send('<html><body><div>Error: No proxyURL Query Parameter Supplied!</div></body></html>');
        }


    }

};

router.use('/', proxyRouter);
module.exports = router;