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

// Manager for entities
(function() {
    'use strict';

    var Manager = require("./manager");
    var Promise = require("bluebird");
    var SIS = require("./constants");

    //////////
    // Entity manager
    function EntityManager(model, schema, opts) {
        this.schema = schema;
        Manager.call(this, model, opts);
        this.sm = opts[SIS.OPT_SCHEMA_MGR];
        this.mixedTypes = [];
        var self = this;
        model.schema.eachPath(function(pathName, type) {
            if (type.options && type.options.type == "Mixed") {
                self.mixedTypes.push(pathName);
            }
        });
    }

    // inherit
    require('util').inherits(EntityManager, Manager);

    EntityManager.prototype.fixSubObject = function(entity, reference, isUpdate) {
        var obj = entity;
        // operate on a copy
        reference = reference.slice(0);
        var last = reference.pop();
        for (var i = 0; i < reference.length; ++i) {
            var path = reference[i];
            if (path in obj) {
                obj = path[obj];
            } else {
                // done - it's not set
                return null;
            }
        }
        // check if we have the object and
        // the path is in it
        if (!obj || !(last in obj)) {
            // nothing
            return null;
        }
        var subDoc = obj[last];
        if (typeof subDoc == 'object') {
            if (!isUpdate) {
                return "Unable to add reference document.  Must be an object id";
            } else {
                if (!(SIS.FIELD_ID in subDoc)) {
                    // nuke the entry
                    delete obj[last];
                } else {
                    // set it
                    obj[last] = subDoc[SIS.FIELD_ID];
                }
            }
        }
        return null;
    };

    // validate the entity
    EntityManager.prototype.validate = function(entity, isUpdate) {
        var keys = Object.keys(entity);
        var i = 0;
        if (isUpdate) {
            // remove reserved fields..
            for (i = 0; i < keys.length; ++i) {
                var rf = keys[i];
                if (rf[0] == '_') {
                    delete entity[rf];
                }
            }
            keys = Object.keys(entity);
        }
        try {
            if (!keys.length) {
                return "entity cannot be empty";
            }
            for (i = 0; i < keys.length; ++i) {
                if (keys[i][0] == '_') {
                    return keys[i] + " is a reserved field";
                }
            }
            // // handle sub objects
            // for (var i = 0; i < this.references.length; ++i) {
            //     var err = this.fixSubObject(entity, this.references[i], isUpdate);
            //     if (err) {
            //         return err;
            //     }
            // }
            if (SIS.FIELD_OWNER in entity) {
                if (entity[SIS.FIELD_OWNER] instanceof Array &&
                    !entity[SIS.FIELD_OWNER].length) {
                    // let the authorize call take care of setting
                    // sub owners
                    return null;
                }
                var err = this.validateOwner(entity);
                if (err) {
                    return err;
                }
                // ensure the document is a subset of owners of the schema
                var owners = entity[SIS.FIELD_OWNER];
                var schemaOwners = this.schema[SIS.FIELD_OWNER];
                for (i = 0; i < owners.length; ++i) {
                    if (schemaOwners.indexOf(owners[i]) == -1) {
                        // must be a subset
                        return "entity owners must be a subset of the schema owners.";
                    }
                }
            }
        } catch (ex) {
            return "cannot be empty or is not an object " + ex;
        }
        return null;
    };

    function getOwnerSubset(user, schema) {
        if (!user[SIS.FIELD_ROLES]) {
            return [];
        }
        var schemaOwners = schema[SIS.FIELD_OWNER];
        var userRoles = Object.keys(user[SIS.FIELD_ROLES]);
        return userRoles.filter(function(owner) {
            return schemaOwners.indexOf(owner) != -1;
        });
    }

    EntityManager.prototype.authorize = function(evt, doc, user, mergedDoc) {
        if (!this.authEnabled) {
            return Manager.prototype.authorize.call(this, evt, doc, user, mergedDoc);
        }
        if (user[SIS.FIELD_SUPERUSER]) {
            return Manager.prototype.authorize.call(this, evt, doc, user, mergedDoc);
        }
        if (this.schema[SIS.FIELD_IS_OPEN]) {
            var userGroups = user[SIS.FIELD_ROLES] ? Object.keys(user[SIS.FIELD_ROLES]) : [];
            if (!userGroups.length) {
                return SIS.ERR_BAD_REQ("User must have roles assigned.");
            }
            if (mergedDoc && !mergedDoc[SIS.FIELD_OWNER]) {
                mergedDoc[SIS.FIELD_OWNER] = userGroups;
            } else if (!doc[SIS.FIELD_OWNER]) {
                doc[SIS.FIELD_OWNER] = userGroups;
            }
            return Manager.prototype.authorize.call(this, evt, doc, user, mergedDoc);
        }
        // authorize against entity subset or schema
        var ownerSubset = getOwnerSubset(user, this.schema);
        if (!ownerSubset.length) {
            return Promise.reject(SIS.ERR_BAD_CREDS("Insufficient privileges to operate on entities in this schema."));
        }
        if (!doc[SIS.FIELD_OWNER] || !doc[SIS.FIELD_OWNER].length) {
            doc[SIS.FIELD_OWNER] = ownerSubset;
        }
        if (mergedDoc && !mergedDoc[SIS.FIELD_OWNER]) {
            mergedDoc[SIS.FIELD_OWNER] = ownerSubset;
        }
        return Manager.prototype.authorize.call(this, evt, doc, user, mergedDoc);
    };

    var getValueForPath = function(path, obj) {
        if (!obj) {
            return null;
        }
        var paths = path.split(".");
        for (var i = 0; i < paths.length; ++i) {
            var p = paths[i];
            obj = obj[p];
            if (!obj) {
                return null;
            }
        }
        return obj;
    };

    // get a single object by id.
    EntityManager.prototype.getById = function(id, options) {
        // id could be _id or idField
        var idField = this.schema[SIS.FIELD_ID_FIELD];
        var q = {};
        if (idField && idField != '_id') {
            // try getting it like this first
            q[idField] = id;
            return this.getSingleByCondition(q, id, options)
                .bind(this).catch(function(err) {
                // fallback to _id
                q = {}; q._id = id;
                return this.getSingleByCondition(q, id, options);
            });
        } else {
            // use _id
            q._id = id;
            return this.getSingleByCondition(q, id, options);
        }
    };

    EntityManager.prototype.canInsertWithId = function(id, obj) {
        var idField = this.schema[SIS.FIELD_ID_FIELD];
        return idField && idField != '_id' && obj[idField] == id;
    };


    EntityManager.prototype.applyUpdate = function(result, entity) {
        // save old mixed paths
        var oldMixed = this.mixedTypes.reduce(function(ret, p) {
            ret[p] = result.get(p);
            return ret;
        }, { });
        result.set(entity);
        // restore mixed objects w/ merge
        this.mixedTypes.forEach(function(p) {
            var old = oldMixed[p];
            var entityVal = getValueForPath(p, entity);
            this.applyPartial(old, entityVal);
            result.set(p, old);
            result.markModified(p);
        }.bind(this));
        return result;
    };

    EntityManager.prototype.getEnsureReferencePromise = function(ref, obj) {
        var currObj = obj;
        var path = null;
        var refPaths = ref.splits;
        for (var i = 0; i < refPaths.length; ++i) {
            path = refPaths[i];
            if (!(path in currObj)) {
                // no id @ path - it's ok
                return Promise.resolve(true);
            }
            currObj = currObj[path];
        }
        if (!currObj) {
            // no value @ path - it's ok
            return Promise.resolve(true);
        }
        path = ref.path;
        var schema = this.model.schema;
        var refModelName = ref.ref;
        var d = null;
        if (ref.type == 'oid') {
            if (typeof currObj === 'object' &&
                currObj.constructor.name !== "ObjectID") {
                if (SIS.FIELD_ID in currObj) {
                    currObj = currObj[SIS.FIELD_ID];
                } else {
                    return Promise.reject(SIS.ERR_BAD_REQ("Reference Object has no _id"));
                }
            }
            return this.sm.getEntityModelAsync(refModelName).then(function(model) {
                if (!model) {
                    return Promise.reject(SIS.ERR_BAD_REQ("No schema named " + refModelName));
                }
                return model.findOneAsync({'_id' : currObj}, '_id', {lean : true}).then(function(r) {
                    if (!r) {
                        return Promise.reject(SIS.ERR_BAD_REQ("Reference with id " + currObj + " does not exist."));
                    } else {
                        return true;
                    }
                });
            })
            .catch(function(err) {
                if (err instanceof Array) {
                    return Promise.reject(err);
                }
                return Promise.reject(SIS.ERR_INTERNAL(err));
            });
        } else {
            // array of oids
            if (!(currObj instanceof Array)) {
                currObj = [currObj];
            }
            currObj = currObj.filter(function(o) {
                return o !== null;
            });
            var errored = false;
            currObj.map(function(obj) {
                if (typeof obj === 'object' &&
                    obj.constructor.name !== "ObjectID") {
                    if (SIS.FIELD_ID in obj) {
                        return obj[SIS.FIELD_ID];
                    } else {
                        errored = true;
                    }
                }
                return obj;
            });
            if (errored) {
                return Promise.reject(SIS.ERR_BAD_REQ("Reference Object has no _id field"));
            }
            return this.sm.getEntityModelAsync(refModelName).then(function(model) {
                if (!model) {
                    return Promise.reject(SIS.ERR_BAD_REQ("No schema named " + refModelName));
                }
                return model.findAsync({ '_id' : { "$in" : currObj }}, '_id', {lean : true}).then(function(r) {
                    if (!r || r.length != currObj.length) {
                        return Promise.reject(SIS.ERR_BAD_REQ("Some IDs do not exist in " + JSON.stringify(currObj)));
                    } else {
                        return true;
                    }
                });
            })
            .catch(function(err) {
                if (err instanceof Array) {
                    return Promise.reject(err);
                }
                return Promise.reject(SIS.ERR_INTERNAL(err));
            });
        }
    };

    EntityManager.prototype.ensureReferences = function(obj) {
        var references = this.getReferences();
        if (!references.length || !obj) {
            return Promise.resolve(obj);
        }
        // convert to POJO
        var result = obj;
        if (obj.toObject) {
            obj = obj.toObject();
        }
        // ensure the references exist
        var self = this;
        var promises = references.map(function(ref) {
            return self.getEnsureReferencePromise(ref, obj);
        });
        return Promise.all(promises).then(function() {
            return Promise.resolve(result);
        });
    };

    EntityManager.prototype._preSave = function(obj) {
        // ensure references
        return this.ensureReferences(obj);
    };
    //////////

    module.exports = function(model, schema, opts) {
        return new EntityManager(model, schema, opts);
    };

})();
