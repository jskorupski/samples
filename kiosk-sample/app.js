//if(true) process.env.NODE_ENV = 'production';

var express     = require('express'),
    http        = require('http'),
    color       = require('colors'),
    fs 			= require('fs');

var app         = express(),
    env         = app.settings.env,
    

// dev+prod config
    conf        = require('./settings/config'),
    settings    = conf.settings;
    conf        (app, express, env);

var ping = null;
try {
    ping = require('net-ping');
}
catch (e) {
    ping = null;
}

// server config
require('./cfg').cfg(app);

// routes
require('./routes/index')(app);

var server = http.createServer(app);

server.listen(settings.port, function(){
    console.log("Express server listening on "+" port %d ".bold.inverse.red+" in " + " %s mode ".bold.inverse.green + " with " + "debug flag: %s ".bold.inverse.yellow + " //", settings.port, env, settings.debug);
    console.log('Using Express %s...', express.version.red.bold);
});

var io = require('socket.io').listen(server);
io.set('log level', 2);

var canPing = true;

io.sockets.on('connection', function(socket) {

	

     var netCheckInt = setInterval(function(){

        if(!canPing) {
            clearInterval(netCheckInt);
        }
        else {
            var test = checkNet(function(online){
                if(online){
                    if(settings.offline) {
                        console.log("*******************************Server Detected Online*******************************".bold.inverse.green);
                        settings.offline = false;
						fs.appendFile(settings.errorLogFilename, (new Date()).toString() + " Server Detected As Back Online\n", function (err) {
							if (err) {
								console.log("Error appending internal error log: ".bold.inverse.yellow + err);
							}
						});
                    }
                    socket.emit('online',{});
                } else {
                    if(!settings.offline) {
                        console.log("*******************************Server Detected Offline*******************************".bold.inverse.red);
                        settings.offline = true;
						fs.appendFile(settings.errorLogFilename, (new Date()).toString() + " Server Detected Offline State\n", function (err) {
							if (err) {
								console.log("Error appending internal error log: ".bold.inverse.yellow + err);
							}
						});
                    }
                    socket.emit('offline',{});
                }
            });
        }
    },5000); 
	var file = String(fs.readFileSync("listener/listener.json"));
	socket.emit('init', { init: JSON.parse(file), kioskID: settings.kioskID});

    socket.on('disconnect', function() {
        clearInterval(netCheckInt);
    });

});



var checkNet = function(cb) {


    var calledCallback = false;
    var pingoptions = {
        timeout: 2000,
        packetSize: 32,
        ttl: 54
    };

    try {
        var session = ping.createSession(pingoptions);

        session.pingHost ('8.8.4.4', function (error, target) {
            if (error) {
                if (!calledCallback) {
                    cb(false);
                    calledCallback = true;
                }
            }
            else {
                if (!calledCallback) {
                    cb(true);
                    calledCallback = true;
                }
            }

        });
    }
    catch(e) {
        console.log("Error while trying to ping, stopping future offline checks. Error: " + e);
        canPing = false;
        //By Default, assume we are online
        if (!calledCallback) {
            cb(true);
        }
    }

/

};
