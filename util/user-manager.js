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

'use strict';
// A class used to manage users, services and tokens

(function() {

    var SIS = require("./constants");
    var Manager = require("./manager");
    var Q = require("q");
    var crypto = require('crypto');
    var jsondiff = require("jsondiffpatch");

    /////////////////////////////////
    // Users
    function UserManager(sm) {
        Manager.call(this, sm.getSisModel(SIS.SCHEMA_USERS), {});
        this.sm = sm;
        this.authEnabled = this.sm.authEnabled;
    }
    UserManager.prototype.__proto__ = Manager.prototype;

    UserManager.prototype.createTempToken = function(user, callback) {
        var tm = this.sm.auth[SIS.SCHEMA_TOKENS];
        var token = {
            username : user[SIS.FIELD_NAME],
            expires : Date.now() + SIS.AUTH_EXPIRATION_TIME
        }
        var p = tm.add(token, user);
        return Q.nodeify(p, callback);
    }

    UserManager.prototype.hashPw = function(pw) {
        if (!pw) { return null; }
        var h = crypto.createHash('sha256');
        h.update(pw, 'utf8');
        return h.digest('hex');
    }

    // need to hash the pw
    UserManager.prototype.add = function(obj, user, callback) {
        if (obj[SIS.FIELD_PW]) {
            obj[SIS.FIELD_PW] = this.hashPw(obj[SIS.FIELD_PW]);
        }
        return Manager.prototype.add.call(this, obj, user, callback);
    }

    UserManager.prototype.applyUpdate = function(obj, updateObj) {
        if (updateObj[SIS.FIELD_PW]) {
            obj[SIS.FIELD_PW] = this.hashPw(updateObj[SIS.FIELD_PW]);
        }
        //return this.applyPartial(obj, updateObj);
        return Manager.prototype.applyUpdate.call(this, obj, updateObj);
    }

    UserManager.prototype.getVerifiedUser = function(username, pw, callback) {
        var self = this;
        var p = this.getById(username).then(function(u) {
            pw = self.hashPw(pw);
            if (u[SIS.FIELD_PW] != pw) {
                return Q.reject(SIS.ERR_BAD_CREDS("Invalid password."));
            } else {
                return Q(u);
            }
        });
        return Q.nodeify(p, callback);
    }

    UserManager.prototype.getOrCreateEmptyUser = function(userObj, superUser, callback) {
        var self = this;
        if (!userObj || !userObj.name || !userObj.email) {
            return callback(SIS.ERR_INTERNAL("Invalid user specified in getOrCreate"), null);
        }
        var username = userObj.name;
        this.model.findOne({name : username}, function(err, user) {
            if (err) {
                return callback(SIS.ERR_INTERNAL("Error talking to DB: " + err), null);
            }
            if (!user) {
                // create it
                user = {
                    name : username,
                    email : userObj.email,
                    roles : { },
                    super_user : false
                };
                return self.add(user, superUser, callback);
            } else {
                // found
                return callback(null, user);
            }
        });
    }

    UserManager.prototype.authorize = function(evt, doc, user, mergedDoc) {
        if (!this.authEnabled) {
            return Q(mergedDoc || doc);
        }
        if (!user) {
            return Q.reject(SIS.ERR_BAD_CREDS("User is null."));
        }
        // super users do it all
        if (user[SIS.FIELD_SUPERUSER]) {
            return Q(mergedDoc || doc);
        }
        if (!user[SIS.FIELD_ROLES]) {
            return Q.reject(SIS.ERR_BAD_CREDS("User has no roles."));
        }
        // doc is a user object
        switch (evt) {
            case SIS.EVENT_INSERT:
            case SIS.EVENT_DELETE:
                if (doc[SIS.FIELD_SUPERUSER] && !user[SIS.FIELD_SUPERUSER]) {
                    return Q.reject(SIS.ERR_BAD_CREDS("Only superusers can " + evt + " superusers."));
                }
                if (!SIS.UTIL_ENSURE_ROLE_SUBSET(user[SIS.FIELD_ROLES], doc[SIS.FIELD_ROLES], true)) {
                    return Q.reject(SIS.ERR_BAD_CREDS("Cannot " + evt + " user unless admin of all roles."));
                }
                if (doc[SIS.FIELD_NAME] == user[SIS.FIELD_NAME]) {
                    return Q.reject(SIS.ERR_BAD_CREDS("Cannot " + evt + " a user with the same name."));
                }
                return Q(doc);
            default: // update
                // if changing roles, then an admin of the roles being added/removed
                // are allowed..
                if (doc[SIS.FIELD_SUPERUSER] && !user[SIS.FIELD_SUPERUSER] ||
                    mergedDoc[SIS.FIELD_SUPERUSER] && !user[SIS.FIELD_SUPERUSER]) {
                    return Q.reject(SIS.ERR_BAD_CREDS("Only superusers can update superusers."));
                }
                if (!SIS.UTIL_ROLES_EQUAL(doc, mergedDoc)) {
                    // changing roles
                    if (doc[SIS.FIELD_NAME] == user[SIS.FIELD_NAME]) {
                        return Q.reject(SIS.ERR_BAD_CREDS("User's cannot change their own roles."));
                    }
                    // need to get the diffs..
                    var userRoles = user[SIS.FIELD_ROLES];
                    var roleDiff = jsondiff.diff(doc[SIS.FIELD_ROLES], mergedDoc[SIS.FIELD_ROLES]);
                    for (var k in roleDiff) {
                        // need to make sure the user is an admin of the role being added/deleted/updated
                        if (!(k in userRoles) || userRoles[k] != SIS.ROLE_ADMIN) {
                            return Q.reject(SIS.ERR_BAD_CREDS(user[SIS.FIELD_NAME] + " is not an admin of role " + k));
                        }
                    }
                    // non role fields can't be changed here.
                    for (var k in doc) {
                        if (k != SIS.FIELD_ROLES && k != SIS.FIELD_UPDATED_BY) {
                            if (k in mergedDoc && mergedDoc[k].toString() != doc[k].toString()) {
                                // can't change this field.
                                return Q.reject(SIS.ERR_BAD_CREDS("Only the user or a super user can change non role fields. (" + k + ")"));
                            }
                        }
                    }
                } else {
                    // not changing roles.. only fields
                    if (doc[SIS.FIELD_NAME] != user[SIS.FIELD_NAME]) {
                        return Q.reject(SIS.ERR_BAD_CREDS("Only the user or a super user can change non role fields."));
                    }
                    if (SIS.FIELD_VERIFIED in doc && doc[SIS.FIELD_VERIFIED] != mergedDoc[SIS.FIELD_VERIFIED]) {
                        return Q.reject(SIS.ERR_BAD_REQ("Cannot change verified state of self."));
                    }
                }
                return Q(mergedDoc);

        }
    }

    UserManager.prototype.objectRemoved = function(user) {
        // remove all tokens where username = user[name];
        var tokenManager = this.sm.auth[SIS.SCHEMA_TOKENS];
        var d = Q.defer();
        tokenManager.model.remove({username : user[SIS.FIELD_NAME]}, function(err) {
            if (err) {
                d.reject(SIS.ERR_INTERNAL("Unable to clear tokens for user."));
            } else {
                d.resolve(user);
            }
        });
        return d.promise;
    }

    UserManager.prototype.validate = function(obj, isUpdate) {
        if (!obj || !obj[SIS.FIELD_NAME]) {
            return "User must have a name.";
        }
        return SIS.UTIL_VALIDATE_ROLES(obj, true);
    }
    /////////////////////////////////

    module.exports = function(sm) {
        return new UserManager(sm);
    }

})();