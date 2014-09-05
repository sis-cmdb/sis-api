
// A class used to manage the SIS Schemas defined by the /schemas api
// and also help out the /entities apis

// Not all controllers need this and can use mongoose directly
// but we have it here since the schemas and entities controller can benefit

'use strict';

var SIS = require("./constants");
var Manager = require("./manager");
var Promise = require("bluebird");
var jsondiffpatch = require("jsondiffpatch");

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
};

function SchemaManager(mongoose, opts) {
    this.mongoose = mongoose;
    this.entitySchemaToUpdateTime = { };
    require('./types')(mongoose);
    var sisSchemas = require('./sis-schemas').schemas;
    for (var i = 0; i < sisSchemas.length; ++i) {
        this.getEntityModel(sisSchemas[i],true);
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
// only called for entity schemas
SchemaManager.prototype.validate = function(modelObj, toUpdate, options) {
    if (!modelObj || !modelObj.name || typeof modelObj.name != 'string') {
        return "Schema has an invalid name: " + modelObj.name;
    }
    var ownerError = this.validateOwner(modelObj, options);
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
            if ((fields[i][0] == '_' && fields[i] != SIS.FIELD_SIS_META) ||
                (fields[i].indexOf('sis_') === 0 && options.version == "v1")) {
                return fields[i] + " is a reserved field";
            }
        }
        if (modelObj[SIS.FIELD_ID_FIELD] && modelObj[SIS.FIELD_ID_FIELD] != '_id') {
            // ensure it's proper in the definition
            var idField = modelObj[SIS.FIELD_ID_FIELD];
            var idDescriptor = modelObj.definition[idField];
            if (!idDescriptor || typeof idDescriptor != 'object' ||
                !idDescriptor.required || !idDescriptor.unique) {
                return "ID Field must be required and unique.";
            }
        }
        var mongooseSchema = new this.mongoose.Schema(modelObj.definition, { collection : "__test__" });

        var refs = SIS.UTIL_GET_OID_PATHS(mongooseSchema).map(function(ref) {
            return ref.ref;
        });
        if (options.version == "v1") {
            // set the references
            modelObj[SIS.FIELD_REFERENCES] = refs;
        } else {
            // set them on sis meta
            modelObj[SIS.FIELD_SIS_META][SIS.FIELD_REFERENCES] = refs;
        }

        mongooseSchema.eachPath(function(path, schemaType) {
            if (schemaType.instance == "String" &&
                schemaType.options && schemaType.options.match) {
                if (!toRegex(schemaType.options.match)) {
                    throw "match " + schemaType.options.match;
                }
            } else if (options.version == "v1" &&
                       path === "owner" &&
                       (schemaType.constructor.name !== 'SchemaArray' ||
                        !schemaType.caster ||
                        schemaType.caster.instance != "String")) {
                // owner is invalid
                throw "owner must be a String array.";
            }
        });

        // add the default meta def
        var metaDef = { };
        metaDef[SIS.FIELD_OWNER] = ["String"];
        metaDef[SIS.FIELD_ANY_ADMIN_MOD] = { type : "Boolean", default : false };
        modelObj.definition[SIS.FIELD_SIS_META] = metaDef;

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
        var pathName1 = s1Paths[0];
        var pathName2 = s2Paths[0];
        // check if they are the same type
        var path1 = schema1.path(pathName1);
        var path2 = schema2.path(pathName2);
        if (pathName1 === pathName2) {
            s1Paths.shift();
            s2Paths.shift();
            if (path1.constructor.name !== path2.constructor.name) {
                updatedPaths.push([pathName1, path1, path2]);
            } else if (JSON.stringify(path1.options) !== JSON.stringify(path2.options)) {
                updatedPaths.push([pathName1, path1, path2]);
            }
        } else if (pathName1 < pathName2) {
            // p1 before p2.  p1 has been removed in s2
            removedPaths.push([pathName1, path1]);
            s1Paths.shift();
        } else {
            // p2 before p1. p2 has been added
            addedPaths.push([pathName2, path2]);
            s2Paths.shift();
        }
    }
    addedPaths = addedPaths.concat(s2Paths.map(function(p) {
        return [p, schema2.path(p)];
    }));
    removedPaths = removedPaths.concat(s1Paths.map(function(p) {
        return [p, schema1.path(p)];
    }));
    return [addedPaths, removedPaths, updatedPaths];
};

