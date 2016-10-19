"use strict";

var express = require('express');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var BPromise = require("bluebird");
var logger = require('./util/logger');
var nconf = require("nconf");
var app = null;

mongoose.Promise = BPromise;

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

if (process.env.SIS_DEBUG) {
    BPromise.longStackTraces();
}

var startServer = function(callback) {
    var SIS = require("./util/constants");
    var LOGGER = logger.createLogger({
        name : "SISServer"
    });

    var allowCrossDomain = function(req,res,next) {
        var origin = req.get("origin") || "*";
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
        res.set('Access-Control-Allow-Headers', 'Content-Type,X-Requested-With,x-auth-token,Authorization');
        res.set('Access-Control-Expose-Headers', "x-total-count");
        next();
    };

    var passport = require("passport");
    var webUtil = require("./routes/webutil");
    var app = express();

    app.use(logger.loggingMiddleware());

    //app.use(webUtil.json());
    app.use(bodyParser.json({
        // set byte limit
        limit : SIS.MAX_BODY_SIZE_BYTES
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
    opts.promiseLibrary = BPromise;

    mongoose.connect(nconf.get('db').url, opts, function(err) {
        if (err) {
            LOGGER.error({ err : err }, "Error connecting");
            process.exit(1);
        }

        // express app settings
        var appConfig = nconf.get('app') || {};
        for (var k in appConfig) {
            app.set(k, appConfig[k]);
        }
        app.locals.closeListeners = [];
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
            app.use(logger.errorLoggingMiddleware());
            app.use(function(err, req, res, next) {
                var errObj = SIS.ERR_INTERNAL("Unexpected error : " + err);
                res.status(errObj[0]).send(errObj[1]);
            });

            // listen
            var httpServer = app.listen(nconf.get('server').port, function(err) {
                httpServer.on("close", function() {
                    app.locals.closeListeners.forEach(function(handler) {
                        handler();
                    });
                });
                if (callback) {
                    callback(app, httpServer);
                }
            });
        });
    });
};

function main() {
    nconf.env('__')
        .argv()
        .file("config.json.local", __dirname + "/conf/config.json.local")
        .file("config.json", __dirname + "/conf/config.json");

    var LOGGER = logger.createLogger({
        name : "SISMain"
    });

    var setupCloseHandlers = function(app, server) {
        mongoose.connection.on('error', function(err) {
            LOGGER.error({ err : err }, "A connection error occurred.");
            server.close(function() {
                process.exit(1);
            });
        });

        process.on("SIGINT", function() {
            server.close(function() {
                process.exit(0);
            });
        });
    };

    if (nconf.get("app:use_cluster")) {
        var cluster = require("cluster");
        if (cluster.isMaster) {
            var cpuCount = require('os').cpus().length;
            var worker = null;
            // Create a worker for each CPU
            for (var i = 0; i < cpuCount; i += 1) {
                worker = cluster.fork();
                LOGGER.info({ worker_pid : worker.process.pid }, "Created worker");
            }
            // create workers when they exit
            cluster.on('exit', function(worker) {
                LOGGER.error({ worker_pid : worker.process.pid }, 'worker died. forking again.');
                cluster.fork();
            });
        } else {
            startServer(setupCloseHandlers);
        }
    } else {
        startServer(setupCloseHandlers);
    }
}

// Run if we're the root module
if (!module.parent) {
    main();
}


module.exports.mongoose = mongoose;
module.exports.startServer = startServer;
module.exports.stopServer = function(server, callback) {
    server.close(callback);
};
