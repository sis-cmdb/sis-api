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
    'use strict';

    var SIS = require("./constants");
    var Manager = require("./manager");
    var Promise = require("bluebird");

    var toRegex = function(str) {
        try {
            if (str instanceof RegExp) {
                return str;
            }
            if (!str || str[0] != '/') {
                return null;
            }
            var splits = str.split('/');
            if (splits.length < 3 || splits[0]) {
                return null;
            }
            var flags = splits.pop();
            splits.shift();
            var regex = splits.join("/");
            if (!regex) {
                return null;
            }
            return new RegExp(regex, flags);
        } catch(ex) {
        }
        return null;
    };

    // patched to prevent schema changes from causing
    // mongoose to barf.  I.e. string field changed to
    // document
    var patchMongoose = function(mongoose) {
        var Document = mongoose.Document;
        var oldInit = Document.prototype.init;
        Document.prototype.init = function(doc, opts, fn) {
            if (!doc) {
                return oldInit.call(this, doc, opts, fn);
            }
            if (typeof doc !== 'object' || doc instanceof Array) {
                doc = { };
            }
            return oldInit.call(this, doc, opts, fn);
        };
        var oldToObj = Document.prototype.toObject;
        Document.prototype.toObject = function(options) {
            if (!this._doc) {
                return oldToObj.call(this, options);
            }
            if (typeof this._doc !== 'object' ||
                !Object.keys(this._doc).length) {
                return { };
            }
            return oldToObj.call(this, options);
        };
        var SchemaString = mongoose.SchemaTypes.String;
        var oldMatch = SchemaString.prototype.match;
        SchemaString.prototype.match = function(regExp, message) {
            if (typeof regExp === 'string') {
                var regex = toRegex(regExp);
                if (!regex) {
                    return this;
                }
                regExp = regex;
            }
            return oldMatch.call(this, regExp, message);
        };

        //
    };

    function SchemaManager(mongoose, opts) {
        this.mongoose = mongoose;
        this.entitySchemaToUpdateTime = { };
        require('./types')(mongoose);
        var sisSchemas = require('./sis-schemas').schemas;
        for (var i = 0; i < sisSchemas.length; ++i) {
            this.getEntityModel(sisSchemas[i]);
        }
        var model = this.getSisModel(SIS.SCHEMA_SCHEMAS);
        Manager.call(this, model, opts);
        if (this.authEnabled) {
            var auth = {};
            auth[SIS.SCHEMA_USERS] = require("./user-manager")(this);
            auth[SIS.SCHEMA_TOKENS] = require("./token-manager")(this);
            this.auth = auth;
        }
        patchMongoose(mongoose);
    }

    require('util').inherits(SchemaManager, Manager);

    // overrides
    SchemaManager.prototype.validate = function(modelObj, isUpdate) {
        if (!modelObj || !modelObj.name || typeof modelObj.name != 'string') {
            return "Schema has an invalid name: " + modelObj.name;
        }
        var ownerError = this.validateOwner(modelObj);
        if (ownerError) {
            return ownerError;
        }

        if (modelObj.name.indexOf("sis_") === 0) {
            return "Schema name is reserved.";
        }

        var locked_fields = modelObj[SIS.FIELD_LOCKED_FIELDS] || [];
        if (!(locked_fields instanceof Array)) {
            return SIS.FIELD_LOCKED_FIELDS + " must be an array.";
        }
        try {
            // object.keys will fail if the var is not an object..
            var fields = Object.keys(modelObj.definition);
            if (!fields.length) {
                return "Cannot add an empty schema.";
            }
            for (var i = 0; i < fields.length; ++i) {
                if (fields[i][0] == '_') {
                    return fields[i] + " is a reserved field";
                }
            }
            // set the model object to have owners
            modelObj.definition[SIS.FIELD_OWNER] = ["String"];
            var mongooseSchema = new this.mongoose.Schema(modelObj.definition, { collection : "__test__" });
            // set the references
            var refs = SIS.UTIL_GET_OID_PATHS(mongooseSchema);
            modelObj[SIS.FIELD_REFERENCES] = refs.map(function(ref) {
                return ref.ref;
            });

            mongooseSchema.eachPath(function(path, schemaType) {
                if (schemaType.instance == "String" &&
                    schemaType.options && schemaType.options.match) {
                    if (!toRegex(schemaType.options.match)) {
                        throw "match " + schemaType.options.match;
                    }
                }
            });

        } catch (ex) {
            return "Schema is invalid: " + ex;
        }
        return null;
    };

    SchemaManager.prototype._invalidateSchema = function(name) {
        delete this.mongoose.modelSchemas[name];
        delete this.mongoose.models[name];
        delete this.entitySchemaToUpdateTime[name];
    };

    SchemaManager.prototype._diffSchemas = function(schema1, schema2) {

        function isNotSisPath(str) {
            return str[0] != '_';
        }

        var addedPaths = [];
        var removedPaths = [];
        var updatedPaths = [];
        var s1Paths = Object.keys(schema1.paths).filter(isNotSisPath).sort();
        var s2Paths = Object.keys(schema2.paths).filter(isNotSisPath).sort();
        // linear diff
        while (s1Paths.length && s2Paths.length) {
            var p1 = s1Paths[0];
            var p2 = s2Paths[0];
            if (p1 === p2) {
                s1Paths.shift();
                s2Paths.shift();
                // check if they are the same type
                var t1 = schema1.path(p1);
                var t2 = schema2.path(p2);
                if (t1.constructor.name !== t2.constructor.name) {
                    updatedPaths.push(p1);
                } else if (JSON.stringify(t1.options) !== JSON.stringify(t2.options)) {
                    updatedPaths.push(p1);
                }
            } else if (p1 < p2) {
                // p1 before p2.  p1 has been removed in s2
                removedPaths.push(p1);
                s1Paths.shift();
            } else {
                // p2 before p1. p2 has been added
                addedPaths.push(p2);
                s2Paths.shift();
            }
        }
        addedPaths = addedPaths.concat(s2Paths);
        removedPaths = removedPaths.concat(s1Paths);
        return [addedPaths, removedPaths, updatedPaths];
    };

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
        var newSchema = this._getMongooseSchema(sisSchema);

        var diff = this._diffSchemas(currentMongooseSchema, newSchema);

        // find all paths that need to be unset/deleted
        var pathsToDelete = diff[1];
        var defChanged = diff.reduce(function(c, paths) {
            return c || paths.length > 0;
        }, false);

        currentSchema[SIS.FIELD_OWNER] = sisSchema[SIS.FIELD_OWNER];
        currentSchema[SIS.FIELD_DESCRIPTION] = sisSchema[SIS.FIELD_DESCRIPTION];
        if (SIS.FIELD_LOCKED in sisSchema) {
            currentSchema[SIS.FIELD_LOCKED] = sisSchema[SIS.FIELD_LOCKED];
        }
        if (SIS.FIELD_LOCKED_FIELDS in sisSchema) {
            currentSchema[SIS.FIELD_LOCKED_FIELDS] = sisSchema[SIS.FIELD_LOCKED_FIELDS];
        }

        if (!defChanged) {
            // definition didn't change so we don't need to delete any models
            // or anything
            return Promise.resolve(currentSchema);
        }

        // update the def and cache
        currentSchema.definition = newDef;
        this._invalidateSchema(name);
        currentMongooseModel = this.getEntityModel(currentSchema);


        if (!pathsToDelete.length) {
            return Promise.resolve(currentSchema);
        }

        var lockedFields = currentSchema[SIS.FIELD_LOCKED_FIELDS] || [];

        var pathsObj = { };
        for (var i = 0; i < pathsToDelete.length; ++i) {
            var path = pathsToDelete[i];
            if (lockedFields.indexOf(path) != -1) {
                return Promise.reject(SIS.ERR_BAD_REQ("Cannot remove field " + path));
            }
            pathsObj[path] = "";
        }

        // need to unset the paths
        var d = Promise.pending();
        currentMongooseModel.update({},{ $unset : pathsObj}, {multi: true, safe : true, strict: false},
            function(err) {
                if (err) {
                    d.reject(SIS.ERR_INTERNAL(err));
                } else {
                    // cleanup the mongoose models and save the new document
                    d.resolve(currentSchema);
                }
            }
        );
        return d.promise;
    };

    SchemaManager.prototype.objectRemoved = function(schema) {
        // schema document is removed.. now delete the
        // mongoose caches
        // and documents for that schema
        var name = schema[SIS.FIELD_NAME];
        var model = this.getEntityModel(schema);
        var collection = model.collection;
        this._invalidateSchema(name);
        // seems very hacky - this is for a race condition
        // exposed by very quick tests that create a collection
        // requiring an index and then drop it shortly after.
        // TODO: needs verification / less hackiness
        var d = Promise.pending();
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
    };

    // additional methods
    SchemaManager.prototype.getSisModel = function(name) {
        return this.mongoose.models[name];
    };

    SchemaManager.prototype.getEntityModelAsync = function(name, callback) {
        var d = Promise.pending();
        var self = this;
        this.model.findOne({name: name}, null, { lean : true }, function(err, schema) {
            if (err) {
                d.reject(SIS.ERR_BAD_REQ("Schema not found with name " + name));
            } else {
                var model = self.getEntityModel(schema);
                if (!model) {
                    d.reject(SIS.ERR_BAD_REQ("Invalid schema found with name " + name));
                } else {
                    d.resolve(model);
                }
            }
        });
        return d.promise.nodeify(callback);
    };

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
    };

    // may throw an exception.
    SchemaManager.prototype._getMongooseSchema = function(sisSchema) {
        // add our special fields..
        var definition = {};
        // only need shallow copy..
        for (var k in sisSchema.definition) {
            definition[k] = sisSchema.definition[k];
        }
        definition[SIS.FIELD_CREATED_AT] = { "type" : "Number", "default" : function() { return Date.now(); } };
        definition[SIS.FIELD_UPDATED_AT] = { "type" : "Number" };
        definition[SIS.FIELD_CREATED_BY] = { "type" : "String" };
        definition[SIS.FIELD_UPDATED_BY] = { "type" : "String" };
        definition[SIS.FIELD_LOCKED] = { type : "Boolean", required : true, "default" : false };

        return this.mongoose.Schema(definition, { collection : sisSchema.name });
    };

    // wrap this so we can handle the error case
    SchemaManager.prototype.getById = function(id, options) {
        var d = Promise.pending();
        var self = this;
        Manager.prototype.getById.call(this, id, options).done(function(result) {
            d.resolve(result);
        }, function(err) {
            self._invalidateSchema(id);
            d.reject(err);
        });
        return d.promise;
    };

    // get a mongoose model back based on the sis schema
    // passed in.  sisSchema would be an object returned by
    // calls like getById
    // the mongoose cached version is returned if available
    // Do not hang on to any of these objects
    SchemaManager.prototype.getEntityModel = function(sisSchema) {
        if (!sisSchema || !sisSchema.name || !sisSchema.definition) {
            return null;
        }
        var name = sisSchema.name;
        var schemaTime = sisSchema[SIS.FIELD_UPDATED_AT] || Date.now();
        if (name in this.mongoose.models) {
            if (this.entitySchemaToUpdateTime[name] == schemaTime) {
                return this.mongoose.models[name];
            } else {
                // invalidate
                this._invalidateSchema(name);
            }
        }
        // convert to mongoose
        try {
            var schema = this._getMongooseSchema(sisSchema);
            var result = this.mongoose.model(name, schema);

            schema.pre('save', function(next) {
                this[SIS.FIELD_UPDATED_AT] = Date.now();
                next();
            });

            // precalculate sis data and store on the schema
            schema._sis_references = SIS.UTIL_GET_OID_PATHS(schema);
            var pathsWithDefaultVal = [];
            schema.eachPath(function(pathName, schemaType) {
                if (schemaType.default()) {
                    pathsWithDefaultVal.push(pathName);
                }
            });
            schema._sis_defaultpaths = pathsWithDefaultVal;

            if ('indexes' in sisSchema) {
                for (var i = 0; i < sisSchema.indexes.length; ++i) {
                    schema.index(sisSchema.indexes[i]);
                }
            }

            this.entitySchemaToUpdateTime[name] = schemaTime;
            this.mongoose.models[name] = result;
            return result;
        } catch (ex) {
            return null;
        }
    };

    SchemaManager.prototype.hasEntityModel = function(name) {
        return name in this.mongoose.models;
    };

    SchemaManager.prototype.getEntityModelByName = function(name) {
        return this.mongoose.models[name];
    };

    SchemaManager.prototype.authorize = function(evt, doc, user, mergedDoc) {
        if (evt == SIS.EVENT_DELETE) {
            if (doc[SIS.FIELD_LOCKED]) {
                return Promise.reject(SIS.ERR_BAD_CREDS("Cannot delete a locked object."));
            }
        }
        // get the permissions on the doc being added/updated/deleted
        var permission = this.getPermissionsForObject(doc, user);
        if (permission != SIS.PERMISSION_ADMIN) {
            return Promise.reject(SIS.ERR_BAD_CREDS("Insufficient permissions."));
        } else if (evt != SIS.EVENT_UPDATE) {
            // insert / delete and user is an admin
            return Promise.resolve(doc);
        }
        var updatedPerms = this.getPermissionsForObject(mergedDoc, user);
        if (updatedPerms != SIS.PERMISSION_ADMIN) {
            return Promise.reject(SIS.ERR_BAD_CREDS("Insufficient permissions."));
        }
        return Promise.resolve(mergedDoc);
    };

    // export
    module.exports = function(mongoose, opts) {
        return new SchemaManager(mongoose, opts);
    };

})();