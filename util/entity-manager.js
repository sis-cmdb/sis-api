
// Manager for entities

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
EntityManager.prototype.validate = function(entity, toUpdate, options) {
    var keys = Object.keys(entity);
    var i = 0;
    var rf;
    if (toUpdate) {
        // remove reserved fields..
        for (i = 0; i < keys.length; ++i) {
            rf = keys[i];
            if (rf[0] == "_") {
                // v1 does not allow any _
                // v1.1+ allows SIS.FIELD_SIS_META
                if (options.version == "v1" ||
                    rf != SIS.FIELD_SIS_META) {
                    delete entity[rf];
                }
            }
        }
        keys = Object.keys(entity);
    }
    try {
        if (!keys.length) {
            return "entity cannot be empty";
        } else if (keys.length == 1 && keys[0] == SIS.FIELD_SIS_META) {
            if (!toUpdate) {
                return "entity cannot be empty";
            }
            if (typeof entity[SIS.FIELD_SIS_META] !== 'object' ||
                !Object.keys(entity[SIS.FIELD_SIS_META]).length) {
                return "entity cannot be empty";
            }
        }
        for (i = 0; i < keys.length; ++i) {
            rf = keys[i];
            if (rf[0] == "_") {
                // v1 does not allow any _
                // v1.1+ allows SIS.FIELD_SIS_META
                if (options.version == "v1" ||
                    rf != SIS.FIELD_SIS_META) {
                    return rf + " is a reserved field";
                }
            }
        }
        // // handle sub objects
        // for (var i = 0; i < this.references.length; ++i) {
        //     var err = this.fixSubObject(entity, this.references[i], isUpdate);
        //     if (err) {
        //         return err;
        //     }
        // }
        if (this.schema[SIS.FIELD_IS_OPEN] ||
            this.schema[SIS.FIELD_IS_PUBLIC]) {
            return null;
        }
        if (this._hasOwners(entity, options)) {
            var owners = this.getOwners(entity);
            if (owners instanceof Array && !owners.length) {
                // let the authorize call take care of setting
                // sub owners
                return null;
            }
            var err = this.validateOwner(entity, options);
            if (err) {
                return err;
            }
            // ensure the document is a subset of owners of the schema
            var schemaOwners = this.getOwners(this.schema);
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

EntityManager.prototype._hasOwners = function(obj, options) {
    if (options.version == "v1") {
        return SIS.FIELD_OWNER in obj;
    } else {
        return SIS.FIELD_SIS_META in obj &&
            SIS.FIELD_OWNER in obj[SIS.FIELD_SIS_META];
    }
};

EntityManager.prototype._getOwnerSubset = function(user, schema) {
    if (!user[SIS.FIELD_ROLES]) {
        return [];
    }
    var schemaOwners = this.getOwners(schema);
    var userRoles = Object.keys(user[SIS.FIELD_ROLES]);
    return userRoles.filter(function(owner) {
        return schemaOwners.indexOf(owner) != -1;
    });
};

EntityManager.prototype.getOwners = function(obj) {
    var owners = Manager.prototype.getOwners.call(this, obj);
    if (!owners) {
        // defer to schema owners
        owners = Manager.prototype.getOwners.call(this, this.schema);
    }
    return owners;
};

// authorize always gets meta in v1.1 support
EntityManager.prototype.authorize = function(evt, doc, user, mergedDoc) {
    if (!this.authEnabled) {
        return Manager.prototype.authorize.call(this, evt, doc, user, mergedDoc);
    }
    if (user[SIS.FIELD_SUPERUSER]) {
        return Manager.prototype.authorize.call(this, evt, doc, user, mergedDoc);
    }
    if (this.schema[SIS.FIELD_IS_OPEN] || this.schema[SIS.FIELD_IS_PUBLIC]) {
        var userGroups = user[SIS.FIELD_ROLES] ? Object.keys(user[SIS.FIELD_ROLES]) : [];
        if (!userGroups.length) {
            return SIS.ERR_BAD_REQ("User must have roles assigned.");
        }
        var meta = mergedDoc ? mergedDoc[SIS.FIELD_SIS_META] : doc[SIS.FIELD_SIS_META];
        if (!meta[SIS.FIELD_OWNER]) {
            meta[SIS.FIELD_OWNER] = userGroups;
        }
        return Manager.prototype.authorize.call(this, evt, doc, user, mergedDoc);
    }
    // authorize against entity subset or schema
    var ownerSubset = this._getOwnerSubset(user, this.schema);
    if (!ownerSubset.length) {
        return Promise.reject(SIS.ERR_BAD_CREDS("Insufficient privileges to operate on entities in this schema."));
    }
    var docMeta = doc[SIS.FIELD_SIS_META];
    if (!docMeta[SIS.FIELD_OWNER] || !docMeta[SIS.FIELD_OWNER].length) {
        docMeta[SIS.FIELD_OWNER] = ownerSubset;
    }
    if (mergedDoc) {
        docMeta = mergedDoc[SIS.FIELD_SIS_META];
        if (!docMeta[SIS.FIELD_OWNER] || !docMeta[SIS.FIELD_OWNER].length) {
            docMeta[SIS.FIELD_OWNER] = ownerSubset;
        }
    }
    return Manager.prototype.authorize.call(this, evt, doc, user, mergedDoc);
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

EntityManager.prototype._getDocArrayReferencedObjectIds = function(ref, obj, idx, errors) {
    var containerPaths = ref.containerSplits;
    var currObj = obj;
    var path = null;
    for (var i = 0; i < containerPaths.length; ++i) {
        path = containerPaths[i];
        if (!(path in currObj)) {
            // not there - fine.
            return null;
        }
        currObj = currObj[path];
    }
    if (currObj && !(currObj instanceof Array)) {
        // invalid
        errors[idx] = {
            err : SIS.ERR_BAD_REQ("Array expected at " + ref.path),
            value : obj
        };
        return null;
    }
    if (!currObj || !currObj.length) {
        // empty - ok..
        return null;
    }
    // map to subref gets
    var subRefErrs = { };
    var subRefsObjIds = currObj.map(function(doc) {
        return this._getReferenceObjectIds(ref.subRef, doc, -1, subRefErrs);
    }.bind(this));
    if (Object.keys(subRefErrs).length) {
        errors[idx] = {
            err : SIS.ERR_BAD_REQ("One ore more references could not be verified at " + ref.path),
            value : obj
        };
        return null;
    }
    // subRefsObjIds is an array of array of objectIds
    // it could also be null
    var allObjIds = subRefsObjIds.reduce(function(ret, objIdArray) {
        if (!objIdArray) { return ret; }
        objIdArray.forEach(function(oid) {
            ret[oid + ""] = true;
        });
        return ret;
    }, { });
    var distinctObjIds = Object.keys(allObjIds);
    if (!distinctObjIds.length) {
        return null;
    }
    return distinctObjIds;
};

EntityManager.prototype._getReferenceObjectIds = function(ref, obj, idx, errors) {
    var currObj = obj;
    var path = null;
    if (ref.container == 'docarr') {
        // in a doc array
        return this._getDocArrayReferencedObjectIds(ref, obj, idx, errors);
    }
    var refPaths = ref.splits;
    for (var i = 0; i < refPaths.length; ++i) {
        path = refPaths[i];
        if (!(path in currObj)) {
            // no id @ path - it's ok
            return null;
        }
        currObj = currObj[path];
    }
    if (!currObj) {
        // no value @ path - it's ok
        return null;
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
                errors[idx] = {
                    err : SIS.ERR_BAD_REQ("Reference Object has no _id"),
                    value : obj
                };
                return null;
            }
        }
        return [currObj + ''];
    } else if (ref.type == 'arr') {
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
            errors[idx] = {
                err : SIS.ERR_BAD_REQ("Reference Object has no _id"),
                value : obj
            };
            return null;
        }
        // reduce to a set
        var distinctItems = currObj.reduce(function(ret, id) {
            // just to string it..
            ret['' + id] = true;
            return ret;
        }, { });
        distinctItems = Object.keys(distinctItems);
        return distinctItems;
    }
};

// returns an array of object ids
EntityManager.prototype._addReferencesToState = function(ref, obj, idx,
                                                         refToIdx, errors) {
    var objIds = this._getReferenceObjectIds(ref, obj, idx, errors);
    if (!objIds || !objIds.length) {
        return;
    }
    objIds.forEach(function(oid) {
        if (!refToIdx[oid]) {
            refToIdx[oid] = { };
        }
        refToIdx[oid][idx] = true;
    });
};

EntityManager.prototype._preSaveBulk = function(objs) {
    var references = this.getReferences();
    if (!references.length || !objs || !objs.length) {
        return Promise.resolve([objs, []]);
    }
    // track all errors
    var allErrors = { };
    var objIdStatesByName = references.reduce(function(ret, ref) {
        // get the objects we need to look for
        var refToIdx = { };
        var errors = { };
        // these are not model objects
        // so can just map straight up
        objs.forEach(function(obj, idx) {
            this._addReferencesToState(ref, obj, idx, refToIdx, errors);
        }.bind(this));
        for (var errIdx in errors) {
            if (!allErrors[errIdx]) {
                allErrors[errIdx] = errors[errIdx];
            }
        }
        var refModelName = ref.ref;
        if (!ret[refModelName]) {
            ret[refModelName] = {
                ref : refModelName,
                refToIdx : refToIdx
            };
        } else {
            // need to extend
            var ext = ret[refModelName];
            for (var oid in refToIdx) {
                ext.refToIdx[oid] = ext.refToIdx[oid] || { };
                for (var oidIdx in refToIdx[oid]) {
                    ext.refToIdx[oid][oidIdx] = true;
                }
            }
        }
        return ret;
    }.bind(this), { });

    var markErrored = function(refToIdx, err) {
        var objIds = Object.keys(refToIdx);
        objIds.forEach(function(oid) {
            var indeces = Object.keys(refToIdx[oid]);
            indeces.forEach(function(idx) {
                if (!allErrors[idx]) {
                    allErrors[idx] = {
                        err : err,
                        value : objs[idx]
                    };
                }
            });
        });
    };

    var promises = Object.keys(objIdStatesByName).map(function(name) {
        var state = objIdStatesByName[name];
        var refModelName = state.ref;
        var objIds = Object.keys(state.refToIdx);
        if (!objIds.length) {
            // nothing to do.
            return Promise.resolve(true);
        }
        return this.sm.getEntityModelAsync(refModelName).then(function(model) {
            if (!model) {
                var err = SIS.ERR_BAD_REQ("No schema named " + refModelName);
                // schema doesn't exist.  all of the items are bad
                markErrored(state.refToIdx, err);
                return Promise.resolve(false);
            }
            return model.findAsync({ '_id' : { "$in" : objIds }}, '_id', {lean : true}).then(function(r) {
                if (!r || r.length != objIds.length) {
                    // sigh.. figure out the ones that are missing
                    r = r || [];
                    // nuke the ones that were found
                    r.forEach(function(obj) {
                        var oid = obj._id;
                        delete state.refToIdx[oid + ""];
                    });
                    var err = SIS.ERR_BAD_REQ("Reference does not exist.");
                    markErrored(state.refToIdx, err);
                    return true;
                } else {
                    return true;
                }
            }).catch(function(err) {
                return Promise.reject(SIS.ERR_INTERNAL("Error verifying references"));
            });
        });
    }.bind(this));

    return Promise.all(promises).then(function() {
        // at this point, all errors has all the errors.
        var erroredIndeces = Object.keys(allErrors);
        if (!erroredIndeces.length) {
            // no errors!
            return [objs, []];
        }
        var errorValues = erroredIndeces.map(function(eIdx) {
            return allErrors[eIdx];
        });
        var success = objs.filter(function(o, idx) {
            return !(idx in allErrors);
        });
        return [success, errorValues];
    });
};

EntityManager.prototype._preSave = function(obj) {
    return this._preSaveBulk([obj]).spread(function(success, errors) {
        if (errors.length) {
            return Promise.reject(errors[0].err);
        }
        return obj;
    });
};
//////////

module.exports = function(model, schema, opts) {
    return new EntityManager(model, schema, opts);
};
