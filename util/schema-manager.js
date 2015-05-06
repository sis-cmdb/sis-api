
// A class used to manage the SIS Schemas defined by the /schemas api
// and also help out the /entities apis

// Not all controllers need this and can use mongoose directly
// but we have it here since the schemas and entities controller can benefit

'use strict';

var SIS = require("./constants");
var Manager = require("./manager");
var BPromise = require("bluebird");
var jsondiffpatch = require("jsondiffpatch");
var logger = require("./logger");

var LOGGER = logger.createLogger({
    name : "SchemaManager"
});

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
        this.auth = auth;
        // a token manager that is not associated with a user name
        this.tokenFetcher = require("./token-manager")(this, null);
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
            } else if (typeof modelObj.definition[fields[i]] === 'object') {
                // if it is empty, convert to mixed
                if (!Object.keys(modelObj.definition[fields[i]]).length) {
                    modelObj.definition[fields[i]] = { type : "Mixed" };
                }
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
        var mongooseSchema = new this.mongoose.Schema(modelObj.definition, { collection : "__test__", autoIndex: false, versionKey : SIS.FIELD_VERS });
        mongooseSchema.eachPath(function(path, schemaType) {
            if (schemaType.instance == "String" &&
                schemaType.options && schemaType.options.match) {
                if (!toRegex(schemaType.options.match)) {
                    throw "match " + schemaType.options.match;
                }
            } else if (options.version == "v1" && path === "owner") {
                if (schemaType.constructor.name !== 'SchemaArray' ||
                    !schemaType.caster ||
                    schemaType.caster.instance != "String") {
                    // owner is invalid
                    throw "owner must be a String array.";
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
        return BPromise.resolve(updatedSchema);
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
    var collection = BPromise.promisifyAll(currentMongooseModel.collection);

    var resultPromise = BPromise.resolve(updatedSchema);
    if (pathsWithIndecesToRemove.length) {
        // build up the index objects to remove
        var toRemove = [];
        pathsWithIndecesToRemove.forEach(function(p) {
            indeces.filter(function(index) {
                return p in index[0];
            }).forEach(function(index) {
                toRemove.push(index);
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
                return BPromise.all(promises);
            });
        }
    }

    resultPromise = resultPromise.then(function() {
        return updatedSchema;
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
            return BPromise.all(promises).then(function() {
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
    // meta fields already updated
    setIfPresent(SIS.FIELD_LOCKED_FIELDS);
    setIfPresent(SIS.FIELD_IS_OPEN);
    setIfPresent(SIS.FIELD_IS_PUBLIC);
    setIfPresent(SIS.FIELD_ANY_ADMIN_MOD);
    setIfPresent(SIS.FIELD_TRACK_HISTORY);

    currentSchema.definition = newDef;

    // validate the diff against locked fields
    var diff = this._diffSchemas(currentMongooseSchema, newSchema);

    var defChanged = diff.reduce(function(c, paths) {
        return c || paths.length > 0;
    }, false);

    if (!defChanged) {
        // definition didn't change so we don't need to delete any models
        // or anything
        return BPromise.resolve(currentSchema);
    }

    // find all paths that need to be unset/deleted
    var pathsToDelete = diff[1].map(function(p) { return p[0]; });
    if (!pathsToDelete.length) {
        return BPromise.resolve(currentSchema);
    }

    var lockedFields = currentSchema[SIS.FIELD_LOCKED_FIELDS] || [];
    for (var i = 0; i < pathsToDelete.length; ++i) {
        var path = pathsToDelete[i];
        if (lockedFields.indexOf(path) != -1) {
            return BPromise.reject(SIS.ERR_BAD_REQ("Cannot remove field " + path));
        }
    }

    return BPromise.resolve(currentSchema);
};

SchemaManager.prototype.objectRemoved = function(schema) {
    // schema document is removed.. now delete the
    // mongoose caches
    // and documents for that schema
    var name = schema[SIS.FIELD_NAME];
    var model = this.getEntityModel(schema);
    var collection = model.collection;
    this._invalidateSchema(name);
    // TODO: handle the error when the collection is busy
    // i.e. index being created
    var d = BPromise.pending();
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
            return BPromise.reject(SIS.ERR_BAD_REQ("Invalid schema found with name " + name));
        } else {
            return model;
        }
    }).catch(function(err) {
        if (err instanceof Array) {
            return BPromise.reject(err);
        }
        return BPromise.reject(SIS.ERR_BAD_REQ("Schema not found with name " + name));
    });
};

// Bootstrap mongoose by setting up entity models
SchemaManager.prototype.bootstrapEntitySchemas = function(callback) {
    var self = this;
    this.model.find({}, null, { lean : true }, function(err, schemas) {
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

    if (!isInternal) {
        // add the default meta def for entities
        thisMetaDef[SIS.FIELD_OWNER] = ["String"];
        thisMetaDef[SIS.FIELD_ANY_ADMIN_MOD] = { type : "Boolean", default : false };
    }

    definition[SIS.FIELD_SIS_META] = thisMetaDef;

    return this.mongoose.Schema(definition, { collection : sisSchema.name, versionKey : SIS.FIELD_VERS });
};

function withCounts(options) {
    return options && options.query &&
           options.query.with_counts === 'true';
}

// wrap this so we can handle the error case
SchemaManager.prototype.getById = function(id, options) {
    return Manager.prototype.getById.call(this, id, options)
    .bind(this).then(function(schema) {
        // check for with_counts
        if (!withCounts(options)) {
            // early exit
            return schema;
        }
        // get the number of items in the schema
        var entityModel = this.getEntityModel(schema);
        return entityModel.countAsync({}).then(function(count) {
            schema[SIS.FIELD_ENTITY_COUNT] = count;
            return schema;
        });
    }).catch(function(err) {
        this._invalidateSchema(id);
        return BPromise.reject(err);
    });
};

// handle the with_counts in get all also
SchemaManager.prototype.getAll = function(condition, options, fields) {
    var p = Manager.prototype.getAll.call(this, condition, options, fields);
    return p.bind(this).then(function(schemas) {
        if (!withCounts(options)) {
            return schemas;
        }
        var self = this;
        return BPromise.map(schemas, function(schema) {
            var entityModel = self.getEntityModel(schema);
            return entityModel.countAsync({}).then(function(count) {
                schema[SIS.FIELD_ENTITY_COUNT] = count;
                return schema;
            });
        });
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
    if (sisSchema[SIS.FIELD_CREATED_AT] ||
        !sisSchema[SIS.FIELD_SIS_META]) {
        // convert it
        sisSchema = SIS.UTIL_FROM_V1(sisSchema);
    }
    var name = sisSchema.name;
    var sisMeta = sisSchema[SIS.FIELD_SIS_META] || {};
    var schemaTime = sisMeta[SIS.FIELD_UPDATED_AT] || Date.now();
    if (name in this.mongoose.models) {
        if (this.entitySchemaToUpdateTime[name] === schemaTime) {
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
            if (pathName.indexOf(SIS.FIELD_SIS_META) === 0 ||
                pathName === '_id') {
                return;
            }
            if (schemaType.constructor.name.indexOf('Array') != -1) {
                pathsWithArray.push(pathName);
            } else if (schemaType.default()) {
                pathsWithDefaultVal.push(pathName);
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
            if (sisSchema.indexes.length) {
                result.ensureIndexes();
            }
        }

        this.entitySchemaToUpdateTime[name] = schemaTime;
        this.mongoose.models[name] = result;
        // promisify the mongoose model
        BPromise.promisifyAll(result);
        return result;
    } catch (ex) {
        LOGGER.error({ err : ex }, "Error getting entity model");
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

SchemaManager.prototype._preSave = function(obj) {
    var mongooseSchema = new this.mongoose.Schema(obj.definition, { collection : "__test__", autoIndex: false, versionKey : SIS.FIELD_VERS });
    var refs = SIS.UTIL_GET_OID_PATHS(mongooseSchema).map(function(ref) {
        return ref.ref;
    });
    obj[SIS.FIELD_SIS_META][SIS.FIELD_REFERENCES] = refs;
    return BPromise.resolve(obj);
};

SchemaManager.prototype.preAdd = function(obj) {
    var definition = obj.definition || { };
    function isCandidate(fieldName) {
        return typeof definition[fieldName] === 'object' &&
            definition[fieldName].required &&
            definition[fieldName].unique;
    }
    // figure out the ID field and set it
    if (!obj.id_field || obj.id_field === SIS.FIELD_ID) {
        // find one that might be better from the top level
        if (isCandidate('name')) {
            obj.id_field = 'name';
        } else if (isCandidate('id')) {
            obj.id_field = 'id';
        } else {
            // find first..
            var topFields = Object.keys(definition);
            for (var i = 0; i < topFields.length; ++i) {
                if (isCandidate(topFields[i])) {
                    obj.id_field = topFields[i];
                    break;
                }
            }
        }
    }
    return BPromise.resolve(obj);
};

SchemaManager.prototype.authorize = function(evt, doc, user, mergedDoc) {
    var commonErr = this._commonAuth(evt, doc, user, mergedDoc);
    if (commonErr) {
        return BPromise.reject(commonErr);
    }
    // get the permissions on the doc being added/updated/deleted
    var permission = this.getPermissionsForObject(doc, user);
    var canOperateOnDoc = permission == SIS.PERMISSION_ADMIN ||
        (doc[SIS.FIELD_ANY_ADMIN_MOD] && this._isPartialAdmin(doc, user));
    if (!canOperateOnDoc) {
        return BPromise.reject(SIS.ERR_BAD_CREDS("Insufficient permissions."));
    } else if (evt != SIS.EVENT_UPDATE) {
        // insert / delete and user is an admin
        return BPromise.resolve(doc);
    }

    permission = this.getPermissionsForObject(mergedDoc, user);
    canOperateOnDoc = permission == SIS.PERMISSION_ADMIN ||
        (mergedDoc[SIS.FIELD_ANY_ADMIN_MOD] && this._isPartialAdmin(mergedDoc, user));
    if (!canOperateOnDoc) {
        return BPromise.reject(SIS.ERR_BAD_CREDS("Insufficient permissions."));
    }
    return BPromise.resolve(mergedDoc);
};

// get a token manager for the particular user
SchemaManager.prototype.getTokenManagerForUser = function(username) {
    if (!this.authEnabled) {
        return null;
    }
    return require("./token-manager")(this, username);
};

// export
module.exports = function(mongoose, opts) {
    return new SchemaManager(mongoose, opts);
};
