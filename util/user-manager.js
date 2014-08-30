// A class used to manage users, services and tokens

'use strict';

var SIS = require("./constants");
var Manager = require("./manager");
var Promise = require("bluebird");
var crypto = require('crypto');
var jsondiff = require("jsondiffpatch");

/////////////////////////////////
// Users
function UserManager(sm) {
    Manager.call(this, sm.getSisModel(SIS.SCHEMA_USERS), {});
    this.sm = sm;
    this.authEnabled = this.sm.authEnabled;
}

require('util').inherits(UserManager, Manager);

UserManager.prototype.createTempToken = function(user) {
    var tm = this.sm.auth[SIS.SCHEMA_TOKENS];
    var token = {
        username : user[SIS.FIELD_NAME],
        expires : Date.now() + SIS.AUTH_EXPIRATION_TIME
    };
    var p = tm.add(token, user);
    return p;
};

UserManager.prototype.hashPw = function(pw) {
    if (!pw) { return null; }
    var h = crypto.createHash('sha256');
    h.update(pw, 'utf8');
    return h.digest('hex');
};

// need to hash the pw
UserManager.prototype.add = function(obj, user) {
    obj = JSON.parse(JSON.stringify(obj));
    if (obj[SIS.FIELD_PW]) {
        obj[SIS.FIELD_PW] = this.hashPw(obj[SIS.FIELD_PW]);
    }
    return Manager.prototype.add.call(this, obj, user);
};

UserManager.prototype.applyUpdate = function(obj, updateObj) {
    updateObj = JSON.parse(JSON.stringify(updateObj));
    if (updateObj[SIS.FIELD_PW]) {
        updateObj[SIS.FIELD_PW] = this.hashPw(updateObj[SIS.FIELD_PW]);
    }
    //return this.applyPartial(obj, updateObj);
    return Manager.prototype.applyUpdate.call(this, obj, updateObj);
};

UserManager.prototype.getVerifiedUser = function(username, pw) {
    var self = this;
    var p = this.getById(username, { lean : true }).then(function(u) {
        pw = self.hashPw(pw);
        if (u[SIS.FIELD_PW] != pw) {
            return Promise.reject(SIS.ERR_BAD_CREDS("Invalid password."));
        } else {
            return Promise.resolve(u);
        }
    });
    return p;
};

UserManager.prototype.getOrCreateEmptyUser = function(userObj, superUser) {
    var self = this;
    if (!userObj || !userObj.name || !userObj.email) {
        return Promise.reject(SIS.ERR_INTERNAL("Invalid user specified in getOrCreate"));
    }
    var username = userObj.name;
    return this.model.findOneAsync({name : username}).then(function(user) {
        if (!user) {
            // create it
            user = {
                name : username,
                email : userObj.email,
                roles : { },
                super_user : false
            };
            return self.add(user, superUser);
        } else {
            // found
            return Promise.resolve(user);
        }
    }).catch(function(e) {
        return Promise.reject(SIS.ERR_INTERNAL(e));
    });
};

