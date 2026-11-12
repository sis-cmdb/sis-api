"use strict";

var express = require('express');
var mongoose = require('mongoose');
var logger = require('./util/logger');
var nconf = require("nconf");
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

// Throws if the app config has settings that cannot work together
var validateAppConfig = function(appConfig) {
    var SIS = require("./util/constants");
    appConfig = appConfig || { };
    if (appConfig[SIS.OPT_AUTH_READS] && !appConfig[SIS.OPT_USE_AUTH]) {
        throw new Error("app." + SIS.OPT_AUTH_READS + " requires app." +
                        SIS.OPT_USE_AUTH + " to be enabled");
    }
};

// Load the JWT session keys.  Throws if auth is enabled and the keys are
// missing or invalid.  Read-only servers only need the public keys; they
// mint tokens only if a private key is also present.
var createSessionManager = function(appConfig, logger) {
    var SIS = require("./util/constants");
    appConfig = appConfig || { };
    if (!appConfig[SIS.OPT_USE_AUTH]) {
        return null;
    }
    return require("./util/session-manager")(appConfig[SIS.OPT_JWT], {
        requireSigningKey : !appConfig[SIS.OPT_READONLY],
        logger : logger
    });
};

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
        res.set('Access-Control-Expose-Headers', "x-total-count,WWW-Authenticate");
        next();
    };

    var passport = require("passport");
    var webUtil = require("./routes/webutil");
    var app = express();

    app.use(logger.loggingMiddleware());

    app.use(express.json({
        // set byte limit
        limit : SIS.MAX_BODY_SIZE_BYTES
    }));
    // Express 5 makes req.query a getter that re-parses on every access, so
    // mutations (e.g. applyDefaults setting populate) would be lost.  Replace it
    // with a concrete, mutable own-property parsed once per request.
    app.use(function(req, res, next) {
        var parsed = req.query;
        Object.defineProperty(req, 'query', {
            value : parsed,
            writable : true,
            configurable : true,
            enumerable : true
        });
        next();
    });
    app.use(allowCrossDomain);

    // Setup global options
    // --------------------
    app.head('/',function(req,res) {
        res.sendStatus(200);
    });
    app.options('/',function(req,res) {
        res.sendStatus(200);
    });
    app.disable('etag');
    app.enable('trust proxy');
    // Express 5 defaults the query parser to 'simple'; SIS relies on nested
    // query parsing (e.g. q[...] objects), which needs the 'extended' (qs) parser.
    app.set('query parser', 'extended');

    // fail fast on invalid settings before touching the database
    validateAppConfig(nconf.get('app'));
    var sessionManager = createSessionManager(nconf.get('app'), LOGGER);

    var opts = nconf.get('db').opts || { };

    mongoose.connect(nconf.get('db').url, opts).then(function() {

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
            passport.use(webUtil.createTokenStrategy(schemaManager, sessionManager));
            passport.use(webUtil.createUserPassStrategy(schemaManager, appConfig));

            app.use(passport.initialize());

            var cfg = { };
            cfg[SIS.OPT_SCHEMA_MGR] = schemaManager;
            cfg[SIS.OPT_USE_AUTH] = app.get(SIS.OPT_USE_AUTH);
            cfg[SIS.OPT_AUTH_READS] = !!app.get(SIS.OPT_AUTH_READS);
            cfg[SIS.OPT_SESSION_MGR] = sessionManager;
            app.set(SIS.OPT_SCHEMA_MGR, schemaManager);
            app.set(SIS.OPT_SESSION_MGR, sessionManager);

            // Validate the API :version param (Express 5 dropped inline route
            // regex that previously restricted it to SUPPORTED_VERSIONS).
            app.param('version', function(req, res, next, version) {
                if (SIS.SUPPORTED_VERSIONS.indexOf(version) === -1) {
                    var verr = SIS.ERR_NOT_FOUND('version', version);
                    return res.status(verr[0]).send(verr[1]);
                }
                next();
            });

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

            // listen once the indexes of every model (e.g. the unique names of
            // schemas and users) exist, so no write can slip past them
            Promise.all(mongoose.modelNames().map(function(name) {
                return schemaManager.indexesReady(mongoose.model(name));
            })).then(function() {
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
    }).catch(function(err) {
        LOGGER.error({ err : err }, "Error connecting");
        process.exit(1);
    });
};

function main() {
    nconf.env({ separator : '__', parseValues : true })
        .argv()
        .file("config.json.local", __dirname + "/conf/config.json.local")
        .file("config.json", __dirname + "/conf/config.json");

    var LOGGER = logger.createLogger({
        name : "SISMain"
    });

    // Check the config once, before forking, so a bad setting exits with a
    // clear message instead of crashing (and re-forking) every worker.
    try {
        validateAppConfig(nconf.get('app'));
        createSessionManager(nconf.get('app'));
    } catch (ex) {
        LOGGER.fatal(ex.message);
        process.exit(1);
    }

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
module.exports.validateAppConfig = validateAppConfig;
module.exports.createSessionManager = createSessionManager;
// stops accepting requests, then lets running hook lookups finish so the
// database connection can be closed
module.exports.stopServer = function(server, callback) {
    server.close(function(err) {
        require('./util/hook-manager').lookupsDone().then(function() {
            callback(err);
        });
    });
};
