var express = require('express');

// global paths
var views = __dirname + '/views',
    static_root = __dirname + '/public';

module.exports.cfg = function(app) {

    // global config
     app.configure(function() {

         // view engine
         app.set('views', views);
         app.set('view engine', 'jade');
         
         // uncompressed html output
         app.locals({
             pretty : true,
             layout: false
         });
         
         // parses x-www-form-urlencoded request bodies (and json)
         app.use(express.bodyParser());
         app.use(express.methodOverride());
         
         // main routing
         app.use(app.router);
         
         // res
         app.use(express.favicon());
         app.use(express.static(static_root));
         
      
     });
}