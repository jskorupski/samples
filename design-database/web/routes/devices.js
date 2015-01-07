var express = require('express');
var router = express.Router();
var devices = require("../lib/devices");


router.get('/', function (req, res, next) {

    var deviceArray = [];
    for(var deviceId in devices) {

        var currentDevice = devices[deviceId];
        deviceArray.push({
            deviceId: deviceId,
            friendlyName: currentDevice.friendlyName,
            userAgent: currentDevice.userAgent,
            width: currentDevice.width,
            height: currentDevice.height,
            multiplier: currentDevice.multiplier
        });
    }

    res.json({deviceList:deviceArray});

});


module.exports = router;