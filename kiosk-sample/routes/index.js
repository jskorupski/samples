// routes

module.exports = function(app) {

    var bwipjs = require('../node_modules/bwip-js/node-bwipjs');
    var fs = require('fs');
    var settings = require('../settings/config').settings;
    var lastSMSAlertTimeMS = 0;


    //Setup SplunkStorm Logging
    var stormlogToken = "******";
    
    var stormlogPid = (settings.debug) ? "******";
    var stormLog = new (require('../lib/stormlog')).Log(stormlogToken, stormlogPid);


    function logInternalError(error) {
	
		var nowDate = new Date();
        console.log(("Internal Error - " + error).bold.inverse.red);

        fs.appendFile(settings.errorLogFilename, nowDate + " " + error + "\n", function (err) {
            if (err) {
                console.log("Error appending internal error log: ".bold.inverse.yellow + err);
            }
        });
    }

    function eventErrorDetector(logData) {

        if(logData.screenTapsSinceLastSession && !(settings.debug)) {

            var nowTimeMS = (new Date()).getTime();
            var timeSinceLastAlertS = (nowTimeMS - lastSMSAlertTimeMS)/1000;

            if(logData.screenTapsSinceLastSession > 100) {

                var accountSid = '****';
                var authToken = '****';
                var client = require('twilio')(accountSid, authToken);

                var alertMessage = "Error at kiosk " + logData.kioskID + ": Tap Event Threshold Passed: " +
                    logData.screenTapsSinceLastSession + " during last session.";

                var jamesPhone = "***";
                var flynnPhone = "***";

                //Always log to file
                logInternalError(alertMessage);

                if(timeSinceLastAlertS > 600) { //Send SMS every 10 minutes
                    try {

                        client.sms.messages.create({
                            body: alertMessage,
                            to: jamesPhone,
                            from: "***"
                        }, function(err, message) {
                            if(err) {
                                logInternalError("SMS Alert Sending Error - Twilio Error: " + err.message);
                            }
                            else {
                                lastSMSAlertTimeMS = nowTimeMS;
                            }
                        });

                        client.sms.messages.create({
                            body: alertMessage,
                            to: flynnPhone,
                            from: "***"
                        }, function(err, message) {
                             if(err) {
                                logInternalError("SMS Alert Sending Error - Twilio Error: " + err.message);
                             }
                            else {
                                lastSMSAlertTimeMS = nowTimeMS;
                            }
                        });
                    }
                    catch (e) {
                        logInternalError("Error sending SMS alerts: " + e.message);

                    }
                }
            }
        }

    }

    app.get('/sms',function(req, res){
        try {
            var querystring = require('querystring');
            var request = require('request');
            var q = querystring.stringify(req.query);

            // bit.ly auth
            var auth = 'Basic ' + new Buffer('epickatespade:zeroice').toString('base64');
            var post_params = querystring.stringify({
                client_id: '*****',
                client_secret: '*****'
            });
            var token = '';

            request.post({
                url: 'https://api-ssl.bitly.com/oauth/access_token',
                body: post_params,
                headers: {
                    'Authorization': auth
                }
            },function(err, response, body) {

                if(!err && response.statusCode == 200) {
                    token = response.body;
                    console.log(q);
  
                    var ksMobileDomain = '*****';
                    var ksurl = ksMobileDomain + q.replace(/%2C/g,',');
                    var btlyurl = {
                        "access_token": response.body,
                        "longUrl": ksurl
                    };

                    console.log(querystring.stringify(btlyurl));

                    request("https://api-ssl.bitly.com/v3/shorten?"+querystring.stringify(btlyurl),function(error, response, body){
                        body = JSON.parse(body);
                        if(!error && response.statusCode == 200){
                            var short_url = body.data.url;
                            // got the short url, now send text
                            var accountSid = '*****';
                            var authToken = '*****';
                            var client = require('twilio')(accountSid, authToken);
                            var userPhone = "+1" + req.query.ph.replace(/-/g,'');

                            //Prevent sending to our Twilio number
                            if(userPhone !== "****") {
                                client.sms.messages.create({
                                    body: "Hey! Click here to go to your Kate Spade Saturday Window Shop bag: "+short_url,
                                    to: userPhone,
                                    from: "****"
                                }, function(err, message) {
                                    if(err) {
                                        logInternalError("sms - Twilio Error: " + err.message);
                                        res.json({
                                            sent: false
                                        });
                                    }
                                    else {
                                        console.log("Message sent: " + message.sid);
                                        res.json({
                                            sent: true
                                        });
                                    }
                                });
                            }
                            else {
                                res.json({
                                    sent: false
                                });
                            }

                        }
                        else {
                            if(error) {
                                logInternalError("sms - Bitly Shortening Error: " + error.message);
                            }
                            else {
                                logInternalError("sms - Bitly Shortening Error: response statusCode: " + response.statusCode);
                            }

                            res.json({
                                sent: false
                            });

                        }
                    });
                }
                else {
                    if(err) {
                        logInternalError("sms - Bitly OAuth Error: " + err.message);
                    }
                    else {
                        logInternalError("sms - Bitly OAuth Error: response statusCode: " + response.statusCode);
                    }

                    res.json({
                        sent: false
                    });
                }

            });
        }
        catch (smsError) {

            logInternalError("sms request error: " + err.message);
            res.json({
                sent: false
            });
        }
    });
    app.get('/lights', function(req, res){
       
        if(!settings.debug){
            try {
                var cmd = req.query.cmd || '';
                var midi = require("midi");
                var output = new midi.output();
         
                output.openPort(1);
              
                switch(cmd){
                    case 'attract':
                        output.sendMessage([176,1,4]);
                        break;
                    case 'restore':
                        output.sendMessage([176,1,8]);
                        break;
                    case 'effect':
                        output.sendMessage([176,1,6]);
                        break;
                }

                output.closePort();
            }
            catch (e) {
                logInternalError("MIDI: " + e);
            }
        }
        res.json({lights:true});
    });

    app.get('/img', function(req, res){
        var id = req.query.id || '';
        var fs = require('fs');
        var tmp = [];
        var url = (req.query.large) ? 'public/img/product/large' : 'public/img/product';
        if(req.query.cart){
            url = 'public/img/product/cart' 
        }
        fs.readdir(url,function(e,files){
            if(!e){
                var filtered = (function(pattern){
                    var filtered = [], i = files.length, re = new RegExp(pattern,(req.query.cart) ? 'g' : '');
                    console.log(re);
                    while (i--) {
                        if (re.test(files[i])) {
                            filtered.push(files[i]);
                        }
                    }
                    return filtered;
                })(id);
                res.json(filtered);
            }
        })
    });

    app.get('/qr', function(req, res){
        try {
            bwipjs(req, res);
        }
        catch (apiError) {
            logInternalError('qr - Bar Code Generation General Error: ' + apiError.message);
            res.send(500, 'Bar Code Generation General Error: ' + apiError.message);
        }
    });

    //Logging
    app.post('/logSessionData', function(req, res)  {
        if(req.body) {

            try {

                var logData = req.body.log ? JSON.parse(req.body.log) : {};

                logData.projectName = settings.logProjectName;
                logData.kioskID = settings.kioskID;

                eventErrorDetector(logData);

                stormLog.send(logData, 'json_auto_timestamp');

                fs.appendFile(settings.sessionLogFilename, JSON.stringify(logData) + "\n", function (err) {
                    if (err) {
                        console.log("Error appending session log data: ".bold.inverse.yellow  + err);
                    }
                });
                res.header('Content-Type', 'application/json');
                res.send('{"ok":0}',200);
            }
            catch (apiError) {
                logInternalError('logSessionData - General API Error: ' + apiError.message);
                res.send(500, 'General API Error: ' + apiError.message);

            }
        } else {
            res.header('Content-Type', 'application/json');
            res.send('{"ok":0}',200);
        }

    });

    app.post('/logKinectData', function(req, res)  {
        if(req.body) {

            try {

                var logData = req.body.log ? JSON.parse(req.body.log) : {};

                logData.projectName = settings.logProjectName;
                logData.kioskID = settings.kioskID;

                stormLog.send(logData, 'json_auto_timestamp');

                fs.appendFile(settings.sessionLogFilename, JSON.stringify(logData) + "\n", function (err) {
                    if (err) {
                        console.log("Error appending kinect log data: ".bold.inverse.yellow  + err);
                    }
                });
                res.header('Content-Type', 'application/json');
                res.send('{"ok":0}',200);
            }
            catch (apiError) {
                logInternalError('logKinectData - General API Error: ' + apiError.message);
                res.send(500, 'General API Error: ' + apiError.message);


            }
        } else {
            res.header('Content-Type', 'application/json');
            res.send('{"ok":0}',200);
        }

    });

    app.get('/', function(req, res){
        res.render('index', { 
            title: 'ks' 
        });
    });
    


    app.get('/404', function(req, res, next){
        next();
    });

    app.get('/403', function(req, res, next){
        var err = new Error('Not allowed!');
        err.status = 403;
        next(err);
    });

    app.get('/500', function(req, res, next){
        next(new Error());
    });

}
