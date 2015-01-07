var express = require('express');
var router = express.Router();

/* GET home page. */
//router.get('/', function(req, res) {
//  res.render('index', { title: 'Design Atlas' });
//});


//router.get('/', function(req, res, next) {
//
//    var referer = req.headers.referer;
//
//    console.log(referer);
//
//
//    //If we have a referer, check for proxy connection
//    if(referer && (referer.indexOf("audit.html") == -1)) {
//        var pattern = /http:\/\/.+\/\?proxyUrl=(.*)&?user-agent=(.*)/;
//        var urlMatches = referer.match(pattern);
//
//        if (urlMatches && urlMatches.length > 1) {
//            proxy.proxyFunction(req, res, next);
//        }
//        else {
//            next();
//        }
//    }
//    else {
//        next();
//    }
//
//
//});


module.exports = router;
