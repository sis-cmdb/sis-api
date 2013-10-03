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
var config = require('./config')

var app = express();
app.use(express.bodyParser());

// routes we want to include 
var routes = [
    'schemas',
    'entities'
];

app.configure(function() {
    mongoose.connect(config.db.url);
    var db = mongoose.connection;
    db.on('error', function(err) {
        console.log("Error connecting to mongo.");
    })
    db.once('open', function() {
        var cfg = {
            'mongoose' : mongoose
        }        
        // setup the routes
        routes.map(function(routeName) {
            var route = require("./routes/" + routeName);
            route.setup(app, cfg);
        });
        // listen
        app.listen(config.server.port);
    });
});
