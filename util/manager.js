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
var helpers = require('./helpers');

function Manager(model, opts) {
    this.model = model;
    opts = opts || { }
    this.idField = opts.name || 'name';
    this.type = opts.type || this.model.modelName;
}

// return a string if validation fails
Manager.prototype.validate = function(obj, isUpdate) {
    return null;
}

Manager.prototype.applyUpdate = function(doc, updateObj) {
    doc.set(updateObj);
    return doc;
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

Manager.prototype.add = function(obj, callback) {
    var err = this.validate(obj, false);
    if (err) {
        var d = Q.defer();
        d.reject(SIS.ERR_BAD_REQ(err));
        return Q.nodeify(d.promise, callback);
    }
    return this._save(obj);
}

Manager.prototype.update = function(id, obj, callback) {
    var err = this.validate(obj, true);
    if (err) {
        var d = Q.defer();
        d.reject(SIS.ERR_BAD_REQ(err));
        return Q.nodeify(d.promise, callback);
    }
    if (this.idField in obj && id != obj[this.idField]) {
        var d = Q.defer();
        d.reject(SIS.ERR_BAD_REQ(this.idField + " cannot be changed."));
        return Q.nodeify(d.promise, callback);
    }
    var self = this;
    var p = this.getById(id)
        .then(function(found) {
            // need to save found's old state
            var old = found.toObject();
            var innerP = self._merge(found, obj)
                .then(self._save.bind(self))
                .then(function(updated) {
                    var d = Q.defer();
                    d.resolve([old, updated]);
                    return d.promise;
                });
            return innerP;
        });
    return Q.nodeify(p, callback);
}


Manager.prototype.delete = function(id, callback) {
    var p = this.getById(id).then(this._remove.bind(this));
    return Q.nodeify(p, callback);
}

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

// returns a promise function that accepts a document from
// find and applies the update
Manager.prototype._merge = function(doc, update) {
    var d = Q.defer();
    d.resolve(this.applyUpdate(doc, update));
    return d.promise;
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
