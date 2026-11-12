// script that can add / remove users
"use strict";

var mongoose = require('mongoose');
var nconf = require('nconf');
var SIS = require('../util/constants');
var fs = require('fs');

if (process.argv.length != 4) {
    console.log("Require an action and argument.");
    process.exit(1);
}

var action = process.argv[2];

if (['update','delete'].indexOf(action) == -1) {
    console.log("action must be one of update or delete");
    process.exit(1);
}

nconf.env('__')
    .argv()
    .file("config.json.local", __dirname + "/../conf/config.json.local")
    .file("config.json", __dirname + "/../conf/config.json");

var appConfig = nconf.get('app') || {};
if (!appConfig.auth) {
    console.log("Authentication is not enabled.");
    process.exit(1);
}

// user to do operations as
var superUser = {
    name : "super",
    super_user : true
};

var options = {
    user : superUser
};

// get the info for a user.
var jsonFile = process.argv[3];
var user = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

function updateUser(userManager, user) {
    return userManager.getById(user.name).then(function(u) {
        // user exists
        return userManager.update(u.name, user, options);
    }, function(err) {
        // user does not exist.
        return userManager.add(user, options);
    });
}

function deleteUser(userManager, user) {
    return userManager.delete(user.name, options);
}

function fail(msg, err) {
    console.log(msg, err instanceof Array ? JSON.stringify(err[1]) : err);
    process.exit(1);
}

var opts = nconf.get('db').opts || { };

mongoose.connect(nconf.get('db').url, opts).then(function() {
    var schemaManager = require('../util/schema-manager')(mongoose, appConfig);
    schemaManager.bootstrapEntitySchemas(function(err) {
        if (err) {
            return fail("Error initializing schemas.", err);
        }
        var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
        if (action === 'update') {
            updateUser(userManager, user).then(function() {
                console.log("User updated.");
                process.exit(0);
            }, function(err) {
                fail("Error updating user.", err);
            });
        } else {
            deleteUser(userManager, user).then(function() {
                console.log("User deleted.");
                process.exit(0);
            }, function(err) {
                fail("Error deleting user.", err);
            });
        }
    });
}, function(err) {
    fail("Error connecting to the database.", err);
});
