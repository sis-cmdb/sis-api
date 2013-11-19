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
    'index'
];

var allowCrossDomain = function(req,res,next) {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.set('Access-Control-Allow-Headers', 'Content-Type,X-Requested-With');
    res.set('Access-Control-Expose-Headers', "x-total-count");
    next();
}


var startServer = function(config, callback) {
    var passport = require("passport");
    var authUtil = require("./routes/authutil");
    var nconf = require('nconf');
    var SIS = require('./util/constants');

    nconf.env('__').argv();
    nconf.defaults(config);

    var app = express();

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
            if (nconf.get('app')) {
                var appConfig = nconf.get('app');
                for (var k in appConfig) {
                    app.set(k, appConfig[k]);
                }
            }
            var schemaManager = require('./util/schema-manager')(mongoose);
            schemaManager.bootstrapEntitySchemas(function(err) {
                if (err) {
                    throw err;
                }
                passport.use(authUtil.createTokenStrategy(schemaManager));
                passport.use(authUtil.createUserPassStrategy(schemaManager));

                app.use(passport.initialize());

                var cfg = {
                    'schemaManager' : schemaManager,
                    'auth' : app.get(SIS.OPT_USE_AUTH) || false
                }
                app.set("schemaManager", schemaManager);
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
