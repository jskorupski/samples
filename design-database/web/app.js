var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var multer  = require('multer');
var compression = require('compression');
var lessMiddleware = require('less-middleware');
var debug = require('debug')('app:log');

var routes = require('./routes/index');
var upload = require('./routes/upload');
var proxy = require('./routes/proxy');
var db = require('./routes/db');
var screenshot = require('./routes/screenshot');
var devices = require('./routes/devices');


var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(compression({
    threshold: 512
}));
app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(multer({
    dest: path.join(__dirname, 'public/uploads'),
    limits: {
        fieldSize: 50000000 //50 MB Max file size
    },
    rename: function (fieldname, filename) {
        return filename.replace(/\W+/g, '-').toLowerCase() + Date.now()
    }
}));



app.use(cookieParser());
app.use(lessMiddleware('/less', {
    debug: true,
    dest: '/css',
    force: (app.get('env') === 'development'),
    pathRoot: path.join(__dirname, 'public')
}));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/upload', upload);
app.use('/proxy', proxy);
app.use('/db', db);
app.use('/screenshot', screenshot);
app.use('/devices', devices);

// catch 404 and forward to error handler

//All other requests go to the proxy
app.use(proxy);


// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    debug('development mode');
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});


app.set('port', process.env.PORT || 3000);

var server = app.listen(app.get('port'), function() {
    debug('Express server listening on port ' + server.address().port);
});

module.exports = app;