// only called on entity schemas
SchemaManager.prototype.finishUpdate = function(oldSchema, updatedSchema) {
    // do the definition diff
    var self = this;
    var oldMongooseModel = this.getEntityModel(oldSchema);
    var oldMongooseSchema = oldMongooseModel.schema;
    var name = updatedSchema.name;

    var newDef = updatedSchema.definition;
    var newSchema = this._getMongooseSchema(updatedSchema);

    var diff = this._diffSchemas(oldMongooseSchema, newSchema);
    var defChanged = diff.reduce(function(c, paths) {
        return c || paths.length > 0;
    }, false);

    if (!defChanged) {
        // definition didn't change so we don't need to delete any models
        // or anything
        return Promise.resolve(updatedSchema);
    }

    // see if any paths changed that require index changes
    var updatedPaths = diff[2];
    var pathsWithIndecesToRemove = updatedPaths.filter(function(p) {
        var p1Opt = p[1].options || { };
        var p2Opt = p[2].options || { };
        return JSON.stringify(p1Opt.index) !== JSON.stringify(p2Opt.index) ||
            p1Opt.unique != p2Opt.unique;
    });

    pathsWithIndecesToRemove = pathsWithIndecesToRemove.map(function(p) {
        // actual path
        return p[0];
    });

    var indeces = oldMongooseSchema.indexes();
    // invalidate the existing schema
    this._invalidateSchema(name);

    var currentMongooseModel = self.getEntityModel(updatedSchema);
    var collection = Promise.promisifyAll(currentMongooseModel.collection);

    var resultPromise = Promise.resolve(updatedSchema);
    if (pathsWithIndecesToRemove.length) {
        // build up the index objects to remove
        var toRemove = [];
        pathsWithIndecesToRemove.forEach(function(p) {
            indeces.filter(function(idx) {
                return p in idx[0];
            }).forEach(function(idx) {
                toRemove.push(idx);
            });
        });
        if (toRemove.length) {
            resultPromise = resultPromise.then(function() {
                var promises = toRemove.map(function(r) {
                    return collection.dropIndexAsync(r[0], r[1])
                    .then(function(res) {
                        return r;
                    }).catch(function(e) {
                        return r;
                    });
                });
                return Promise.all(promises);
            });
        }
    }

    resultPromise = resultPromise.then(function() {
        var d = Promise.pending();
        currentMongooseModel.ensureIndexes(function(err) {
            d.resolve(updatedSchema);
        });
        return d.promise;
    });

    // find all paths that need to be unset/deleted
    var pathsToDelete = diff[1].map(function(p) { return p[0]; });
    if (!pathsToDelete.length) {
        return resultPromise;
    }

    // build up the path object that we'll use to unset
    // properties
    var pathsObj = pathsToDelete.reduce(function(ret, p) {
        ret[p] = "";
        return ret;
    }, { });

    resultPromise = resultPromise.then(function(currSchema) {
        // unset any indeces
        var toRemove = [];
        pathsToDelete.forEach(function(p) {
            indeces.filter(function(idx) {
                return p in idx[0];
            }).forEach(function(idx) {
                toRemove.push(idx);
            });
        });
        if (toRemove.length) {
            var promises = toRemove.map(function(r) {
                return collection.dropIndexAsync(r[0], r[1])
                .then(function(res) {
                    return r;
                }).catch(function(e) {
                    return r;
                });
            });
            return Promise.all(promises).then(function() {
                return currSchema;
            });
        } else {
            return currSchema;
        }
    });

    if (pathsToDelete.length) {
        resultPromise = resultPromise.then(function(currSchema) {
            return currentMongooseModel.updateAsync({},{ $unset : pathsObj}, {multi: true, safe : true, strict: false})
            .then(function() {
                return updatedSchema;
            });
        });
    }

    return resultPromise;
};

