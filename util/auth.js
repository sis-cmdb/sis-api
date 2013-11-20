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
    var crypto = require("crypto");
    var hat = require('hat');

    function ensureRoleSubset(roles, subset, adminOnly) {
        for (var k in subset) {
            if (!(k in roles)) {
                return false;
            }
            var masterRole = roles[k];
            var subRole = subset[k];
            if (adminOnly) {
                if (masterRole != SIS.ROLE_ADMIN) {
                    return false;
                }
            } else {
                if (masterRole == SIS.ROLE_USER &&
                    subRole == SIS.ROLE_ADMIN) {
                    return false;
                }
            }
        }
        return true;
    }

    function validateRoles(obj) {
        if (!(SIS.FIELD_ROLES in obj)) {
            return "roles are missing.";
        }
        if (SIS.FIELD_SUPERUSER in obj && obj[SIS.FIELD_SUPERUSER]) {
            // ok.
            return null;
        }
        var roles = obj[SIS.FIELD_ROLES];
        try {
            var keys = Object.keys(roles);
            if (keys.length == 0) {
                return "roles cannot be empty.";
            }
            for (var i = 0; i < keys.length; ++i) {
                if (roles[i] != SIS.ROLE_USER &&
                    roles[i] != SIS.ROLE_ADMIN) {
                    return "invalid role specified: " + roles[i];
                }
            }
        } catch (ex) {
            return "roles must be a non empty object";
        }
        return null;
    }

    /////////////////////////////////
    // Users
    function UserManager(sm) {
        Manager.call(this, sm.getSisModel(SIS.SCHEMA_USERS), {});
        this.sm = sm;
        this.authEnabled = this.sm.authEnabled;
    }
    UserManager.prototype.__proto__ = Manager.prototype;

    UserManager.prototype.createToken = function(user, callback) {
        var tm = this.sm.auth[SIS.SCHEMA_TOKENS];
        var p = tm.createToken(user[SIS.FIELD_ID],
                               SIS.SCHEMA_USERS,
                               SIS.AUTH_EXPIRATION_TIME);
        return Q.nodeify(p, callback);
    }

    UserManager.prototype.hashPw = function(pw) {
        if (!pw) { return null; }
        var h = crypto.createHash('sha256');
        h.update(pw, 'utf8');
        return h.digest('hex');
    }

    // need to hash the pw
    UserManager.prototype.add = function(obj, callback) {
        if (obj[SIS.FIELD_PW]) {
            obj[SIS.FIELD_PW] = this.hashPw(obj[SIS.FIELD_PW]);
        }
        return Manager.prototype.add.call(this, obj, callback);
    }

    UserManager.prototype.applyUpdate = function(obj, updateObj) {
        if (updateObj[SIS.FIELD_PW]) {
            obj[SIS.FIELD_PW] = this.hashPw(updateObj[SIS.FIELD_PW]);
        }
        return this.applyPartial(obj, updateObj);
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

    UserManager.prototype.authorize = function(evt, doc, user, mergedDoc) {
        if (!this.authEnabled) {
            return Q(mergedDoc || doc);
        }
        if (!user || !user[SIS.FIELD_ROLES]) {
            return Q.reject(SIS.ERR_BAD_CREDS("Invalid user."));
        }
        // the only one who can make a change to a service
        // is the creator or super user
        if (user[SIS.FIELD_SUPERUSER]) {
            return Q(mergedDoc || doc);
        }
        // doc is a user object
        switch (evt) {
            case SIS.EVENT_INSERT:
            case SIS.EVENT_DELETE:
                if (doc[SIS.FIELD_SUPERUSER] && !user[SIS.FIELD_SUPERUSER]) {
                    return Q.reject(SIS.ERR_BAD_CREDS("Only superusers can " + evt + " superusers."));
                }
                if (!ensureRoleSubset(user, doc, true)) {
                    return Q.reject(SIS.ERR_BAD_CREDS("Cannot " + evt + " user unless admin of all roles."));
                }
                if (doc[SIS.FIELD_NAME] == user[SIS.FIELD_NAME]) {
                    return Q.reject(SIS.ERR_BAD_CREDS("Cannot " + evt + " a user with the same name."));
                }
                return Q(doc);
            default: // update
                // if changing roles, then an admin of the roles being added/removed
                // are allowed..
                if (doc[SIS.FIELD_SUPERUSER] && !user[SIS.FIELD_SUPERUSER]) {
                    return Q.reject(SIS.ERR_BAD_CREDS("Only superusers can update superusers."));
                }
                if (!SIS.UTIL_ROLES_EQUAL(doc, mergedDoc)) {
                    // changing roles
                    if (doc[SIS.FIELD_NAME] == user[SIS.FIELD_NAME]) {
                        return Q.reject(SIS.ERR_BAD_CREDS("User's cannot change their own roles."));
                    }
                } else {
                    // not changing roles.. only fields
                    if (doc[SIS.FIELD_NAME] != user[SIS.FIELD_NAME]) {
                        return Q.reject(SIS.ERR_BAD_CREDS("Only the user or a super user can change non role fields."));
                    }
                }
                return Q(mergedDoc);

        }
    }

    UserManager.prototype.validate = function(obj, isUpdate) {
        if (!obj || !obj[SIS.FIELD_NAME]) {
            return "User must have a name.";
        }
        return validateRoles(obj);
    }
    /////////////////////////////////

    /////////////////////////////////
    // Services
    function ServiceManager(sm) {
        Manager.call(this, sm.getSisModel(SIS.SCHEMA_SERVICES), {});
        this.sm = sm;
        this.authEnabled = this.sm.authEnabled;
    }
    ServiceManager.prototype.__proto__ = Manager.prototype;

    // Need to add a service token when adding a service
    ServiceManager.prototype.add = function(obj, callback) {
        var self = this;
        var tm = this.sm.auth[SIS.SCHEMA_TOKENS];
        var p = Manager.prototype.add.call(this, obj);
        p = p.then(function(svc) {
            var tp = tm.createToken(svc[SIS.FIELD_ID], SIS.SCHEMA_SERVICES);
            tp.then(function(token) {
                svc[SIS.FIELD_TOKEN] = token[FIELD_NAME];
                return self._save(svc);
            });
        });
        return Q.nodeify(p, callback);
    }

    ServiceManager.prototype.applyUpdate = function(svc, updateObj) {
        // only change the description
        svc[SIS.FIELD_DESC] = updateObj[SIS.FIELD_DESC];
        // and roles
        this.applyPartial(svc[SIS.FIELD_ROLES], updateObj[SIS.FIELD_ROLES]);
        return svc;
    }

    ServiceManager.prototype.authorize = function(evt, doc, user, mergedDoc) {
        if (!this.authEnabled) {
            return Q(mergedDoc || doc);
        }
        if (!user || !user[SIS.FIELD_ROLES]) {
            return Q.reject(SIS.ERR_BAD_CREDS("Invalid user."));
        }
        // the only one who can make a change to a service
        // is the creator or super user
        if (user[SIS.FIELD_SUPERUSER]) {
            return Q(mergedDoc || doc);
        }
        if (user[SIS.FIELD_NAME] != doc[SIS.FIELD_CREATOR]) {
            return Q.reject(SIS.ERR_BAD_CREDS("User is not superuser or creator."));
        }
        // doc is a service object..
        if (evt == SIS.EVENT_INSERT || evt == SIS.EVENT_UPDATE) {
            // ensure the service being added has equivalent or subset of roles
            var serviceDoc = mergedDoc || doc;
            if (!ensureRoleSubset(user[SIS.FIELD_ROLES], serviceDoc[SIS.FIELD_ROLES], false)) {
                return Q.reject(SIS.ERR_BAD_CREDS("User cannot grant service privileges higher than creator."));
            }
        }
        // creators can delete their own services.
       return Q(mergedDoc || doc);
    }

    ServiceManager.prototype.validate = function(obj, isUpdate) {
        if (!obj || !obj[SIS.FIELD_NAME]) {
            return "Service must have a name.";
        }
        return validateRoles(obj);
    }
    /////////////////////////////////

    /////////////////////////////////
    // Tokens
    function TokenManager(sm) {
        var opts = {};
        Manager.call(this, sm.getSisModel(SIS.SCHEMA_TOKENS), opts);
        this.sm = sm;
        this.authEnabled = this.sm.authEnabled;
    }
    TokenManager.prototype.__proto__ = Manager.prototype;

    // auto populate single getter
    TokenManager.prototype.getById = function(id, callback) {
        var p = Manager.prototype.getById.call(this, id);
        p = p.then(this.populate.bind(this));
        return Q.nodeify(p, callback);
    }

    TokenManager.prototype.createToken = function(id, type, expiration) {
        var d = Q.defer();
        var refObj = {};
        refObj[type] = id;
        var token = { type : type, ref : refObj };
        if (expiration) {
            token[SIS.FIELD_EXPIRES] = new Date();
        }

        // save token
        var self = this;
        var d = Q.defer();
        var createTokenHelper = function() {
            token['name'] = hat();
            var doc = new self.model(token);
            doc.save(function(err, result) {
                if (err) {
                    if (err.code == 11000) {
                        createTokenHelper(token, d);
                    } else {
                        d.reject(SIS.ERR_INTERNAL(err));
                    }
                } else {
                    d.resolve(result);
                }
            })
        }
        createTokenHelper();
        return d.promise.then(this.populate.bind(this));
    }

    // always authorize - this is an internal thing only.
    TokenManager.prototype.authorize = function(evt, doc, user, mergedDoc) {
        return Q(mergedDoc || doc);
    }
    /////////////////////////////////

    module.exports = function(sm) {
        var auth = {};
        auth[SIS.SCHEMA_USERS] = new UserManager(sm);
        auth[SIS.SCHEMA_TOKENS] = new TokenManager(sm);
        auth[SIS.SCHEMA_SERVICES] = new ServiceManager(sm);
        return auth;
    }

})();