UserManager.prototype.authorize = function(evt, doc, user, mergedDoc) {
    if (!this.authEnabled) {
        return Promise.resolve(mergedDoc || doc);
    }
    if (!user) {
        return Promise.reject(SIS.ERR_BAD_CREDS("User is null."));
    }
    // super users do it all
    if (user[SIS.FIELD_SUPERUSER]) {
        return Promise.resolve(mergedDoc || doc);
    }
    if (!user[SIS.FIELD_ROLES]) {
        return Promise.reject(SIS.ERR_BAD_CREDS("User has no roles."));
    }
    // doc is a user object
    switch (evt) {
        case SIS.EVENT_INSERT:
        case SIS.EVENT_DELETE:
            if (doc[SIS.FIELD_SUPERUSER] && !user[SIS.FIELD_SUPERUSER]) {
                return Promise.reject(SIS.ERR_BAD_CREDS("Only superusers can " + evt + " superusers."));
            }
            if (!SIS.UTIL_ENSURE_ROLE_SUBSET(user[SIS.FIELD_ROLES], doc[SIS.FIELD_ROLES], true)) {
                return Promise.reject(SIS.ERR_BAD_CREDS("Cannot " + evt + " user unless admin of all roles."));
            }
            if (doc[SIS.FIELD_NAME] == user[SIS.FIELD_NAME]) {
                return Promise.reject(SIS.ERR_BAD_CREDS("Cannot " + evt + " a user with the same name."));
            }
            return Promise.resolve(doc);
        default: // update
            // if changing roles, then an admin of the roles being added/removed
            // are allowed..
            if (doc[SIS.FIELD_SUPERUSER] && !user[SIS.FIELD_SUPERUSER] ||
                mergedDoc[SIS.FIELD_SUPERUSER] && !user[SIS.FIELD_SUPERUSER]) {
                return Promise.reject(SIS.ERR_BAD_CREDS("Only superusers can update superusers."));
            }
            if (!SIS.UTIL_ROLES_EQUAL(doc, mergedDoc)) {
                // changing roles
                if (doc[SIS.FIELD_NAME] == user[SIS.FIELD_NAME]) {
                    return Promise.reject(SIS.ERR_BAD_CREDS("User's cannot change their own roles."));
                }
                // need to get the diffs..
                var k;
                var userRoles = user[SIS.FIELD_ROLES];
                var docRoles = doc[SIS.FIELD_ROLES] || { };
                var roleDiff = jsondiff.diff(docRoles, mergedDoc[SIS.FIELD_ROLES]);
                for (k in roleDiff) {
                    // need to make sure the user is an admin of the role being added/deleted/updated
                    if (!(k in userRoles) || userRoles[k] != SIS.ROLE_ADMIN) {
                        return Promise.reject(SIS.ERR_BAD_CREDS(user[SIS.FIELD_NAME] + " is not an admin of role " + k));
                    }
                }
                // non role fields can't be changed here.
                for (k in doc) {
                    if (k != SIS.FIELD_ROLES && k != SIS.FIELD_UPDATED_BY) {
                        if (k in mergedDoc && mergedDoc[k].toString() != doc[k].toString()) {
                            // can't change this field.
                            return Promise.reject(SIS.ERR_BAD_CREDS("Only the user or a super user can change non role fields. (" + k + ")"));
                        }
                    }
                }
            } else {
                // not changing roles.. only fields
                if (doc[SIS.FIELD_NAME] != user[SIS.FIELD_NAME]) {
                    return Promise.reject(SIS.ERR_BAD_CREDS("Only the user or a super user can change non role fields."));
                }
                if (SIS.FIELD_VERIFIED in doc && doc[SIS.FIELD_VERIFIED] != mergedDoc[SIS.FIELD_VERIFIED]) {
                    return Promise.reject(SIS.ERR_BAD_REQ("Cannot change verified state of self."));
                }
            }
            return Promise.resolve(mergedDoc);
    } // end switch
};

UserManager.prototype.objectRemoved = function(user) {
    // remove all tokens where username = user[name];
    var tokenManager = this.sm.auth[SIS.SCHEMA_TOKENS];
    var d = Promise.pending();
    tokenManager.model.remove({username : user[SIS.FIELD_NAME]}, function(err) {
        if (err) {
            d.reject(SIS.ERR_INTERNAL("Unable to clear tokens for user."));
        } else {
            d.resolve(user);
        }
    });
    return d.promise;
};

UserManager.prototype.validate = function(obj, isUpdate) {
    if (!obj || !obj[SIS.FIELD_NAME]) {
        return "User must have a name.";
    }
    return SIS.UTIL_VALIDATE_ROLES(obj, true);
};
/////////////////////////////////

module.exports = function(sm) {
    return new UserManager(sm);
};
