var express = require('express');
var router = express.Router();
var log = require('debug')('app:log');
var error = require('debug')('app:error');
var fs = require('fs');
var path = require('path');
var devices = require('../lib/devices');

var scraper = require("../lib/scraper");

var imgs = ['png', 'jpg', 'jpeg', 'gif', 'bmp'];






function getExtension(fn) {
    return fn.split('.').pop();
}


function convertNameToScreenshotFileName(name) {

    return name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".png";


}

router.get('/instant', function (req, res, next) {



    var phantomCookieArray = [];
    //for(var cookie in req.cookies) {
    //
    //    phantomCookieArray.push({
    //        name: cookie,
    //        value: req.cookies[cookie],
    //        domain: ".ebay.com",
    //        path: "/"
    //
    //    });
    //
    //}

    var url = req.query.url || 'http://m.ebay.com';
    var selector = req.query.selector || "#mw-hdr";
    var userAgent = (req.query.deviceId && devices[req.query.deviceId]) ? devices[req.query.deviceId].userAgent : devices.iPhone6.userAgent;
    var resX = (req.query.deviceId && devices[req.query.deviceId]) ? devices[req.query.deviceId].width : 414;
    var resY = (req.query.deviceId && devices[req.query.deviceId]) ? devices[req.query.deviceId].height : 736;
    var crop = (req.query.crop === undefined) ? false :  (req.query.crop === 'true');
    var name = req.query.name || "screenshot" + Math.round(Math.random()*10000);

    var baseFileName = convertNameToScreenshotFileName(name);

    try {
        scraper.instantScreenshot(url, selector, resX, resY, userAgent, phantomCookieArray, crop, name, baseFileName, function(err, imageStream){

            if(err) {

                error("Error rendering screenshot:" + baseFileName);
                error(err);

                res.status(500).json(err);
            }
            else {
                res.writeHead(200, {'Content-Type': 'image/png' });
                imageStream.pipe(res);

            }

        });

    }
    catch(exception) {

        res.status(500).send();
        error("Uncaught error rendering screenshot:" + baseFileName);
        error(exception);

    }



});


function doScreenshotSave(url, selector, resX, resY, userAgent, phantomCookieArray, crop, name, baseFileName, cb) {
    try {

        scraper.saveScreenshot(url, selector, resX, resY, userAgent, phantomCookieArray, crop, name, baseFileName, cb);

    }
    catch(exception) {

        cb(exception, null);

    }

}

router.get('/save', function (req, res, next) {

    var phantomCookieArray = [];
    //for(var cookie in req.cookies) {
    //    phantomCookieArray.push({
    //        name: cookie,
    //        value: req.cookies[cookie],
    //        domain: ".ebay.com",
    //        path: "/"
    //
    //    });
    //
    //
    //}


    /*name: cookie.key,
     value: cookie.value,
     domain: cookie.domain,
     path: cookie.path,
     httponly: cookie.httpOnly,
     secure: cookie.secure,
     expires: cookie.expires*/

    var url = req.query.url || 'http://m.ebay.com';
    var selector = req.query.selector || "#mw-hdr";
    var userAgent = (req.query.deviceId && devices[req.query.deviceId]) ? devices[req.query.deviceId].userAgent : devices.iPhone6.userAgent;
    var resX = (req.query.deviceId && devices[req.query.deviceId]) ? devices[req.query.deviceId].width : 414;
    var resY = (req.query.deviceId && devices[req.query.deviceId]) ? devices[req.query.deviceId].height : 736;
    var crop = (req.query.crop === undefined) ? false :  (req.query.crop === 'true');
    var name = req.query.name || "screenshot" + Math.round(Math.random()*10000);

    var updateExisting = (req.query.update === undefined) ? false :  (req.query.update === 'true');

    var baseFileName = convertNameToScreenshotFileName(name);

    var targetPath = path.resolve("public/screenshots/" + baseFileName);

    //log(req.query);



    if(updateExisting) {

        doScreenshotSave(url, selector, resX, resY, userAgent, phantomCookieArray, crop, name, baseFileName, function(err, filename){


            if(err) {


                error("Error saving screenshot:" + baseFileName);
                error(err);
                res.status(500).json(err);
            }
            else {
                res.json({imageUrl: filename});

            }


        });



    }
    else {


        fs.exists(targetPath, function(exists){

            if(exists) {

                res.json({imageUrl: "screenshots/" + baseFileName});

            }
            else {

                doScreenshotSave(url, selector, resX, resY, userAgent, phantomCookieArray, crop, name, baseFileName, function(err, filename){


                    if(err) {

                        error("Error saving screenshot:" + baseFileName);
                        error(err);

                        res.status(500).json(err);
                    }
                    else {
                        res.json({imageUrl: filename});

                    }


                });
            }
        });



    }


});


router.get('/', function (req, res, next) {
    var name = req.query.name || "mWeb HP";

    var fileName = path.resolve("public/screenshots/" + convertNameToScreenshotFileName(name));

    fs.exists(fileName, function(exists){

        if(exists) {

            res.sendFile(fileName);
        }
        else {
            res.status(404).send();
        }

    });



    //var name = req.query.name || "screenshot" + Math.round(Math.random()*10000);
    //
    //
    //res.sendfile(path.join(__dirname, '../public', 'screenshots/' + name));


});



module.exports = router;

