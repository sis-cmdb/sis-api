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
    var Q = require("q");
    var SIS = require("./constants");
    var async = require("async");

    //////////
    // Entity manager
    function EntityManager(model, schema, opts) {
        this.schema = schema;
        Manager.call(this, model, opts);
        this.sm = opts[SIS.OPT_SCHEMA_MGR];
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
            return Q(mergedDoc || doc);
        }
        if (user[SIS.FIELD_SUPERUSER]) {
            return Q(mergedDoc || doc);
        }
        // authorize against entity subset or schema
        var ownerSubset = getOwnerSubset(user, this.schema);
        if (!ownerSubset.length) {
            return Q.reject(SIS.ERR_BAD_CREDS("Insufficient privileges to operate on entities in this schema."));
        }
        if (!doc[SIS.FIELD_OWNER] || !doc[SIS.FIELD_OWNER].length) {
            doc[SIS.FIELD_OWNER] = ownerSubset;
        }
        if (mergedDoc && !mergedDoc[SIS.FIELD_OWNER]) {
            mergedDoc[SIS.FIELD_OWNER] = ownerSubset;
        }
        return Manager.prototype.authorize.call(this, evt, doc, user, mergedDoc);
    };

    EntityManager.prototype.applyUpdate = function(result, entity) {
        var schema = result.schema;
        for (var k in entity) {
            if (schema.path(k)) {
                if (entity[k] !== null) {
                    result[k] = this.applyPartial(result[k], entity[k]);
                } else {
                    delete result[k];
                }
            }
        }
        return result;
    };

    EntityManager.prototype.getEnsureReference = function(obj) {
        return function(ref, callback) {
            var currObj = obj;
            var path = null;
            var refPaths = ref.splits;
            for (var i = 0; i < refPaths.length; ++i) {
                path = refPaths[i];
                if (!(path in currObj)) {
                    return callback(null, true);
                }
                currObj = currObj[path];
            }
            if (!currObj) {
                return callback(null, true);
            }
            path = ref.path;
            var schema = this.model.schema;
            var refModelName = ref.ref;
            if (ref.type == 'oid') {
                if (typeof currObj === 'object' &&
                    currObj.constructor.name !== "ObjectID") {
                    if (SIS.FIELD_ID in currObj) {
                        currObj = currObj[SIS.FIELD_ID];
                    } else {
                        return callback(SIS.ERR_BAD_REQ("Reference Object has no _id"), null);
                    }
                }
                this.sm.getSisModelAsync(refModelName, function(err, model) {
                    if (err) { return callback(err, false); }
                    if (!model) {
                        return callback(SIS.ERR_BAD_REQ("No schema named " + refModelName));
                    }
                    model.findOne({'_id' : currObj}, '_id', function(e, r) {
                        if (e) {
                            callback(SIS.ERR_INTERNAL(e), false);
                        } else if (!r) {
                            callback(SIS.ERR_BAD_REQ("Reference with id " + currObj + " does not exist."), false);
                        } else {
                            callback(null, true);
                        }
                    });
                });
            } else {
                // array of oids
                if (!(currObj instanceof Array)) {
                    currObj = [currObj];
                }
                var errored = false;
                currObj.map(function(obj) {
                    if (typeof obj === 'object') {
                        if (SIS.FIELD_ID in obj) {
                            return obj[SIS.FIELD_ID];
                        } else {
                            errored = true;
                        }
                    }
                    return obj;
                });
                if (errored) {
                    return callback(SIS.ERR_BAD_REQ("Reference Object has no _id field"));
                }
                this.sm.getSisModelAsync(refModelName, function(err, model) {
                    if (err) { return callback(err, false); }
                    if (!model) {
                        return callback(SIS.ERR_BAD_REQ("No schema named " + refModelName));
                    }
                    model.find({ '_id' : { "$in" : currObj }}, '_id', function(e, r) {
                        if (e) {
                            callback(SIS.ERR_INTERNAL(e), false);
                        } else if (!r || r.length != currObj.length) {
                            callback(SIS.ERR_BAD_REQ("Some IDs do not exist in " + JSON.stringify(currObj)), false);
                        } else {
                            callback(null, true);
                        }
                    });
                });
            }

        }.bind(this);
    };

    EntityManager.prototype.ensureReferences = function(obj) {
        if (!this.references.length || !obj) {
            return Q(obj);
        }
        // convert to POJO
        var result = obj;
        if (obj.toObject) {
            obj = obj.toObject();
        }
        // ensure the references exist
        var d = Q.defer();
        async.map(this.references, this.getEnsureReference(obj), function(err, ignored) {
            if (err) {
                d.reject(err);
            } else {
                d.resolve(result);
            }
        });
        return d.promise;
    };

    EntityManager.prototype._save = function(obj, callback) {
        // ensure references
        var p = this.ensureReferences(obj)
            .then(Manager.prototype._save.bind(this));
        return Q.nodeify(p, callback);
    };
    //////////

    module.exports = function(model, schema, opts) {
        return new EntityManager(model, schema, opts);
    };

})();