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
    // Users
    function UserManager(sm) {
        Manager.call(this, sm.getSisModel(SIS.SCHEMA_USERS));
        this.sm = sm;
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
                return Q.reject(SIS.ERR_BAD_CREDS);
            } else {
                return Q(u);
            }
        });
        return Q.nodeify(p, callback);
    }
    /////////////////////////////////

    /////////////////////////////////
    // Services
    function ServiceManager(sm) {
        Manager.call(this, sm.getSisModel(SIS.SCHEMA_SERVICES));
        this.sm = sm;
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
    /////////////////////////////////

    /////////////////////////////////
    // Tokens
    function TokenManager(sm) {
        var opts = {};
        Manager.call(this, sm.getSisModel(SIS.SCHEMA_TOKENS), opts);
        this.sm = sm;
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
    /////////////////////////////////

    module.exports = function(sm) {
        var auth = {};
        auth[SIS.SCHEMA_USERS] = new UserManager(sm);
        auth[SIS.SCHEMA_TOKENS] = new TokenManager(sm);
        auth[SIS.SCHEMA_SERVICES] = new ServiceManager(sm);
        return auth;
    }

})();