SchemaManager.prototype.applyUpdate = function(currentSchema, updatedSchema) {
    // now we have the persisted schema document.
    // need to set the schema object fields
    // and also validate that the fields being removed
    // do not
    var self = this;
    var currentMongooseModel = this.getEntityModel(currentSchema);
    var currentMongooseSchema = currentMongooseModel.schema;
    var name = updatedSchema.name;

    var newDef = updatedSchema.definition;
    var newSchema = this._getMongooseSchema(updatedSchema);

    var setIfPresent = function(field) {
        if (field in updatedSchema) {
            currentSchema[field] = updatedSchema[field];
        }
    };

    currentSchema[SIS.FIELD_ID_FIELD] = updatedSchema[SIS.FIELD_ID_FIELD] || '_id';
    currentSchema[SIS.FIELD_DESCRIPTION] = updatedSchema[SIS.FIELD_DESCRIPTION];
    // update optional fields that have default vals
    setIfPresent(SIS.FIELD_LOCKED);
    setIfPresent(SIS.FIELD_LOCKED_FIELDS);
    setIfPresent(SIS.FIELD_IS_OPEN);
    setIfPresent(SIS.FIELD_IS_PUBLIC);
    setIfPresent(SIS.FIELD_IMMUTABLE);
    setIfPresent(SIS.FIELD_ANY_ADMIN_MOD);

    currentSchema.definition = newDef;

    // validate the diff against locked fields
    var diff = this._diffSchemas(currentMongooseSchema, newSchema);

    var defChanged = diff.reduce(function(c, paths) {
        return c || paths.length > 0;
    }, false);

    if (!defChanged) {
        // definition didn't change so we don't need to delete any models
        // or anything
        return Promise.resolve(currentSchema);
    }

    // find all paths that need to be unset/deleted
    var pathsToDelete = diff[1].map(function(p) { return p[0]; });
    if (!pathsToDelete.length) {
        return Promise.resolve(currentSchema);
    }

    var lockedFields = currentSchema[SIS.FIELD_LOCKED_FIELDS] || [];
    for (var i = 0; i < pathsToDelete.length; ++i) {
        var path = pathsToDelete[i];
        if (lockedFields.indexOf(path) != -1) {
            return Promise.reject(SIS.ERR_BAD_REQ("Cannot remove field " + path));
        }
    }

    return Promise.resolve(currentSchema);
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

SchemaManager.prototype.getEntityModelAsync = function(name) {
    return this.model.findOneAsync({name: name}, null, { lean : true }).bind(this)
    .then(function(schema) {
        var model = this.getEntityModel(schema);
        if (!model) {
            return Promise.reject(SIS.ERR_BAD_REQ("Invalid schema found with name " + name));
        } else {
            return model;
        }
    }).catch(function(err) {
        if (err instanceof Array) {
            return Promise.reject(err);
        }
        return Promise.reject(SIS.ERR_BAD_REQ("Schema not found with name " + name));
    });
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
SchemaManager.prototype._getMongooseSchema = function(sisSchema, isInternal) {
    // add our special fields..
    var definition = {};
    // only need shallow copy..
    for (var k in sisSchema.definition) {
        definition[k] = sisSchema.definition[k];
    }
    // v1.1. - move these into _sis
    var META_FIELDS = require('./sis-schemas').metaDef;
    var thisMetaDef = definition[SIS.FIELD_SIS_META] || { };
    var ignoredMeta = (isInternal ? sisSchema.ignored_meta : null) || [];

    for (k in META_FIELDS) {
        if (ignoredMeta.indexOf(k) == -1) {
            thisMetaDef[k] = META_FIELDS[k];
        }
    }

    definition[SIS.FIELD_SIS_META] = thisMetaDef;

    return this.mongoose.Schema(definition, { collection : sisSchema.name, versionKey : SIS.FIELD_VERS });
};

// wrap this so we can handle the error case
SchemaManager.prototype.getById = function(id, options) {
    return Manager.prototype.getById.call(this, id, options).bind(this)
        .catch(function(err) {
            this._invalidateSchema(id);
            return Promise.reject(err);
        });
};

// get a mongoose model back based on the sis schema
// passed in.  sisSchema would be an object returned by
// calls like getById
// the mongoose cached version is returned if available
// Do not hang on to any of these objects
SchemaManager.prototype.getEntityModel = function(sisSchema, isInternal) {
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
        var schema = this._getMongooseSchema(sisSchema, isInternal);
        var result = this.mongoose.model(name, schema);
        var pathsWithDefaultVal = [];
        var pathsWithArray = [];
        schema.eachPath(function(pathName, schemaType) {
            if (pathName.indexOf(SIS.FIELD_SIS_META) === 0) {
                return;
            }
            if (schemaType.default()) {
                pathsWithDefaultVal.push(pathName);
            }
            if (schemaType.constructor.name.indexOf('Array') != -1) {
                pathsWithArray.push(pathName);
            }
        });

        // precalculate sis data and store on the schema
        schema._sis_arraypaths = pathsWithArray;
        schema._sis_references = SIS.UTIL_GET_OID_PATHS(schema);
        schema._sis_defaultpaths = pathsWithDefaultVal;

        if ('indexes' in sisSchema && isInternal) {
            for (var i = 0; i < sisSchema.indexes.length; ++i) {
                schema.index(sisSchema.indexes[i]);
            }
        }

        this.entitySchemaToUpdateTime[name] = schemaTime;
        this.mongoose.models[name] = result;
        // promisify the mongoose model
        Promise.promisifyAll(result);
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

SchemaManager.prototype.getPermissionsForObject = function(schema, user) {
    if (schema && schema[SIS.FIELD_IS_OPEN]) {
        return SIS.PERMISSION_ADMIN;
    }
    return Manager.prototype.getPermissionsForObject.call(this, schema, user);
};

SchemaManager.prototype._isPartialAdmin = function(obj, user) {
    var owners = this.getOwners(obj);
    var roles = user[SIS.FIELD_ROLES] || { };
    return owners.some(function(o) {
        return roles[o] == SIS.ROLE_ADMIN;
    });
};

SchemaManager.prototype.authorize = function(evt, doc, user, mergedDoc) {
    var commonErr = this._commonAuth(evt, doc, user, mergedDoc);
    if (commonErr) {
        return Promise.reject(commonErr);
    }
    // get the permissions on the doc being added/updated/deleted
    var permission = this.getPermissionsForObject(doc, user);
    var canOperateOnDoc = permission == SIS.PERMISSION_ADMIN ||
        (doc[SIS.FIELD_ANY_ADMIN_MOD] && this._isPartialAdmin(doc, user));
    if (!canOperateOnDoc) {
        return Promise.reject(SIS.ERR_BAD_CREDS("Insufficient permissions."));
    } else if (evt != SIS.EVENT_UPDATE) {
        // insert / delete and user is an admin
        return Promise.resolve(doc);
    }

    permission = this.getPermissionsForObject(mergedDoc, user);
    canOperateOnDoc = permission == SIS.PERMISSION_ADMIN ||
        (mergedDoc[SIS.FIELD_ANY_ADMIN_MOD] && this._isPartialAdmin(mergedDoc, user));
    if (!canOperateOnDoc) {
        return Promise.reject(SIS.ERR_BAD_CREDS("Insufficient permissions."));
    }
    return Promise.resolve(mergedDoc);
};

// export
module.exports = function(mongoose, opts) {
    return new SchemaManager(mongoose, opts);
};
