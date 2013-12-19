/***********************************************************

 The information in this document is proprietary
 to VeriSign and the VeriSign Product Development.
 It may not be used, reproduced or disclosed without
 the written approval of the General Manager of
 VeriSign Product Development.

 PRIVILEGED AND CONFIDENTIAL
 VERISIGN PROPRIETARY INFORMATION
 REGISTRY SENSITIVE INFORMATION

 Copyright (c) 2013 VeriSign, Inc.  All rights reserved.

 ***********************************************************/

var express = require('express');
var mongoose = require('mongoose');
var app = null;

// routes we want to include
var routes = [
    'schemas',
    'entities',
    'hiera',
    'hooks',
    'users',
    'tokens',
    'index'
];

var allowCrossDomain = function(req,res,next) {
    var origin = req.get("origin") || "*";
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.set('Access-Control-Allow-Headers', 'Content-Type,X-Requested-With,x-auth-token,Authorization');
    res.set('Access-Control-Expose-Headers', "x-total-count");
    // TODO: remove this hardcoded ish
    if (req.path == "/api/v1/users/auth_token" && req.method == "POST") {
        res.set('Access-Control-Allow-Credentials', true);
        res.set("WWW-Authenticate", 'Basic realm="Users"');
    }
    next();
}


var startServer = function(config, callback) {
    var passport = require("passport");
    var webUtil = require("./routes/webutil");
    var nconf = require('nconf');
    var SIS = require('./util/constants');

    nconf.env('__').argv();
    nconf.defaults(config);

    var app = express();

    //app.use(webUtil.json());
    app.use(express.json());
    app.use(allowCrossDomain);

    // Setup global options
    // --------------------
    app.head('/',function(req,res) {
        res.send(200);
    });
    app.options('/',function(req,res) {
        res.send(200);
    });

    app.configure(function() {
        mongoose.connect(nconf.get('db').url, function(err) {
            if (err) {
                throw err;
            }

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
                passport.use(webUtil.createUserPassStrategy(schemaManager));

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
                // listen
                httpServer = app.listen(nconf.get('server').port, function(err) {
                    if (callback) {
                        callback(app, httpServer);
                    }
                });
            });
        });
    });
}

// Run if we're the root module
if (!module.parent) {
    var config = require('./config')
    startServer(config);
}


module.exports.mongoose = mongoose;
module.exports.startServer = startServer;
module.exports.stopServer = function(server, callback) {
    server.close(callback);
}
