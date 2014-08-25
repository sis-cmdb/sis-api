"use strict";

var mongoose = require('mongoose');
var nconf = require('nconf');
var SIS = require('../util/constants');
var fs = require('fs');
var config = require('../config');

if (process.argv.length < 3) {
    console.log("Require a schema JSON file with optional entity JSON file.");
    process.exit(1);
}

nconf.env('__').argv();
nconf.defaults(config);

var appConfig = nconf.get('app') || {};
var schemaManager = require('../util/schema-manager')(mongoose, appConfig);

// get the info for a user.
var schemaModel = null;
var schemaFile = process.argv[2];
try {
    var schema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
    var validateErr = schemaManager.validate(schema);
    if (validateErr) {
        console.log("Schema is invalid.  " + validateErr);
        process.exit(1);
    }
    schemaModel = schemaManager.getEntityModel(schema);
} catch (ex) {
    console.log("Error validating schema. " + ex);
    process.exit(1);
}

if (process.argv.length >= 4) {
    // validate an entity against the schema
    try {
        var entityFile = process.argv[3];
        var entity = JSON.parse(fs.readFileSync(entityFile, 'utf8'));
        var obj = new schemaModel(entity);
        obj.validate(function(err) {
            if (err) {
                console.log("Entity is invalid. " + err);
                process.exit(1);
            } else {
                console.log("Entity is valid.");
                process.exit(0);
            }
        });
    } catch (ex) {
        console.log("Error validating entity. " + ex);
        process.exit(1);
    }
} else {
    console.log("Schema is valid.");
    process.exit(0);
}
