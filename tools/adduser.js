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

var mongoose = require('mongoose');
var nconf = require('nconf');
var SIS = require('./util/constants');
var fs = require('fs');
var config = require('./config')

if (process.argv.length != 3) {
    console.log("Require a JSON file.");
    process.exit();
}

nconf.env('__').argv();
nconf.defaults(config);
mongoose.connect(nconf.get('db').url, function(err) {
    if (err) {
        throw err;
    }
    var appConfig = nconf.get('app') || {};
    var schemaManager = require('./util/schema-manager')(mongoose, appConfig);
    schemaManager.bootstrapEntitySchemas(function(err) {
        if (err) {
            throw err;
        }
        var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
        // get the info for a user.
        var jsonFile = process.argv[2];
        var user = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

        // self user - super
        var self = {
            name : "super",
            super_user : true
        };

        userManager.add(user, self, function(err, user) {
            if (err) {
                throw err;
            }
            console.log("User successfully added.");
            process.exit();
        });
    })
});
