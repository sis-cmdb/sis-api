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
    'hooks'
];

var startServer = function(config, callback) {

    var nconf = require('nconf');
    nconf.env('__').argv();
    nconf.defaults(config);

    var app = express();
    app.use(express.bodyParser());
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
            var cfg = {
                'mongoose' : mongoose
            }        
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
