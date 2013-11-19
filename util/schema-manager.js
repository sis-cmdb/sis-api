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

'use strict';
// A class used to manage the SIS Schemas defined by the /schemas api
// and also help out the /entities apis

// Not all controllers need this and can use mongoose directly
// but we have it here since the schemas and entities controller can benefit
(function() {

    var SIS = require("./constants");
    var Manager = require("./manager");
    var Q = require("q");

    function SchemaManager(mongoose) {
        this.mongoose = mongoose;
        var sisSchemas = require('./sis-schemas').schemas;
        for (var i = 0; i < sisSchemas.length; ++i) {
            this.getEntityModel(sisSchemas[i]);
        }
        var model = this.getSisModel(SIS.SCHEMA_SCHEMAS);
        Manager.call(this, model);
        this.auth = require("./auth")(this);
    }

    SchemaManager.prototype.__proto__ = Manager.prototype;

    // overrides
    SchemaManager.prototype.validate = function(modelObj, isUpdate) {
        if (!modelObj || !modelObj.name || typeof modelObj.name != 'string') {
            return "Schema has an invalid name: " + modelObj.name;
        }
        if (!modelObj.owner ||
            !(typeof modelObj.owner == 'string' ||
              (modelObj.owner instanceof Array && modelObj.owner.length > 0))) {
            return "Schema owner is invalid.";
        }

        if (modelObj.name.indexOf("sis_") == 0) {
            return "Schema name is reserved.";
        }
        try {
            // object.keys will fail if the var is not an object..
            var fields = Object.keys(modelObj.definition);
            if (fields.length == 0) {
                return "Cannot add an empty schema.";
            }
            for (var i = 0; i < fields.length; ++i) {
                if (fields[i][0] == '_') {
                    return fields[i] + " is a reserved field";
                }
            }
            this.mongoose.Schema(modelObj.definition);
        } catch (ex) {
            return "Schema is invalid: " + ex;
        }
        return null;
    }

    SchemaManager.prototype.applyUpdate = function(currentSchema, sisSchema) {
        // now we have the persisted schema document.
        // we will get the mongoose model to unset any fields
        // then we will delete the mongoose cached versions and
        // create a new schema/model using the updated one
        // and finally save the document after it's been converted.
        var self = this;
        var currentMongooseModel = this.getEntityModel(currentSchema);
        var currentMongooseSchema = currentMongooseModel.schema;
        var name = sisSchema.name;

        var newDef = sisSchema.definition;

        // find all paths that need to be unset/deleted
        var pathsToDelete = null;
        currentMongooseSchema.eachPath(function(name, type) {
            if (!(name in newDef) && name[0] != '_') {
                pathsToDelete = pathsToDelete || { };
                pathsToDelete[name] = true;
            }
        });

        // delete the old mongoose models and create new ones
        var deleteCachedAndSaveNew = function() {
            delete self.mongoose.modelSchemas[name];
            delete self.mongoose.models[name];

            self.getEntityModel(newDef);

            // update the document
            currentSchema.definition = newDef;
            return Q(currentSchema);
        }

        if (pathsToDelete) {
            // see http://bites.goodeggs.com/post/36553128854/how-to-remove-a-property-from-a-mongoosejs-schema/
            var d = Q.defer();
            currentMongooseModel.update({},{ $unset : pathsToDelete}, {multi: true, safe : true, strict: false},
                function(err) {
                    if (err) {
                        d.reject(SIS.ERR_INTERNAL(err));
                    } else {
                        // cleanup the mongoose models and save the new document
                        d.resolve(currentSchema);
                    }
                }
            );
            return d.promise.then(deleteCachedAndSaveNew());
        } else {
            // nothing to delete so cleanup the mongoose models and
            // save the new object
            return deleteCachedAndSaveNew();
        }
    }

    SchemaManager.prototype.objectRemoved = function(schema) {
        // schema document is removed.. now delete the
        // mongoose caches
        // and documents for that schema
        var name = schema[SIS.FIELD_NAME];
        var model = this.getEntityModel(schema);
        var collection = model.collection;
        delete this.mongoose.modelSchemas[name];
        delete this.mongoose.models[name];
        // seems very hacky - this is for a race condition
        // exposed by very quick tests that create a collection
        // requiring an index and then drop it shortly after.
        // TODO: needs verification / less hackiness
        var d = Q.defer();
        model.collection.dropIndexes(function(err, reply) {
            model.collection.drop(function(err, reply) {
                // mongoose throws an error if the collection isn't found..
                if (err && err.message != 'ns not found') {
                    // at this point we're in a bad state.. we deleted the instance
                    // but still have documents
                    // TODO: handle this
                    d.reject(SIS.ERR_INTERNAL(err));
                } else {
                    d.resolve(schema);
                }
            });
        });
        return d.promise;
    }

    // additional methods
    SchemaManager.prototype.getSisModel = function(name) {
        return this.mongoose.models[name];
    }

    // Bootstrap mongoose by setting up entity models
    SchemaManager.prototype.bootstrapEntitySchemas = function(callback) {
        var self = this;
        this.model.find({}, function(err, schemas) {
            if (err) { return callback(err); }
            for (var i = 0; i < schemas.length; ++i) {
                if (!self.getEntityModel(schemas[i])) {
                    return callback(SIS.ERR_INTERNAL("Error building schema " + JSON.stringify(schemas[i])));
                }
            }
            callback(null);
        });
    }

    // get a mongoose model back based on the sis schema
    // passed in.  sisSchema would be an object returned by
    // calls like getByName
    // the mongoose cached version is returned if available
    // Do not hang on to any of these objects
    SchemaManager.prototype.getEntityModel = function(sisSchema) {
        if (!sisSchema || !sisSchema.name || !sisSchema.definition) {
            //console.log("getEntityModel: Invalid schema " + JSON.stringify(sisSchema));
            return null;
        }
        var name = sisSchema.name;
        if (name in this.mongoose.models) {
            return this.mongoose.models[name];
        }
        // convert to mongoose
        try {
            // add our special fields..
            var definition = {};
            // only need shallow copy..
            for (var k in sisSchema.definition) {
                definition[k] = sisSchema.definition[k];
            }
            definition[SIS.FIELD_CREATED_AT] = { "type" : "Number", "default" : function() { return Date.now(); } };
            definition[SIS.FIELD_UPDATED_AT] = { "type" : "Number" };

            var schema = this.mongoose.Schema(definition);
            var result = this.mongoose.model(name, schema);

            schema.pre('save', function(next) {
                this[SIS.FIELD_UPDATED_AT] = Date.now();
                next();
            });

            if ('indexes' in sisSchema) {
                for (var i = 0; i < sisSchema.indexes.length; ++i) {
                    schema.index(sisSchema.indexes[i]);
                }
            }

            this.mongoose.models[name] = result;
            return result;
        } catch (ex) {
            // console.log("getEntityModel: Invalid schema " + JSON.stringify(sisSchema) + " w/ ex " + ex);
            return null;
        }
    }

    SchemaManager.prototype.hasEntityModel = function(name) {
        return name in this.mongoose.models;
    }

    SchemaManager.prototype.getEntityModelByName = function(name) {
        return this.mongoose.models[name];
    }

    // export
    module.exports = function(mongoose) {
        return new SchemaManager(mongoose);
    }

})();