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
    var jsondiff = require("jsondiffpatch");

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

    function validateRoles(obj, isUser) {
        if (isUser) {
            // super users can get away with no roles..
            if (obj[SIS.FIELD_SUPERUSER]) {
                return null;
            }
        }
        if (!(SIS.FIELD_ROLES in obj)) {
            return "roles are missing.";
        }
        var roles = obj[SIS.FIELD_ROLES];
        try {
            var keys = Object.keys(roles);
            // allow empty roles
            if (keys.length == 0) {
                return null;
            }
            for (var i = 0; i < keys.length; ++i) {
                var k = keys[i];
                if (roles[k] != SIS.ROLE_USER &&
                    roles[k] != SIS.ROLE_ADMIN) {
                    return "invalid role specified: " + roles[k];
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
            return Q.reject(SIS.ERR_BAD_CREDS("Invalid user."));
        }
        // doc is a user object
        switch (evt) {
            case SIS.EVENT_INSERT:
            case SIS.EVENT_DELETE:
                if (doc[SIS.FIELD_SUPERUSER] && !user[SIS.FIELD_SUPERUSER]) {
                    return Q.reject(SIS.ERR_BAD_CREDS("Only superusers can " + evt + " superusers."));
                }
                if (!ensureRoleSubset(user[SIS.FIELD_ROLES], doc[SIS.FIELD_ROLES], true)) {
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
                    // need to get the diffs..
                    var userRoles = user[SIS.FIELD_ROLES];
                    var roleDiff = jsondiff.diff(doc[SIS.FIELD_ROLES], mergedDoc[SIS.FIELD_ROLES]);
                    for (var k in roleDiff) {
                        // need to make sure the user is an admin of the role being added/deleted/updated
                        if (!(k in userRoles) || userRoles[k] != SIS.ROLE_ADMIN) {
                            return Q.reject(SIS.ERR_BAD_CREDS(user[SIS.FIELD_NAME] + " is not an admin of role " + k));
                        }
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
        return validateRoles(obj, true);
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

    // override add to use createToken
    TokenManager.prototype.add = function(obj, user, callback) {
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
                    .then(this.createToken.bind(this));
        return Q.nodeify(p, callback);
    }

    TokenManager.prototype.createToken = function(token) {
        // save token
        var self = this;
        var d = Q.defer();
        var createTokenHelper = function() {
            token['name'] = hat();
            var doc = new self.model(token);
            doc.save(function(err, result) {
                if (err) {
                    if (err.code == 11000) {
                        createTokenHelper();
                    } else {
                        d.reject(SIS.ERR_INTERNAL(err));
                    }
                } else {
                    d.resolve(result);
                }
            })
        }
        createTokenHelper();
        return d.promise;
    }

    // only the user, super user
    TokenManager.prototype.authorize = function(evt, doc, user, mergedDoc) {
        if (!doc[SIS.FIELD_USERNAME]) {
            return Q.reject(SIS.ERR_BAD_REQ("Missing username in token."));
        }
        if (mergedDoc && mergedDoc[SIS.FIELD_USERNAME] != doc[SIS.FIELD_USERNAME]) {
            return Q.reject(SIS.ERR_BAD_REQ("Cannot change the username of the token."));
        }
        if (mergedDoc && mergedDoc[SIS.FIELD_EXPIRES]) {
            return Q.reject(SIS.ERR_BAD_REQ("Cannot change a temporary token."));
        }
        if (doc[SIS.FIELD_EXPIRES] && doc[SIS.FIELD_USERNAME] != user[SIS.FIELD_NAME]) {
            return Q.reject(SIS.ERR_BAD_REQ("Cannot create a temp token for another user."));
        }
        if (!this.authEnabled) {
            return Q(mergedDoc || doc);
        }
        if (!user) {
            return Q.reject(SIS.ERR_BAD_CREDS("User is null."));
        }
        if (!user[SIS.FIELD_ROLES] && !user[SIS.FIELD_SUPERUSER]) {
            return Q.reject(SIS.ERR_BAD_CREDS("Invalid user."));
        }
        // get the user
        var username = doc[SIS.FIELD_USERNAME];
        var d = Q.defer();
        this.sm.auth[SIS.SCHEMA_USERS].getById(username, function(e, tokenUser) {
            if (e) {
                return d.reject(e);
            }
            if (tokenUser[SIS.FIELD_SUPERUSER] && !doc[SIS.FIELD_EXPIRES]) {
                // super users cannot have a persistent token.  too much power
                return d.reject(SIS.ERR_BAD_REQ("Super users cannot have persistent tokens."));
            }
            // super users do the rest
            if (user[SIS.FIELD_SUPERUSER]) {
                return d.resolve(mergedDoc || doc);
            }
            // can do it all as the user.
            if (tokenUser[SIS.FIELD_NAME] == user[SIS.FIELD_NAME]) {
                return d.resolve(mergedDoc || doc);
            }
            // can this user manage the roles of the token user
            // and is admin
            if (ensureRoleSubset(user[SIS.FIELD_ROLES], tokenUser[SIS.FIELD_ROLES], true)) {
                // yep
                return d.resolve(mergedDoc || doc);
            } else {
                return d.reject(SIS.ERR_BAD_CREDS("Only admins of the user or the user can manage the token."));
            }
        });
        return d.promise;
    }
    /////////////////////////////////

    module.exports = function(sm) {
        var auth = {};
        auth[SIS.SCHEMA_USERS] = new UserManager(sm);
        auth[SIS.SCHEMA_TOKENS] = new TokenManager(sm);
        return auth;
    }

})();
