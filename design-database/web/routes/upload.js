var express = require('express');
var router = express.Router();
var log = require('debug')('app:log');
var error = require('debug')('app:error');
var fs = require('fs');
var path = require('path');

var imgs = ['png', 'jpg', 'jpeg', 'gif', 'bmp'];

function getExtension(fn) {
    return fn.split('.').pop();
}


router.post('/images', function (req, res, next) {


    var uploadErrors = [];
    var fileNames = {};

    for (var formFieldName in req.files) {

       if(imgs.indexOf(getExtension(req.files[formFieldName].name)) == -1) {
           uploadErrors.push({

               formFieldName: formFieldName,
               fileName: req.files[formFieldName].originalname,
               error: "File not an accepted image format"
           });

           fs.unlink(req.files[formFieldName].path, function(err) {

               if(err) {
                   error(JSON.stringify(err));
               }
               else {
                   log("Upload " + formFieldName + " : " + req.files[formFieldName].name + " rejected.");
               }

           });



       }
       else {
           fileNames[formFieldName] = '/uploads/' + req.files[formFieldName].name
       }

    }

    res.json({
        success: (uploadErrors.length == 0),
        files: fileNames,
        errors: uploadErrors
    });
});

router.get('/images/get', function (req, res, next) {


    res.header("Cache-Control", "no-cache, no-store, must-revalidate");
    res.header("Pragma", "no-cache");
    res.header("Expires", 0);


    var images = [
        'mweb-collection-follow.png',
        'mweb-frontpage-actiontab.png',
        'mweb-frontpage-appbanner.png',
        'mweb-frontpage-designer-promo.png',
        'mweb-frontpage-motors-carousel.png',
        'mweb-frontpage-searchbox-button.png',
        'mweb-home-footer.png',
        'mweb-home-searchbar.png',
        'mweb-home.png',
        'mweb-singlecollection.png',
        'mweb-viewitem-buyitnow.png',
        'mweb-viewitem-image.png',
        'mweb-viewitem-price.png',
        'mweb-viewitem.png'
    ];
    var imageSelection = images[Math.floor(Math.random()*images.length)];

    res.sendfile(path.join(__dirname, '../public', 'uploads/' + imageSelection));



});


module.exports = router;