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
            if (SIS.UTIL_ENSURE_ROLE_SUBSET(user[SIS.FIELD_ROLES], tokenUser[SIS.FIELD_ROLES], true)) {
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
        return new TokenManager(sm);
    }

})();
