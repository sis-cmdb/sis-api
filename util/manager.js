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

var Q = require('q');
var SIS = require('./constants');

function Manager(model, opts) {
    this.model = model;
    opts = opts || { }
    this.idField = opts[SIS.OPT_ID_FIELD] || 'name';
    this.type = opts[SIS.OPT_TYPE] || this.model.modelName;
    this.authEnabled = SIS.OPT_USE_AUTH in opts ? opts[SIS.OPT_USE_AUTH] : SIS.DEFAULT_OPT_USE_AUTH;
    this.adminRequired = opts[SIS.OPT_ADMIN_REQUIRED] || false;
}

// return a string if validation fails
Manager.prototype.validate = function(obj, isUpdate) {
    return null;
}

// can return a document or promise
Manager.prototype.applyUpdate = function(doc, updateObj) {
    doc.set(updateObj);
    return doc;
}

Manager.prototype.objectRemoved = function(obj) {
    // default just returns a fullfilled promise
    return Q(obj);
}

/** Common methods - rare to override these **/
// get all the objects belonging to the model.
Manager.prototype.getAll = function(condition, options, callback) {
    var d = Q.defer();
    this.model.find(condition, null, options, this._getFindCallback(d, null));
    return Q.nodeify(d.promise, callback);
}

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
}

Manager.prototype.populate = function(toPopulate, callback) {
    var fields = this._getPopulateFields();
    if (!fields) {
        return Q(toPopulate);
    }
    var d = Q.defer();
    this.model.populate(toPopulate, fields, this._getModCallback(d));
    return Q.nodeify(d.promise, callback);
}

// get a single object by id.
Manager.prototype.getById = function(id, callback) {
    var q = {}; q[this.idField] = id;
    return this.getSingleByCondition(q, id, callback);
}

Manager.prototype.getSingleByCondition = function(condition, name, callback) {
    var d = Q.defer();
    this.model.findOne(condition, this._getFindCallback(d, name));
    return Q.nodeify(d.promise, callback);
}

Manager.prototype.authorize = function(evt, doc, user, mergedDoc) {
    // get the permissions on the doc being added/updated/deleted
    var permission = this.getPermissionsForObject(doc, user);
    if (permission == SIS.PERMISSION_ADMIN) {
        return Q(mergedDoc || doc);
    }
    if (permission == SIS.PERMISSION_USER_ALL_GROUPS && !this.adminRequired) {
        return Q(doc);
    } else {
        return Q.reject(SIS.ERR_BAD_CREDS("Insufficient permissions."));
    }
}

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
    var p = this.authorize(SIS.EVENT_INSERT, obj, user).then(this._save.bind(this));
    return Q.nodeify(p, callback);
}

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
            var old = found.toObject();
            var innerP = self._merge(found, obj)
                .then(function(merged) {
                    return self.authorize(SIS.EVENT_UPDATE, old, user, merged);
                })
                .then(self._save.bind(self))
                .then(function(updated) {
                    return Q([old, updated]);
                });
            return innerP;
        });
    return Q.nodeify(p, callback);
}


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
}

// utils
// Expects a valid object - should be called at the end of
// a validate routine and changes the owner to an array
// if it is a string
Manager.prototype.validateOwner = function(obj) {
    if (!obj || !obj[SIS.FIELD_OWNER]) {
        return SIS.FIELD_OWNER + " field is required.";
    }
    var owner = obj[SIS.FIELD_OWNER];
    if (typeof owner === 'string') {
        if (owner.length == 0) {
            return SIS.FIELD_OWNER + " can not be empty.";
        }
        obj[SIS.FIELD_OWNER] = [owner];
    } else if (owner instanceof Array) {
        if (owner.length == 0) {
            return SIS.FIELD_OWNER + " can not be empty.";
        }
        // sort it
        owner.sort();
    } else {
        // invalid format
        return SIS.FIELD_OWNER + " must be a string or array.";
    }
    return null;
}

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
}

Manager.prototype.applyPartial = function (full, partial) {
    if (typeof partial !== 'object' || partial instanceof Array) {
        return partial;
    } else {
        // merge the object
        var result = full;
        for (var k in partial) {
            if (partial[k]) {
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

//private - get a mongoose callback for the find methods
Manager.prototype._remove = function(doc) {
    var d = Q.defer();
    doc.remove(function(e, r) {
        if (e) {
            d.reject(SIS.ERR_INTERNAL(e));
        } else {
            d.resolve(doc);
        }
    })
    return d.promise;
}

Manager.prototype._getFindCallback = function(d, id) {
    var self = this;
    return function(err, result) {
        if (err || !result) {
            d.reject(SIS.ERR_INTERNAL_OR_NOT_FOUND(err, self.type, id))
        } else {
            d.resolve(result);
        }
    }
}

//private - get a mongoose callback for save / delete
Manager.prototype._getModCallback = function(d) {
    var self = this;
    return function(err, result) {
        if (err) {
            d.reject(SIS.ERR_INTERNAL(err));
        } else {
            d.resolve(result);
        }
    }
}

Manager.prototype._getPopulateFields = function() {
    var paths = [];
    var schema = this.model.schema;
    schema.eachPath(function(pathName, schemaType) {
        if (schemaType.instance == "ObjectID" && pathName != "_id") {
            paths.push(pathName);
        }
    });
    if (paths.length) {
        return paths.join(" ");
    }
    return null;
}

// returns a promise function that accepts a document from
// find and applies the update
Manager.prototype._merge = function(doc, update) {
    return Q(this.applyUpdate(doc, update));
}

Manager.prototype._save = function(obj, callback) {
    var d = Q.defer();
    if (!obj) {
        d.reject(SIS.ERR_BAD_REQ("invalid data"));
    } else {
        var m = obj;
        if (!(obj instanceof this.model)) {
            m = new this.model(obj);
        }
        m.save(this._getModCallback(d));
    }
    return Q.nodeify(d.promise, callback);
}

// exports
module.exports = exports = Manager;
