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

// Manager.prototype.authorize = function(req) {
//     var self = this;
//     return function(u) {
//         var id = req.params.id;
//         if (!req.user || !req.user[SIS.FIELD_ROLES]) {
//             return Q.reject(SIS.ERR_BAD_CREDS);
//         }
//         // get the item by id
//         return self.getManager(req).then(function(m) {
//             return m.getById(id).then(function(obj) {
//                 return self.authorizeModForObject(req, m, obj);
//             });
//         });
//     }
// }
// // default just looks @ owners
// Manager.prototype.authorizeModForObject = function(req, manager, obj) {
//     if (!obj[SIS.FIELD_OWNER]) {
//         return Q(obj);
//     }
//     var roles = req.user[SIS.FIELD_ROLES];
//     // get the owners of the object
//     var owners = obj[SIS.FIELD_OWNER];
//     // ensure the user has a group
//     var authorized = false;
//     for (var i = 0; i < owners.length; ++i) {
//         var owner = owners[i];
//         if (owner in roles) {
//             return Q(obj);
//         }
//     }
//     return Q.reject(SIS.ERR_BAD_CREDS);
// }

Manager.prototype.add = function(obj, user, callback) {
    if (!callback && typeof user === 'function') {
        callback = user;
        user = null;
    }
    var err = this.validate(obj, false);
    if (err) {
        return Q.nodeify(Q.reject(SIS.ERR_BAD_REQ(err)),
                         callback);
    }
    return Q.nodeify(this._save(obj), callback);
}

Manager.prototype.update = function(id, obj, user, callback) {
    if (!callback && typeof user === 'function') {
        callback = user;
        user = null;
    }
    var err = this.validate(obj, true);
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
    var p = this.getById(id)
                .then(this._remove.bind(this))
                .then(this.objectRemoved.bind(this));
    return Q.nodeify(p, callback);
}

// utils
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


/** Private methods **/
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
