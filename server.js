
var express = require('express');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var BPromise = require("bluebird");
var loggingMiddleware = require('./util/logger');

var SIS = require("./util/constants");

var app = null;

// routes we want to include
var routes = [
    'schemas',
    'entities',
    'hiera',
    'hooks',
    'users',
    'tokens',
    'info',
    'scripts',
    'endpoints'
];

var allowCrossDomain = function(req,res,next) {
    var origin = req.get("origin") || "*";
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.set('Access-Control-Allow-Headers', 'Content-Type,X-Requested-With,x-auth-token,Authorization');
    res.set('Access-Control-Expose-Headers', "x-total-count");
    // TODO: remove this hardcoded ish
    if (req.path == "/api/v1.1/users/auth_token" && req.method == "POST") {
        res.set('Access-Control-Allow-Credentials', true);
        res.set("WWW-Authenticate", 'Basic realm="Users"');
    }
    next();
};

if (process.env.SIS_DEBUG) {
    BPromise.longStackTraces();
}

var startServer = function(config, callback) {
    'use strict';

    var passport = require("passport");
    var webUtil = require("./routes/webutil");
    var nconf = require('nconf');

    nconf.env('__').argv();
    nconf.defaults(config);

    var app = express();

    app.use(loggingMiddleware.logger());

    //app.use(webUtil.json());
    app.use(bodyParser.json({
        // one mb limit
        limit : 1024 * 1024
    }));
    app.use(allowCrossDomain);

    // Setup global options
    // --------------------
    app.head('/',function(req,res) {
        res.send(200);
    });
    app.options('/',function(req,res) {
        res.send(200);
    });
    app.disable('etag');
    app.enable('trust proxy');

    var opts = nconf.get('db').opts || { };

    mongoose.connect(nconf.get('db').url, opts, function(err) {
        if (err) {
            throw err;
        }

        mongoose.connection.on('error', console.error.bind(console, 'MongoDB connection error:'));

        // express app settings
        var appConfig = nconf.get('app') || {};
        for (var k in appConfig) {
            app.set(k, appConfig[k]);
        }
        var schemaManager = require('./util/schema-manager')(mongoose, appConfig);
        schemaManager.bootstrapEntitySchemas(function(err) {
            if (err) {
                throw err;
            }
            passport.use(webUtil.createTokenStrategy(schemaManager));
            passport.use(webUtil.createUserPassStrategy(schemaManager, appConfig));

            app.use(passport.initialize());

            var cfg = { };
            cfg[SIS.OPT_SCHEMA_MGR] = schemaManager;
            cfg[SIS.OPT_USE_AUTH] = app.get(SIS.OPT_USE_AUTH);
            app.set(SIS.OPT_SCHEMA_MGR, schemaManager);

            // setup the routes
            routes.map(function(routeName) {
                var route = require("./routes/" + routeName);
                route.setup(app, cfg);
            });

            // setup error handler
            app.use(loggingMiddleware.errorLogger());
            app.use(function(err, req, res, next) {
                var errObj = SIS.ERR_INTERNAL("Unexpected error : " + err);
                res.status(errObj[0]).send(errObj[1]);
            });

            // listen
            var httpServer = app.listen(nconf.get('server').port, function(err) {
                if (callback) {
                    callback(app, httpServer);
                }
            });
        });
    });
};

// Run if we're the root module
if (!module.parent) {
    var config = require('./config');
    startServer(config);
}


module.exports.mongoose = mongoose;
module.exports.startServer = startServer;
module.exports.stopServer = function(server, callback) {
    server.close(callback);
};
