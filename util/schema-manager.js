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

// A class used to manage the SIS Schemas defined by the /schemas api
// and also help out the /entities apis

// Not all controllers need this and can use mongoose directly
// but we have it here since the schemas and entities controller can benefit
(function() {

    // Take in a mongoose that's already been initialized.
    var SchemaManager = function(mongoose) {

        // A mongoose.model object for SIS Schemas
        var SisSchemaModel = null;
        // this..
        var self = this;

        this.reservedFields = {
            "_id" : true,
            "__v" : true
        };

        // reserved schemas
        this.HIERA_SCHEMA_NAME = "sis_hiera";
        this.SIS_SCHEMA_NAME = "sis_schemas";
        this.SIS_HOOK_SCHEMA_NAME = "sis_hooks";

        this.reservedSchemas = {
            "sis_hiera" : true,
            "sis_schemas" : true,
            "sis_hooks" : true
        };

        // initializer funct
        var init = function() {
            // Set up the mongoose.Schema for a SIS Schema
            var definition = {
                "name" : {"type" : "String", "required" : true, "unique" : true, match : /^[a-z0-9_]+$/ },
                "owner" : { "type" : "String", "required" : true },
                "definition" : { "type" : {}, "required" : true }
            }
            var name = self.SIS_SCHEMA_NAME;
            // Get the model from the definition and name
            SisSchemaModel = self.getEntityModel({name : name, definition : definition});
        }

        // Get all the SIS Schemas in the system
        this.getAll = function(condition, options, callback) {
            SisSchemaModel.find(condition, null, options, callback);
        }

        // Get a SIS Schema by name
        this.getByName = function(name, callback) {
            SisSchemaModel.findOne({"name" : name}, callback);
        }

        var validateSchemaObject = function(modelObj) {
            if (!modelObj || !modelObj.name || typeof modelObj.name != 'string') {
                return "Schema has an invalid name.";
            }
            if (typeof modelObj.owner != 'string') {
                return "Schema has an invalid owner.";
            }

            if (modelObj.name in self.reservedSchemas) {
                return "Schema name is reserved.";
            }
            try {
                // object.keys will fail if the var is not an object..
                var fields = Object.keys(modelObj.definition);
                if (fields.length == 0) {
                    return "Cannot add an empty schema.";
                }
                for (var i = 0; i < fields.length; ++i) {
                    if (fields[i] in self.reservedFields) {
                        return fields[i] + " is a reserved field";
                    }
                }
                var testSchema = mongoose.Schema(modelObj.definition);
                if (!testSchema) {
                    return "Schema is invalid";
                }
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
            var entity = new SisSchemaModel(modelObj);
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
                console.log("getEntityModel: Invalid schema " + JSON.stringify(sisSchema));
                return null;
            }
            var name = sisSchema.name;
            if (name in mongoose.models) {
                return mongoose.models[name];
            }
            // convert to mongoose
            try {
                var schema = mongoose.Schema(sisSchema.definition);
                return mongoose.model(name, schema);
            } catch (ex) {
                console.log("getEntityModel: Invalid schema " + JSON.stringify(sisSchema) + " w/ ex " + ex);
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
                    err = err || "Schema does not exist";
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
                    if (!(name in newDef) && !(name in self.reservedFields)) {
                        pathsToDelete = pathsToDelete || { };
                        pathsToDelete[name] = true;
                    }
                });

                // delete the old mongoose models and create new ones
                var deleteCachedAndSaveNew = function() {
                    delete mongoose.modelSchemas[name];
                    delete mongoose.models[name];

                    var schema = mongoose.Schema(sisSchema.definition);
                    mongoose.model(name, schema);

                    // update the document
                    currentSchema.definition = newDef;
                    currentSchema.save(callback);
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
                SisSchemaModel.remove({ "name" : name }, function(err) {
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