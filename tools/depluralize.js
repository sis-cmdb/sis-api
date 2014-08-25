// script that went through and migrated collection names
// since mongoose would pluralize
"use strict";

var mongoose = require('mongoose');
var nconf = require('nconf');
var SIS = require("../util/constants");
var SIS_SCHEMAS = require("../util/sis-schemas").schemas;
require('../util/types')(mongoose);
var config = require('../config');
var async = require('async');

var dryRun = !process.argv.some(function(arg) {
    return arg == '--for-real';
});

if (dryRun) {
    console.log("*** DRY RUN MODE - to run for real, use --for-real ***");
}

nconf.env('__').argv();
nconf.defaults(config);

var renameSchema = function(from, to, collections, idx, callback) {
    if (dryRun) {
        console.log("[DRY RUN] " + from + " -> " + to);
        collections[idx] = to;
        return callback(null, true);
    }
    // ensure the from schema exists
    var db = mongoose.connection.db;
    db.renameCollection(from, to, function(err, c) {
        if (err) {
            return callback("[ERROR] error renaming " + from + " -> " + to + " : " + err);
        }
        console.log("[SUCCESS] " + from + " -> " + to);
        collections[idx] = to;
        return callback(null, true);
    });
};

var migrateSchema = function(schema, collections, callback) {
    var model = mongoose.model(schema.name, schema.definition, false);
    if (!model) {
        return callback("[ERROR] creating model for " + schema.name);
    }
    var mongooseName = model.collection.name;
    var shouldChange = mongooseName != schema.name;
    if (!shouldChange) {
        console.log("[UNCHANGED] " + schema.name);
        return callback(null, false);
    }
    // check if the collection we'd rename to exists.  if it does,
    // leave it alone
    if (collections.indexOf(schema.name) != -1) {
        // already exists
        console.log("[INFO] " + schema.name + " already exists. Not changing.");
        return callback(null, false);
    }

    var sourceIdx = collections.indexOf(mongooseName);
     if (sourceIdx == -1) {
        console.log("[SOURCE DNE] " + mongooseName + " does not exist.");
        return callback(null, false);
    } else {
        // doesn't exist - move it if the source exists
        renameSchema(mongooseName, schema.name, collections, sourceIdx, callback);
    }
};

var migrateSchemas = function(schemas, collections, callback) {
    var tasks = schemas.map(function(schema) {
        return function(cb) {
            migrateSchema(schema, collections, cb);
        };
    });
    async.series(tasks, callback);
};

var exit = function(status) {
    mongoose.connection.close();
    process.exit(status);
};

var opts = nconf.get('db').opts || { };
mongoose.connect(nconf.get('db').url, opts, function(err) {
    if (err) {
        console.log("[ERROR] can't connect to db.");
        return exit(1);
    }
    var db = mongoose.connection.db;
    db.collectionNames(null, { namesOnly : true }, function(err, collections) {
        if (err) {
            console.log("[ERROR] failed to fetch collections.");
            return exit(1);
        }
        collections = collections.map(function(coll) {
            return coll.substring(db.databaseName.length + 1);
        });
        // iterate sis schemas and migrate them if necessary
        migrateSchemas(SIS_SCHEMAS, collections, function(err, result) {
            if (err) {
                console.log(err);
                return exit(1);
            }
            // do the entities
            db.collection(SIS.SCHEMA_SCHEMAS).find().toArray(function(err, res) {
                if (err) {
                    console.log("[ERROR] fetching entity schemas failed. " + err);
                    return exit(1);
                }
                if (!res.length) {
                    console.log("[INFO] no entity schemas to migrate.");
                    return exit(0);
                }
                migrateSchemas(res, collections, function(err) {
                    var status = 0;
                    if (err) {
                        console.log(err);
                        status = 1;
                    }
                    return exit(status);
                });
            });
        });
    });

});
