//var Pageres = require('pageres');
var path = require('path');
var fsWriteStreamAtomic = require('fs-write-stream-atomic');
var mkdir = require('mkdirp');
var screenshot = require('screenshot-stream');

var log = require("debug")("app:scraper");
var error = require("debug")("app:error");



var MAX_SIMULTANEOUS_RENDERS = 3;
var screenShotQueue = [];
var rendersInFlight = 0;


function saveImageStream(pathDest, fileName, imageStream, cb) {

    mkdir(pathDest, function (err) {
        if (err) {
            next(err);
            return;
        }

        var dest = path.join(pathDest, fileName);
        var pipe = imageStream.pipe(fsWriteStreamAtomic(dest));

     
        imageStream.on('error', function(err){error("Error Saving Screenshot:", err); cb(err, null);});
        pipe.on('finish', function(){
            log("Finishing Save Screenshot: " + fileName);
            cb(null, dest);
        });

    });

}



function queueInstantScreenshot(url, selector, resWidth, resHeight, userAgent, cookies, crop, name, baseFileName, cb) {


    if(rendersInFlight >= MAX_SIMULTANEOUS_RENDERS) {
        screenShotQueue.push(arguments);
    }
    else {

        takeScreenshot(url, selector, resWidth, resHeight, userAgent, cookies, crop, name, baseFileName, cb);
    }

}

function processScreenshotQueue() {


    if(rendersInFlight < MAX_SIMULTANEOUS_RENDERS && screenShotQueue.length > 0) {
        var nextScreenshotArguments = screenShotQueue.shift();
        takeScreenshot.apply(this, nextScreenshotArguments);
    }

}


function takeScreenshot(url, selector, resWidth, resHeight, userAgent, cookies, crop, name, baseFileName, cb) {


    rendersInFlight++;


    log("Renders In Flight: " + rendersInFlight);

    var stream = screenshot(url, (resWidth) + 'x' + (resHeight), {
        delay: (1.25 + rendersInFlight),
        selector: selector,
        filename: baseFileName,
        crop: crop,
        scale: 1,
        customHeaders : {"User-Agent": userAgent},
        cookies: cookies
    });

    stream.on('finish', function(){

        rendersInFlight--;
        processScreenshotQueue();
    });
    stream.on('warn', function(err){error("PhantomJS Screenshot Warning:", err);});
    stream.on('error', function(err){error("PhantomJS Screenshot Error:", err);});


    cb(null, stream);

    //stream.pipe(fs.createWriteStream('google.com-1024x768.png'));




    //var currentSources = pageResObj.src();
    //
    //if(currentSources) {
    //    currentSources.length = 0;
    //}
    //
    //pageResObj.src(url, [(resWidth) + 'x' + (resHeight)], {
    //    selector: selector,
    //    filename: name,
    //    crop: false,
    //    scale: 1,
    //    customHeaders : {"User-Agent": userAgent}
    //});
    //
    //pageResObj.run(function (err, items) {
    //
    //    if (err) {
    //        cb(err, null);
    //    }
    //    else {
    //        cb(null, items[0]);
    //    }
    //});


}

module.exports.saveScreenshot = function (url, selector, resWidth, resHeight, userAgent, cookies, crop, name, baseFileName, cb) {

    queueInstantScreenshot(url, selector, resWidth, resHeight, userAgent, cookies, crop, name, baseFileName, function(err, imageStream){

        if(err) {
            cb(err, null);
        }
        else {

            saveImageStream(__dirname + "/../public/screenshots/", baseFileName, imageStream, function(err, filename){

                cb(err, "screenshots/" + baseFileName);
            });
        }
    });
};


module.exports.instantScreenshot = queueInstantScreenshot;

