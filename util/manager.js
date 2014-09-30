
'use strict';

var Promise = require("bluebird");
var SIS = require('./constants');
var jsondiffpatch = require("jsondiffpatch");
var hat = require('hat');

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
Manager.prototype.validate = function(obj, toUpdate, options) {
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
    return Promise.resolve(obj);
};

Manager.prototype._getDefaultOptions = function(options) {
    options = options || { };
    if (!('version' in options)) {
        options.version = "v1";
    }
    return options;
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

Manager.prototype._commonAuth = function(evt, doc, user, mergedDoc) {
    var docMeta = doc[SIS.FIELD_SIS_META];
    if (evt == SIS.EVENT_DELETE) {
        if (docMeta[SIS.FIELD_LOCKED]) {
            return SIS.ERR_BAD_CREDS("Cannot delete a locked object.");
        }
    } else if (evt == SIS.EVENT_UPDATE) {
        if (docMeta[SIS.FIELD_IMMUTABLE]) {
            mergedDoc = mergedDoc.toObject();
            var mergeMeta = mergedDoc[SIS.FIELD_SIS_META];
            var diff = jsondiffpatch.diff(doc, mergedDoc) || { };
            var changedKeys = Object.keys(diff).filter(function(k) {
                return k[0] != '_';
            });
            if (changedKeys.length > 0) {
                return SIS.ERR_BAD_CREDS("Cannot change an immutable object unless only changing immutable state");
            }
            // ensure only sis meta immutable is being changed
            diff = jsondiffpatch.diff(docMeta, mergeMeta) || { };
            changedKeys = Object.keys(diff);
            if (changedKeys.length != 1 && changedKeys[0] != SIS.FIELD_IMMUTABLE) {
                return SIS.ERR_BAD_CREDS("Cannot change an immutable object unless only changing immutable state");
            }
        }
    }
    return null;
};

// Authorize a user to operate on a particular document
// if evt is SIS.EVENT_UPDATE, mergedDoc is the updated object
// otherwise doc is the object being added/deleted
Manager.prototype.authorize = function(evt, doc, user, mergedDoc) {
    var commonErr = this._commonAuth(evt, doc, user, mergedDoc);
    if (commonErr) {
        return Promise.reject(commonErr);
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
Manager.prototype.add = function(obj, options) {
    // default to v1
    options = this._getDefaultOptions(options);
    var user = options.user;
    var err = this.validate(obj, null, options);
    if (err) {
        return Promise.reject(SIS.ERR_BAD_REQ(err));
    }
    obj = SIS.UTIL_FROM_V1(obj);
    var p = this.authorize(SIS.EVENT_INSERT, obj, user).bind(this)
        .then(this._addByFields(user, SIS.EVENT_INSERT))
        .then(this._preSave)
        .then(this._save);
    return p;
};


Manager.prototype.bulkAdd = function(items, options) {
    options = this._getDefaultOptions(options);
    var user = options.user;
    var allOrNone = options.allOrNone;
    var memo = { success: [], errors: [] };
    var self = this;
    var toAdd = [];
    var transactionId = hat(64) + Date.now();
    var transactionCond = { };
    transactionCond[SIS.FIELD_SIS_META + "." + SIS.FIELD_TRANSACTION_ID + ".id"] = transactionId;
    var authorized = [];
    var authPromises = items.map(function(item, idx) {
        var err = this.validate(item, null, options);
        if (err) {
            err = SIS.ERR_BAD_REQ(err);
            memo.errors.push({ err : err, value : item });
            return Promise.resolve(memo);
        }
        item = SIS.UTIL_FROM_V1(item);
        return this.authorize(SIS.EVENT_INSERT, item, user)
        .bind(this).then(this._addByFields(user, SIS.EVENT_INSERT))
        .then(function(item) {
            authorized.push(item);
            return memo;
        }).catch(function(err) {
            memo.errors.push({ err : err, value : item });
            return memo;
        });
    }.bind(this));
    var insertPromise = Promise.all(authPromises).bind(this)
    .then(function() {
        return this._preSaveBulk(authorized);
    }).spread(function(items, errors) {
        // concat in place
        [].push.apply(memo.errors, errors);
        // fill out the toAdd array
        items.forEach(function(res, idx) {
            // convert to mongoose obj
            res = new this.model(res).toObject();
            // add the pre save
            this.applyPreSaveFields(res);
            // add the transaction field in case
            // we need to nuke them later
            res[SIS.FIELD_SIS_META][SIS.FIELD_TRANSACTION_ID] = {
                id : transactionId,
                idx : idx
            };
            toAdd.push(res);
        }.bind(this));
        return memo;
    });
    // helper for the insert
    var handleInsertFailed = function(inserted) {
        // some things failed..
        // find the ones that failed
        var successIds = inserted.reduce(function(ret, i) {
            var idx = i[SIS.FIELD_SIS_META][SIS.FIELD_TRANSACTION_ID].idx;
            ret[idx] = true;
            return ret;
        }, { });
        toAdd.forEach(function(item) {
            if (!(item[SIS.FIELD_SIS_META][SIS.FIELD_TRANSACTION_ID].idx in successIds)) {
                memo.errors.push({
                    value : item,
                    err : SIS.ERR_BAD_REQ("Insert failed.")
                });
            }
        });
        if (!allOrNone) {
            // done
            memo.success = inserted;
            return memo;
        }
        // nuke the ones that have our transaction
        return this.model.removeAsync(transactionCond).then(function(deleted) {
            // finito
            return memo;
        }).catch(function(e) {
            // oof something very bad happened.
            var msg = "Error deleting entries per allOrNone: " + SIS.FIELD_TRANSACTION_ID + ".id = " + transactionId;
            return SIS.ERR_INTERNAL(msg);
        });
    }.bind(this);
    // do the insert
    return insertPromise.bind(this).then(function() {
        if ((allOrNone && memo.errors.length) || !toAdd.length) {
            // bail - nothing inserted yet or nothing to insert
            return memo;
        }
        // do the insert
        var insert = Promise.promisify(this.model.collection.insert, this.model.collection);
        return insert(toAdd).bind(this).then(function(inserted) {
            if (inserted.length === toAdd.length) {
                // g2g - everything we wanted to add was added
                memo.success = inserted;
                return memo;
            }
            return handleInsertFailed(inserted);
        }).catch(function(err) {
            // get the ones that belong to this transaction
            return this.getAll(transactionCond, { lean : true}).then(function(inserted) {
                return handleInsertFailed(inserted);
            });
        });
    });
};

Manager.prototype._update = function(id, obj, options, saveFunc) {
    return this.getById(id, { lean : true }).bind(this)
    .then(function(found) {
        // validate
        var err = this.validate(obj, found, options);
        if (err) {
            return Promise.reject(SIS.ERR_BAD_REQ(err));
        }
        // this check should still work for entities since idField is _id and
        // it is removed from the object in the validate method.
        // this needs to be cleaned since this is a case of a superclass
        // getting lucky because of subclass behavior
        if (this.idField in obj && found[this.idField] != obj[this.idField]) {
            err = SIS.ERR_BAD_REQ(this.idField + " cannot be changed.");
            return Promise.reject(err);
        }

        // init the mongoose doc - must use .init per comment in mongoose
        // otherwise there are problems like _id mod errors from mongo
        // reference the old raw document
        if (!found[SIS.FIELD_SIS_META] ||
            found[SIS.FIELD_CREATED_AT]) {
            // v1 - need to convert to v1.1
            return this._convertToV11(found);
        } else {
            return [found, null];
        }
    }).spread(function(converted, old) {
        var found = new this.model();
        found.init(converted, { });
        found.isNew = false;
        // need to save found's old state
        // HACK - see
        // https://github.com/LearnBoost/mongoose/pull/1981
        found.$__error(null);
        var oldV11 = found.toObject();
        var user = options.user;

        // always convert the obj to V1.1
        obj = SIS.UTIL_FROM_V1(obj);

        // update metas
        // set meta fields
        var currentMeta = oldV11[SIS.FIELD_SIS_META] || { };
        var updateMeta = obj[SIS.FIELD_SIS_META] || { };

        SIS.MUTABLE_META_FIELDS.forEach(function(k) {
            if (k in updateMeta) {
                found[SIS.FIELD_SIS_META][k] = updateMeta[k];
            }
        });

        return this._merge(found, obj).bind(this).then(function(merged) {
            return this.authorize(SIS.EVENT_UPDATE, oldV11, user, merged);
        })
        .then(this._addByFields(user, SIS.EVENT_UPDATE))
        .then(this._preSave)
        .then(saveFunc)
        .then(function(updated) {
            return this.finishUpdate(oldV11, updated);
        })
        // .then(function(updated) {
        //     if (isUpgradeFromV1) {
        //         // need to unset the old SIS fields of the individual object
        //         return this._unsetV1Fields(updated._id).bind(this)
        //         .then(function(updatedRaw) {
        //             updated = new this.model(updatedRaw);
        //             return this.finishUpdate(oldV11, updated);
        //         });
        //     } else {
        //         return this.finishUpdate(oldV11, updated);
        //     }
        // })
        .then(function(updated) {
            // return
            return Promise.resolve([oldV11, updated, old]);
        });
    });
};

Manager.prototype._convertToV11 = function(found) {
    var id = found._id;
    var rename = { };
    for (var k in SIS.V1_TO_SIS_META) {
        rename[k] = SIS.FIELD_SIS_META + "." + SIS.V1_TO_SIS_META[k];
    }
    // also __v to v
    rename.__v = '_v';
    var query = { _id : id };
    var op = { $rename : rename };
    var collection = Promise.promisifyAll(this.model.collection);
    return collection.updateAsync(query, op).bind(this)
    .then(function(numAffected) {
        return collection.findOneAsync(query)
        .then(function(obj) {
            return [obj, found];
        });
    });
};
//
// Manager.prototype._unsetV1Fields = function(id) {
//     // need to tell mongo to unset
//     var pathsToUnset = Object.keys(SIS.V1_TO_SIS_META).reduce(function(ret, k) {
//         ret[k] = "";
//         return ret;
//     }, { });
//     // also __v
//     pathsToUnset.__v = "";
//     return this.model.updateAsync({ _id : id },{ $unset : pathsToUnset},
//                                   { safe : true, strict: false})
//     .bind(this).then(function() {
//         return this.model.findOneAsync({ _id : id });
//     });
// };

Manager.prototype.finishUpdate = function(old, updated) {
    return Promise.resolve(updated);
};

Manager.prototype._getCasSave = function(obj, cas) {
    return function(doc) {
        var validate = Promise.promisify(doc.validate, doc);
        return validate().bind(this).then(function() {
            // set the ID on the id field
            cas[this.idField] = doc[this.idField];
            obj = SIS.UTIL_FROM_V1(obj);
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
    }.bind(this);
};

Manager.prototype.canInsertWithId = function(id, obj) {
    return obj[this.idField] == id;
};

Manager.prototype.upsert = function(id, obj, options) {
    options = this._getDefaultOptions(options);
    // get by id first
    return this.getById(id, { lean : true }).bind(this).then(function(found) {
        return this.update(id, obj, options);
    }).catch(function(err) {
        // add it
        if (!this.canInsertWithId(id, obj)) {
            return Promise.reject(SIS.ERR_BAD_REQ("Cannot insert object with specified ID"));
        }
        return this.add(obj, options);
    });
};

// Ensures the user can update the object and then update it
Manager.prototype.update = function(id, obj, options) {
    options = this._getDefaultOptions(options);
    var cas = options.cas;
    var saveFunc = this._save;
    // if cas, use the cas save rather than generic save
    if (cas) {
        saveFunc = this._getCasSave(obj, cas);
    }
    return this._update(id, obj, options, saveFunc);
};

// Ensures the user can delete the object and then delete it
Manager.prototype.delete = function(id, options) {
    options = this._getDefaultOptions(options);
    var user = options.user;
    var self = this;
    var p = this.getById(id, { lean : true }).then(function(obj) {
            obj = SIS.UTIL_FROM_V1(obj);
            return self.authorize(SIS.EVENT_DELETE, obj, user);
        })
        .then(this._remove.bind(this))
        .tap(this.objectRemoved.bind(this));
    return p;
};

Manager.prototype.bulkDelete = function(condition, options) {
    options = this._getDefaultOptions(options);
    var user = options.user;
    var memo = { success: [], errors: [] };
    return this.getAll(condition, { lean: true })
    .bind(this).then(function(items) {
        if (!items.length) {
            return memo;
        }
        var toDelete = [];
        var authPromises = items.map(function(item) {
            item = SIS.UTIL_FROM_V1(item);
            return this.authorize(SIS.EVENT_DELETE, item, user)
            .then(function(res) {
                toDelete.push(res);
                return memo;
            }).catch(function(err) {
                memo.errors.push({ err : err, value : item });
                return memo;
            });
        }.bind(this));
        // inner promise chain
        return Promise.all(authPromises).bind(this).then(function() {
            if (!toDelete.length) {
                memo.success = toDelete;
                return memo;
            }
            var idsToDelete = toDelete.reduce(function(ret, i) {
                ret[i._id] = i;
                return ret;
            }, { });
            var idCondition = {};
            idCondition._id = { $in : Object.keys(idsToDelete) };
            return this.model.removeAsync(idCondition)
            .bind(this).then(function(res) {
                if (res == toDelete.length) {
                    memo.success = toDelete;
                    return memo;
                }
                // some issue occurred.. get the ones that weren't deleted
                return this.getAll(idCondition, { lean : true }).then(function(res) {
                    var errors = res.map(function(r) {
                        delete idsToDelete[r._id];
                        var err = SIS.ERR_INTERNAL("Could not delete.");
                        return {
                            err : err,
                            value : r
                        };
                    });
                    memo.success = Object.keys(idsToDelete).map(function(id) { return idsToDelete[id]; });
                    memo.errors = memo.errors.concat(errors);
                    return memo;
                }).catch(function(err) {
                    // ok.. totally hosed here.
                    // error out
                    return Promise.reject(SIS.ERR_INTERNAL(err));
                });
            }).catch(function(err) {
                // removeAsync failed
                return Promise.reject(SIS.ERR_INTERNAL(err));
            });
        }).then(function() {
            if (!memo.success.length) {
                return memo;
            }
            // trigger object removed
            var newSuccess = [];
            var triggers = memo.success.map(function(removed) {
                return this.objectRemoved(removed).then(function(r) {
                    newSuccess.push(r);
                    return true;
                }).catch(function(e) {
                    // in a REALLY bad state here.
                    // TODO: handle this error case
                    memo.errors.push({
                        err : e,
                        value : removed
                    });
                    return false;
                });
            }.bind(this));
            return Promise.all(triggers).then(function(){
                memo.success = newSuccess;
                return memo;
            });
        });
    });
};

// utils
// Expects a valid object - should be called at the end of
// a validate routine and changes the owner to an array
// if it is a string
Manager.prototype.validateOwner = function(obj, options) {
    if (!this.authEnabled) {
        return null;
    }
    if (!obj) {
        return SIS.FIELD_OWNER + " field is required.";
    }
    if (options.version != "v1") {
        obj = obj[SIS.FIELD_SIS_META];
        if (!obj) {
            return SIS.FIELD_OWNER + " field is required in " + SIS.FIELD_SIS_META;
        }
    }
    if (!obj[SIS.FIELD_OWNER]) {
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

Manager.prototype.getOwners = function(obj) {
    if (SIS.FIELD_SIS_META in obj) {
        obj = obj[SIS.FIELD_SIS_META];
    }
    return obj[SIS.FIELD_OWNER];
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
    var owners = this.getOwners(obj);
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
    obj[SIS.FIELD_SIS_META][SIS.FIELD_UPDATED_AT] = Date.now();
};

Manager.prototype._upgradeFromV1 = function(item) {
    // unset keys
    var unsetObj = Object.keys(SIS.V1_TO_SIS_META)
        .reduce(function(ret, k) {
            ret[k] = "";
            return ret;
        }, { });
    return this.model.updateAsync({ _id : item._id }, { $unset : unsetObj}, { safe : true, strict : false })
        .then(function() {
            return item;
        });
};

// return a promise that returns
// an a two element array
// first elem is a success array
// second elem is an error array where each
// error has { err, value } fields
Manager.prototype._preSaveBulk = function(objs) {
    var errors = [];
    var success = [];
    var promises = objs.map(function(obj) {
        return this._preSave(obj).then(function(obj) {
            success.push(obj);
            return obj;
        }).catch(function(err) {
            errors.push({ value : obj, err : err });
            return obj;
        });
    }.bind(this));
    return Promise.all(promises).then(function() {
        return [success, errors];
    });
};

// do one last bit of validation for subclasses
Manager.prototype._preSave = function(obj) {
    return Promise.resolve(obj);
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
    this.applyPreSaveFields(m);
    m.save(this._getModCallback(d));
    return d.promise;
};

// Returns a function that receives a document and fills in
// the _updated_by and _created_by fields
Manager.prototype._addByFields = function(user, event) {
    return function(doc) {
        if (!doc) {
            return Promise.resolve(doc);
        }
        var docMeta = doc[SIS.FIELD_SIS_META];
        if (event == SIS.EVENT_INSERT) {
            docMeta[SIS.FIELD_CREATED_AT] = Date.now();
        }
        if (!user) {
            return Promise.resolve(doc);
        }

        if (event == SIS.EVENT_UPDATE) {
            docMeta[SIS.FIELD_UPDATED_BY] = user[SIS.FIELD_NAME];
        } else if (event == SIS.EVENT_INSERT) {
            docMeta[SIS.FIELD_CREATED_BY] = user[SIS.FIELD_NAME];
            docMeta[SIS.FIELD_UPDATED_BY] = user[SIS.FIELD_NAME];
        }
        return Promise.resolve(doc);
    };
};

// exports
module.exports = exports = Manager;
