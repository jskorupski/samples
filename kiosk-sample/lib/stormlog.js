var request = require('request'),
    fs = require('fs'),
    settings = require('../settings/config').settings;


Log = function(access_token, project_id) {
    this.access_token = access_token;
    this.project_id = project_id;
    this.url = 'https://api.splunkstorm.com/1/inputs/http';
}

Log.prototype.storeBatch = [];


Log.prototype.sendToSplunk = function(eventtext, sourcetype, host, source, callback) {

    var _this = this;

    sourcetype = typeof sourcetype !== 'undefined' ? sourcetype : 'syslog';
    callback = typeof callback === 'function' ? callback : function (e) { console.log( e || "log sent" ); };

    var params = { 'project' : _this.project_id,
        'sourcetype' : sourcetype };
    if (typeof host !== 'undefined') {
        params['host'] = host;
    }
    if (typeof source !== 'undefined') {
        params['source'] = source;
    }

    var urlarr = [ ];
    for (var key in params) {
        urlarr.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
    }
    var url = _this.url + '?' + urlarr.join('&');

    if (typeof eventtext === 'object') {
        eventtext = JSON.stringify(eventtext);
    }

    var options = {
        maxSockets: 1,
        url: url,
        method: 'POST',
        body: eventtext,
        headers: {
            Authorization: "Basic " + new Buffer(":" + _this.access_token).toString("base64")
        }
    };
    try {
        request(options, callback);
    }
    catch (ex) {
        callback(ex);
    }

};

Log.prototype.send = function(eventtext, sourcetype, host, source, callback) {
    var _this = this;
    var online = null;
    var thisArgs = arguments;

    if(settings.offline){

        console.log("Offline, not sending to splunk, storing...");
        _this.storeBatch.push(thisArgs);
    } else {
        _this.storeBatch.forEach(function(val, index, array){

            console.log("Sending stored log " + index);
            setTimeout(function() {_this.sendToSplunk.apply(_this,_this.storeBatch[index]);}, 10);
        });
        _this.storeBatch = [];

        console.log("Sending current log event to Splunk");
        setTimeout(function() {_this.sendToSplunk(eventtext, sourcetype, host, source, callback);}, 10);
    }


};

exports.Log = Log;