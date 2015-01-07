

var path = require('path');
var os = require('os');

//Append to log file in: Home dir if OSX/Linux, C:/ directory if Windows
function getLogFilePath() {
    //return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
    return (process.platform == 'win32') ? 'C:/' : process.env['HOME'];
}


// globs

var serverDebug = true;

var settings = {
    'siteName' : 'kswindow',
    'sessionSecret' : '******',
    'uri' : 'http://localhost',
    'port' : process.env.PORT || 3001,
    'debug' : serverDebug,
    'profile' : 0,
    'logProjectName':'KSSPopup',
    'kioskID': os.hostname(),
    'errorLogFilename': path.resolve(getLogFilePath(), (serverDebug ? "./kss-nodejs-errors-debug.log" : "./kss-nodejs-errors.log")),
    'sessionLogFilename': path.resolve(getLogFilePath(), (serverDebug ? "./kss-webclient-events-debug.log":  "./kss-webclient-events.log")),
    'offline': false
};

module.exports = function(app, express, env) {
    if ('development' == env) {
        require("./development")(app, express);
    }
    if ('production' == env) {
        require("./production")(app, express);
    }
};

module.exports.settings = settings;