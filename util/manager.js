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

var Q = require('q');
var SIS = require('./constants');
var async = require('async');

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
    // objects this manager refers to
    this.references = SIS.UTIL_GET_OID_PATHS(this.model.schema);
}

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
    return Q(obj);
};

/** Common methods - rare to override these **/
// get all the objects belonging to the model.
Manager.prototype.getAll = function(condition, options, fields, callback) {
    var d = Q.defer();
    this.model.find(condition, fields, options, this._getFindCallback(d, null));
    return Q.nodeify(d.promise, callback);
};

// Count the number of objects specified by the query
Manager.prototype.count = function(condition, callback) {
    var d = Q.defer();
    this.model.count(condition, function(err, c) {
        if (err || !c) {
            d.resolve(0);
        } else {
            d.resolve(c);
        }
    });
    return d.promise;
};

// Populate the object/array of objects one level deep
Manager.prototype.populate = function(toPopulate, schemaManager) {
    var fields = this._getPopulateFields();
    if (!fields) {
        return Q(toPopulate);
    }
    // ensure the fields exist
    var refs = this.references;
    var refsToLoad = [];
    refs.forEach(function(ref) {
        if (!schemaManager.hasEntityModel(ref)) {
            refsToLoad.push(ref);
        }
    });
    var d = Q.defer();
    var self = this;
    if (!refsToLoad.length) {
        this.model.populate(toPopulate, fields, this._getModCallback(d));
    } else {
        async.map(refsToLoad, schemaManager.getEntityModelAsync.bind(schemaManager),
        function(err, res) {
            self.model.populate(toPopulate, fields, self._getModCallback(d));
        });
    }
    return d.promise;
};

// get a single object by id.
Manager.prototype.getById = function(id, callback) {
    var q = {}; q[this.idField] = id;
    return this.getSingleByCondition(q, id, callback);
};

// Get a single object that has certain properties.
Manager.prototype.getSingleByCondition = function(condition, name, callback) {
    var d = Q.defer();
    this.model.findOne(condition, this._getFindCallback(d, name));
    return Q.nodeify(d.promise, callback);
};

// Authorize a user to operate on a particular document
// if evt is SIS.EVENT_UPDATE, mergedDoc is the updated object
// otherwise doc is the object being added/deleted
Manager.prototype.authorize = function(evt, doc, user, mergedDoc) {
    if (evt == SIS.EVENT_DELETE) {
        if (doc[SIS.FIELD_LOCKED]) {
            return Q.reject(SIS.ERR_BAD_CREDS("Cannot delete a locked object."));
        }
    }
    // get the permissions on the doc being added/updated/deleted
    var permission = this.getPermissionsForObject(doc, user);
    if (permission != SIS.PERMISSION_ADMIN &&
        permission != SIS.PERMISSION_USER_ALL_GROUPS) {
        return Q.reject(SIS.ERR_BAD_CREDS("Insufficient permissions."));
    }
    if (evt != SIS.EVENT_UPDATE) {
        // insert / delete
        return Q(doc);
    } else {
        var updatedPerms = this.getPermissionsForObject(mergedDoc, user);
        if (updatedPerms != SIS.PERMISSION_ADMIN &&
            updatedPerms != SIS.PERMISSION_USER_ALL_GROUPS) {
            return Q.reject(SIS.ERR_BAD_CREDS("Insufficient permissions."));
        }
        return Q(mergedDoc);
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
        return Q.nodeify(Q.reject(SIS.ERR_BAD_REQ(err)),
                         callback);
    }
    var p = this.authorize(SIS.EVENT_INSERT, obj, user)
        .then(this._addByFields(user, SIS.EVENT_INSERT))
        .then(this._save.bind(this));
    return Q.nodeify(p, callback);
};

// Ensures the user can update the object and then update it
Manager.prototype.update = function(id, obj, user, callback) {
    if (!callback && typeof user === 'function') {
        callback = user;
        user = null;
    }
    var err = this.validate(obj, true, user);
    if (err) {
        return Q.nodeify(Q.reject(SIS.ERR_BAD_REQ(err)),
                         callback);
    }
    if (this.idField in obj && id != obj[this.idField]) {
        return Q.nodeify(Q.reject(SIS.ERR_BAD_REQ(this.idField + " cannot be changed.")), callback);
    }
    var self = this;
    var p = this.getById(id)
        .then(function(found) {
            // need to save found's old state
            // HACK - see
            // https://github.com/LearnBoost/mongoose/pull/1981
            found.$__error(null);

            var old = found.toObject();
            var innerP = self._merge(found, obj)
                .then(function(merged) {
                    return self.authorize(SIS.EVENT_UPDATE, old, user, merged);
                })
                .then(self._addByFields(user, SIS.EVENT_UPDATE))
                .then(self._save.bind(self))
                .then(function(updated) {
                    return Q([old, updated]);
                });
            return innerP;
        });
    return Q.nodeify(p, callback);
};

// Ensures the user can delete the object and then delete it
Manager.prototype.delete = function(id, user, callback) {
    if (!callback && typeof user === 'function') {
        callback = user;
        user = null;
    }
    var self = this;
    var p = this.getById(id)
                .then(function(obj) {
                    return self.authorize(SIS.EVENT_DELETE, obj, user);
                })
                .then(this._remove.bind(this))
                .then(this.objectRemoved.bind(this));
    return Q.nodeify(p, callback);
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
    var d = Q.defer();
    doc.remove(function(e, r) {
        if (e) {
            d.reject(SIS.ERR_INTERNAL(e));
        } else {
            d.resolve(doc);
        }
    });
    return d.promise;
};

// Return the callback for the model getters
Manager.prototype._getFindCallback = function(d, id) {
    var self = this;
    return function(err, result) {
        if (err || !result) {
            d.reject(SIS.ERR_INTERNAL_OR_NOT_FOUND(err, self.type, id));
        } else {
            d.resolve(result);
        }
    };
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
    if (!this.references.length) {
        return null;
    }
    return this.references.map(function(ref) {
        return ref.path;
    }).join(" ");
};

// returns a promise function that accepts a document from
// find and applies the update
Manager.prototype._merge = function(doc, update) {
    return Q(this.applyUpdate(doc, update));
};

// Save the object and return a promise that is fulfilled
// with the saved document
Manager.prototype._save = function(obj, callback) {
    var d = Q.defer();
    if (!obj) {
        d.reject(SIS.ERR_BAD_REQ("invalid data"));
    } else {
        var m = obj;
        if (!(obj instanceof this.model)) {
            try {
                m = new this.model(obj);
            } catch (ex) {
                return d.reject(SIS.ERR_BAD_REQ(ex));
            }
        }
        m.save(this._getModCallback(d));
    }
    return Q.nodeify(d.promise, callback);
};

// Returns a function that receives a document and fills in
// the _updated_by and _created_by fields
Manager.prototype._addByFields = function(user, event) {
    return function(doc) {
        if (!user || !doc) {
            return Q(doc);
        }
        if (event == SIS.EVENT_UPDATE) {
            doc[SIS.FIELD_UPDATED_BY] = user[SIS.FIELD_NAME];
        } else if (event == SIS.EVENT_INSERT) {
            doc[SIS.FIELD_CREATED_BY] = user[SIS.FIELD_NAME];
            doc[SIS.FIELD_UPDATED_BY] = user[SIS.FIELD_NAME];
        }
        return Q(doc);
    };
};

// exports
module.exports = exports = Manager;

})();
