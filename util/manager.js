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

(function() {

'use strict';

var Promise = require("bluebird");
var SIS = require('./constants');

// Constructor for a Manager base
// A manager is responsible for communicating with
// the DB and running ops on instances of the resource
// it manages
//
// model is a mongoose model object
// opts is a dictionary w/ the following keys
// - id_field the id field of the resource
// - type - the type of resource or defaults to the model name
// - auth - whether to use auth. Defaults to SIS.DEFAULT_OPT_USE_AUTH (true)
// - admin_required - whether only admins can modify objects of ours
function Manager(model, opts) {
    this.model = model;
    opts = opts || { };
    this.idField = opts[SIS.OPT_ID_FIELD] || SIS.FIELD_NAME;
    this.type = opts[SIS.OPT_TYPE] || this.model.modelName;
    this.authEnabled = SIS.OPT_USE_AUTH in opts ? opts[SIS.OPT_USE_AUTH] : SIS.DEFAULT_OPT_USE_AUTH;
}

Manager.prototype.getReferences = function() {
    return this.model.schema._sis_references;
};

// return a string if validation fails
Manager.prototype.validate = function(obj, isUpdate) {
    return null;
};

// can return a document or promise
// this function receives a doc retrieved from the database
// and the object sent in the update request
// The default just sets the fields sent in the update
Manager.prototype.applyUpdate = function(doc, updateObj) {
    doc.set(updateObj);
    return doc;
};

// A call that indicates the specified object has been removed
// Returns a promise with the object removed.
Manager.prototype.objectRemoved = function(obj) {
    // default just returns a fullfilled promise
    return obj;
};

/** Common methods - rare to override these **/
// Get a single object that has certain properties.
Manager.prototype.getSingleByCondition = function(condition, name, options) {
    return this.model.findOneAsync(condition, null, options)
    .bind(this).then(function(result) {
        if (!result) {
            return Promise.reject(SIS.ERR_NOT_FOUND(this.type, name));
        }
        return Promise.resolve(result);
    })
    .catch(function(err) {
        if (err instanceof Array) {
            return Promise.reject(err);
        }
        if (err.name == "CastError") {
            err = SIS.ERR_NOT_FOUND(this.type, name);
        } else {
            err = SIS.ERR_INTERNAL(err);
        }
        return Promise.reject(err);
    });
};

// get a single object by id.
Manager.prototype.getById = function(id, options) {
    var q = {}; q[this.idField] = id;
    return this.getSingleByCondition(q, id, options);
};

// get all the objects belonging to the model.
Manager.prototype.getAll = function(condition, options, fields) {
    return this.model.findAsync(condition, fields, options);
};

// Count the number of objects specified by the query
Manager.prototype.count = function(condition, callback) {
    return this.model.countAsync(condition).bind(this)
        .then(function(count) {
            return [count, condition, this];
        }).catch(function(err) {
            return [0, condition, this];
        });
};

Manager.prototype.getPopulateFields = function(schemaManager) {
    var schemaNameToPaths = this._getPopulateFields();
    if (!schemaNameToPaths) {
        return Promise.resolve(null);
    }
    // ensure the schemas exist
    var schemasToLoad = Object.keys(schemaNameToPaths)
        .filter(function(schemaName) {
            return !schemaManager.hasEntityModel(schemaName);
        });

    if (!schemasToLoad.length) {
        var fields = this._getFieldsFromPopulateObject(schemaNameToPaths);
        return Promise.resolve(fields);
    } else {
        var self = this;
        // need to try loading up some schemas
        // as they may be available due to DB replication
        var loadPromises = schemasToLoad.map(function(schemaName) {
            return schemaManager.getEntityModelAsync(schemaName).then(function() {
                return schemaName;
            }).catch(function() {
                delete schemaNameToPaths[schemaName];
                return schemaName;
            });
        });
        return Promise.all(loadPromises).then(function() {
            var loadedSchemas = Object.keys(schemaNameToPaths);
            if (!loadedSchemas.length) {
                return null;
            } else {
                var fields = self._getFieldsFromPopulateObject(schemaNameToPaths);
                return fields;
            }
        });
    }
};

// Authorize a user to operate on a particular document
// if evt is SIS.EVENT_UPDATE, mergedDoc is the updated object
// otherwise doc is the object being added/deleted
Manager.prototype.authorize = function(evt, doc, user, mergedDoc) {
    if (evt == SIS.EVENT_DELETE) {
        if (doc[SIS.FIELD_LOCKED]) {
            return Promise.reject(SIS.ERR_BAD_CREDS("Cannot delete a locked object."));
        }
    }
    // get the permissions on the doc being added/updated/deleted
    var permission = this.getPermissionsForObject(doc, user);
    if (permission != SIS.PERMISSION_ADMIN &&
        permission != SIS.PERMISSION_USER_ALL_GROUPS) {
        return Promise.reject(SIS.ERR_BAD_CREDS("Insufficient permissions."));
    }
    if (evt != SIS.EVENT_UPDATE) {
        // insert / delete
        return Promise.resolve(doc);
    } else {
        var updatedPerms = this.getPermissionsForObject(mergedDoc, user);
        if (updatedPerms != SIS.PERMISSION_ADMIN &&
            updatedPerms != SIS.PERMISSION_USER_ALL_GROUPS) {
            return Promise.reject(SIS.ERR_BAD_CREDS("Insufficient permissions."));
        }
        return Promise.resolve(mergedDoc);
    }
};

// Ensures the user can add the object and then add it
Manager.prototype.add = function(obj, user, callback) {
    if (!callback && typeof user === 'function') {
        callback = user;
        user = null;
    }
    var err = this.validate(obj, false, user);
    if (err) {
        return Promise.reject(SIS.ERR_BAD_REQ(err)).nodeify(callback);
    }
    var p = this.authorize(SIS.EVENT_INSERT, obj, user).bind(this)
        .then(this._addByFields(user, SIS.EVENT_INSERT))
        .then(this._preSave)
        .then(this._save);
    return p.nodeify(callback);
};

Manager.prototype._update = function(id, obj, user, saveFunc) {
    var err = this.validate(obj, true, user);
    if (err) {
        return Promise.reject(SIS.ERR_BAD_REQ(err));
    }
    // this check should still work for entities since idField is _id and
    // it is removed from the object in the validate method.
    // this needs to be cleaned since this is a case of a superclass
    // getting lucky because of subclass behavior
    if (this.idField in obj && id != obj[this.idField]) {
        err = SIS.ERR_BAD_REQ(this.idField + " cannot be changed.");
        return Promise.reject(err);
    }
    return this.getById(id).bind(this)
    .then(function(found) {
        // need to save found's old state
        // HACK - see
        // https://github.com/LearnBoost/mongoose/pull/1981
        found.$__error(null);
        var old = found.toObject();
        return this._merge(found, obj).bind(this).then(function(merged) {
            return this.authorize(SIS.EVENT_UPDATE, old, user, merged);
        })
        .then(this._addByFields(user, SIS.EVENT_UPDATE))
        .then(this._preSave)
        .then(saveFunc)
        .then(function(updated) {
            return Promise.resolve([old, updated]);
        });
    });
};

Manager.prototype.casUpdate = function(id, obj, user, cas) {
    // will be bound to this in _update
    var saveFunc = function(doc) {
        var validate = Promise.promisify(doc.validate, doc);
        return validate().bind(this).then(function() {
            // set the ID on the id field
            cas[this.idField] = doc[this.idField];
            // find and update
            // need to add the update time
            this.applyPreSaveFields(obj);
            return this.model.findOneAndUpdateAsync(cas, obj)
            .then(function(doc) {
                if (!doc) {
                    // cas update failed
                    return Promise.reject(SIS.ERR_BAD_REQ("CAS update failed."));
                }
                return doc;
            });
        });
    };
    return this._update(id, obj, user, saveFunc);
};

// Ensures the user can update the object and then update it
Manager.prototype.update = function(id, obj, user, callback) {
    if (!callback && typeof user === 'function') {
        callback = user;
        user = null;
    }
    var p = this._update(id, obj, user, this._save);
    return p.nodeify(callback);
};

// Ensures the user can delete the object and then delete it
Manager.prototype.delete = function(id, user, callback) {
    if (!callback && typeof user === 'function') {
        callback = user;
        user = null;
    }
    var self = this;
    var p = this.getById(id, { lean : true }).then(function(obj) {
            return self.authorize(SIS.EVENT_DELETE, obj, user);
        })
        .then(this._remove.bind(this))
        .tap(this.objectRemoved.bind(this));
    return p.nodeify(callback);
};

// utils
// Expects a valid object - should be called at the end of
// a validate routine and changes the owner to an array
// if it is a string
Manager.prototype.validateOwner = function(obj) {
    if (!this.authEnabled) {
        return null;
    }
    if (!obj || !obj[SIS.FIELD_OWNER]) {
        return SIS.FIELD_OWNER + " field is required.";
    }
    var owner = obj[SIS.FIELD_OWNER];
    if (typeof owner === 'string') {
        if (!owner.length) {
            return SIS.FIELD_OWNER + " can not be empty.";
        }
        obj[SIS.FIELD_OWNER] = [owner];
    } else if (owner instanceof Array) {
        if (!owner.length) {
            return SIS.FIELD_OWNER + " can not be empty.";
        }
        // sort it
        owner.sort();
    } else {
        // invalid format
        return SIS.FIELD_OWNER + " must be a string or array.";
    }
    return null;
};

// expects object to have an owners array - i.e. should have passed
// validateOwners
Manager.prototype.getPermissionsForObject = function(obj, user) {
    if (!this.authEnabled) {
        return SIS.PERMISSION_ADMIN;
    }
    // if either is null, just say nothing..
    if (!user || !obj) {
        return SIS.PERMISSION_NONE;
    }
    if (user[SIS.FIELD_SUPERUSER]) {
        return SIS.PERMISSION_ADMIN;
    }
    if (!user[SIS.FIELD_ROLES]) {
        return SIS.PERMISSION_NONE;
    }
    var owners = obj[SIS.FIELD_OWNER];
    var roles = user[SIS.FIELD_ROLES];
    var userRoleCount = 0;
    var adminRoleCount = 0;
    for (var i = 0; i < owners.length; ++i) {
        var owner = owners[i];
        if (owner in roles) {
            if (roles[owner] == SIS.ROLE_ADMIN) {
                adminRoleCount++;
                userRoleCount++;
            } else if (roles[owner] == SIS.ROLE_USER) {
                userRoleCount++;
            }
        }
    }
    // are we permitted to operate on all groups?
    if (adminRoleCount == owners.length) {
        return SIS.PERMISSION_ADMIN;
    } else if (userRoleCount == owners.length) {
        return SIS.PERMISSION_USER_ALL_GROUPS;
    } else {
        return userRoleCount ? SIS.PERMISSION_USER : SIS.PERMISSION_NONE;
    }
};

// Utility method to apply a partial object to the full one
// This supports nested documents
Manager.prototype.applyPartial = function (full, partial) {
    if (typeof partial !== 'object' || partial instanceof Array) {
        return partial;
    } else {
        // merge the object
        var result = full;
        for (var k in partial) {
            if (partial[k] !== null) {
                if (!full[k]) {
                    result[k] = partial[k];
                } else {
                    result[k] = this.applyPartial(full[k], partial[k]);
                }
            } else {
                delete result[k];
            }
        }
        return result;
    }
};

// Private methods
// Return a promise that removes the document and returns the
// document removed if successful
Manager.prototype._remove = function(doc) {
    var q = {}; q[this.idField] = doc[this.idField];
    return this.model.removeAsync(q).then(function() {
        return doc;
    });
};

// Return the callback for the model modifier methods
Manager.prototype._getModCallback = function(d) {
    var self = this;
    return function(err, result) {
        if (err) {
            if (err.name == "ValidationError" || err.name == "CastError") {
                err = SIS.ERR_BAD_REQ(err);
            } else {
                err = SIS.ERR_INTERNAL(err);
            }
            d.reject(err);
        } else {
            d.resolve(result);
        }
    };
};

// Get the fields that need populating
Manager.prototype._getPopulateFields = function() {
    var references = this.getReferences();
    if (!references.length) {
        return null;
    }
    return references.reduce(function(result, ref) {
        result[ref.ref] = result[ref.ref] || [];
        result[ref.ref].push(ref.path);
        return result;
    }, { });
};

Manager.prototype._getFieldsFromPopulateObject = function(refToPaths) {
    var refs = Object.keys(refToPaths);
    return refs.reduce(function(result, ref) {
        return result.concat(refToPaths[ref]);
    }, []).join(" ");
};

// returns a promise function that accepts a document from
// find and applies the update
Manager.prototype._merge = function(doc, update) {
    return Promise.resolve(this.applyUpdate(doc, update));
};

Manager.prototype.applyPreSaveFields = function(obj) {
    obj[SIS.FIELD_UPDATED_AT] = Date.now();
};

Manager.prototype._preSave = function(obj) {
    return obj;
};

// Save the object and return a promise that is fulfilled
// with the saved document
Manager.prototype._save = function(obj) {
    if (!obj) {
        return Promise.reject(SIS.ERR_BAD_REQ("invalid data"));
    }
    var m = obj;
    if (!(obj instanceof this.model)) {
        try {
            m = new this.model(obj);
        } catch (ex) {
            return d.reject(SIS.ERR_BAD_REQ(ex));
        }
    }
    var d = Promise.pending();
    m.save(this._getModCallback(d));
    return d.promise;
};

// Returns a function that receives a document and fills in
// the _updated_by and _created_by fields
Manager.prototype._addByFields = function(user, event) {
    return function(doc) {
        if (!user || !doc) {
            return Promise.resolve(doc);
        }
        if (event == SIS.EVENT_UPDATE) {
            doc[SIS.FIELD_UPDATED_BY] = user[SIS.FIELD_NAME];
        } else if (event == SIS.EVENT_INSERT) {
            doc[SIS.FIELD_CREATED_BY] = user[SIS.FIELD_NAME];
            doc[SIS.FIELD_UPDATED_BY] = user[SIS.FIELD_NAME];
        }
        return Promise.resolve(doc);
    };
};

// exports
module.exports = exports = Manager;

})();
