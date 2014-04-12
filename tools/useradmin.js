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
var SIS = require('../util/constants');
var fs = require('fs');
var config = require('../config');

if (process.argv.length != 4) {
    console.log("Require an action and argument.");
    process.exit(1);
}

var action = process.argv[2];

if (['update','delete'].indexOf(action) == -1) {
    console.log("action must be one of update or delete");
    process.exit(1);
}

nconf.env('__').argv();
nconf.defaults(config);
var appConfig = nconf.get('app') || {};
if (!appConfig.auth) {
    console.log("Authentication is not enabled.");
    process.exit(1);
}

// self user - super
var self = {
    name : "super",
    super_user : true
};

// get the info for a user.
var jsonFile = process.argv[3];
var user = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

function updateUser(userManager, user, callback) {
    userManager.getById(user.name, function(err, u) {
        if (err) {
            // user does not exist.
            userManager.add(user, self, callback);
        } else {
            // user exists
            userManager.update(u.name, user, self, callback);
        }
    });
}

function deleteUser(userManager, user, callback) {
    userManager.delete(user.name, self, callback);
}

mongoose.connect(nconf.get('db').url, function(err) {
    if (err) {
        throw err;
    }
    var schemaManager = require('../util/schema-manager')(mongoose, appConfig);
    schemaManager.bootstrapEntitySchemas(function(err) {
        if (err) {
            throw err;
        }
        var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
        if (action === 'update') {
            updateUser(userManager, user, function(err, r) {
                if (err) {
                    console.log("Error updating user.");
                    process.exit(1);
                } else {
                    console.log("User updated.");
                    process.exit(0);
                }
            });
        } else {
            deleteUser(userManager, user, function(err, r) {
                process.exit(0);
            });
        }
    });
});
