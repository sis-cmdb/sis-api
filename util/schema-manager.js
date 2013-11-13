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

    // Take in a mongoose that's already been initialized.
    var SchemaManager = function(mongoose) {

        // this..
        var self = this;

        var SIS = require('./constants');

        // initializer funct
        var init = function() {
            var sisSchemas = require('./sis-schemas').schemas;
            for (var i = 0; i < sisSchemas.length; ++i) {
                self.getEntityModel(sisSchemas[i]);
            }

            // Get the model from the definition and name
            self.model = self.getSisModel(SIS.SCHEMA_SCHEMAS);
        }

        this.getSisModel = function(name) {
            return mongoose.models[name];
        }

        // Bootstrap mongoose by setting up entity models
        this.bootstrapEntitySchemas = function(callback) {
            self.model.find({}, function(err, schemas) {
                if (err) { return callback(err); }
                for (var i = 0; i < schemas.length; ++i) {
                    if (!self.getEntityModel(schemas[i])) {
                        return callback("Error building schema " + JSON.stringify(schemas[i]));
                    }
                }
                callback(null);
            });
        }

        // Get all the SIS Schemas in the system
        this.getAll = function(condition, options, callback) {
            self.model.find(condition, null, options, callback);
        }

        // Get a SIS Schema by name
        this.getByName = function(name, callback) {
            self.model.findOne({"name" : name}, callback);
        }

        var validateSchemaObject = function(modelObj) {
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
                mongoose.Schema(modelObj.definition);
            } catch (ex) {
                return "Schema is invalid: " + ex;
            }
            return null;
        }

        // Add a SIS Schema.  The modelObj must have the following properties:
        // - "name" : "Schema Name" - cannot be empty
        // - "definition" : <json_object> that is a mongoose schema
        this.addSchema = function(modelObj, callback) {
            var err = validateSchemaObject(modelObj);
            if (err) {
                callback(err, null);
                return;
            }
            // Valid schema, so now we can create a SIS Schema object to persist
            var entity = new self.model(modelObj);
            // TODO: need to cleanup the entity returned to callback
            entity.save(callback);
        }

        // get a mongoose model back based on the sis schema
        // passed in.  sisSchema would be an object returned by
        // calls like getByName
        // the mongoose cached version is returned if available
        // Do not hang on to any of these objects
        this.getEntityModel = function(sisSchema) {
            if (!sisSchema || !sisSchema.name || !sisSchema.definition) {
                //console.log("getEntityModel: Invalid schema " + JSON.stringify(sisSchema));
                return null;
            }
            var name = sisSchema.name;
            if (name in mongoose.models) {
                return mongoose.models[name];
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

                var schema = mongoose.Schema(definition);
                var result = mongoose.model(name, schema);

                schema.pre('save', function(next) {
                    this[SIS.FIELD_UPDATED_AT] = Date.now();
                    next();
                });

                if ('indexes' in sisSchema) {
                    for (var i = 0; i < sisSchema.indexes.length; ++i) {
                        schema.index(sisSchema.indexes[i]);
                    }
                }

                mongoose.models[name] = result;
                return result;
            } catch (ex) {
                // console.log("getEntityModel: Invalid schema " + JSON.stringify(sisSchema) + " w/ ex " + ex);
                return null;
            }
        }

        // Update an object schema
        this.updateSchema = function(sisSchema, callback) {
            var err = validateSchemaObject(sisSchema);
            if (err) {
                callback(err, null);
                return;
            }
            // get the existing schema document
            this.getByName(sisSchema.name, function(err, currentSchema) {
                if (err || !currentSchema) {
                    callback(err, null);
                    return;
                }

                // now we have the persisted schema document.
                // we will get the mongoose model to unset any fields
                // then we will delete the mongoose cached versions and
                // create a new schema/model using the updated one
                // and finally save the document after it's been converted.

                var currentMongooseModel = self.getEntityModel(currentSchema);
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

                var oldValue = currentSchema.toObject();

                // delete the old mongoose models and create new ones
                var deleteCachedAndSaveNew = function() {
                    delete mongoose.modelSchemas[name];
                    delete mongoose.models[name];

                    self.getEntityModel(newDef);

                    // update the document
                    currentSchema.definition = newDef;
                    currentSchema.save(function(err, savedSchema) {
                        callback(err, savedSchema, oldValue);
                    });
                }

                if (pathsToDelete) {
                    // see http://bites.goodeggs.com/post/36553128854/how-to-remove-a-property-from-a-mongoosejs-schema/
                    currentMongooseModel.update({},{ $unset : pathsToDelete}, {multi: true, safe : true, strict: false},
                        function(err) {
                            if (err) {
                                callback(err, null);
                            } else {
                                // cleanup the mongoose models and save the new document
                                deleteCachedAndSaveNew();
                            }
                        }
                    );
                } else {
                    // nothing to delete so cleanup the mongoose models and
                    // save the new object
                    deleteCachedAndSaveNew();
                }

            });
        }

        // Delete a schema by name.  This will also remove all entities
        // associated with that schema
        this.deleteSchema = function(name, callback) {
            this.getByName(name, function(err, schema) {
                if (err || !schema) {
                    err = err || "Schema does not exist";
                    callback(err, false);
                    return;
                }
                // need to delete the schema document from mongo
                schema.remove(function(err) {
                    if (err) {
                        callback(err, false);
                        return;
                    }
                    // schema document is removed.. now delete the
                    // mongoose caches
                    // and documents for that schema
                    var model = self.getEntityModel(schema);
                    var collection = model.collection;
                    delete mongoose.modelSchemas[name];
                    delete mongoose.models[name];
                    // seems very hacky - this is for a race condition
                    // exposed by very quick tests that create a collection
                    // requiring an index and then drop it shortly after.
                    // TODO: needs verification / less hackiness
                    model.collection.dropIndexes(function(err, reply) {
                        model.collection.drop(function(err, reply) {
                            // mongoose throws an error if the collection isn't found..
                            if (err && err.message != 'ns not found') {
                                // at this point we're in a bad state.. we deleted the instance
                                // but still have documents
                                // TODO: handle this
                                callback(err, false);
                            } else {
                                callback(null, schema);
                            }
                        });
                    });
                });
            });
        }

        init();
    }

    module.exports = function(mongoose) {
        return new SchemaManager(mongoose);
    }

})();