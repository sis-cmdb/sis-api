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

(function() {

    var passport = require('passport');
    var BasicStrategy = require('passport-http').BasicStrategy;
    var SIS = require("../util/constants");
    var Q = require("q");
    var util = require("util");

    // authorization using sis_tokens
    var _verifyUserPass = function(user, pass, done) {
        var userManager = this.auth[SIS.SCHEMA_USERS];
        userManager.getVerifiedUser(user, pass, done);
    };

    var _verifySisToken = function(token, done) {
        var tokenManager = this.auth[SIS.SCHEMA_TOKENS];
        var userManager = this.auth[SIS.SCHEMA_USERS];
        var p = tokenManager.getById(token).then(function(t) {
            // check if the token has expired
            if (t[SIS.FIELD_EXPIRES]) {
                var expires = t[SIS.FIELD_EXPIRES];
                var timeLeft = expires.getTime() - Date.now();
                if (timeLeft <= 0) {
                    // no good
                    return Q.reject(SIS.ERR_BAD_CREDS("Token has expired."));
                }
            }
            return userManager.getById(t[SIS.FIELD_USERNAME]);
        });
        return Q.nodeify(p, done);
    };

    // need a schema manager for the strategies
    module.exports.createUserPassStrategy = function(sm) {
        return new BasicStrategy({}, _verifyUserPass.bind(sm));
    }

    function SisTokenStrategy(sm) {
        var opts = { realm : SIS.SCHEMA_TOKENS };
        this._verify = _verifySisToken.bind(sm);
        passport.Strategy.call(this);
        this.name = SIS.SCHEMA_TOKENS;
    }

    util.inherits(SisTokenStrategy, passport.Strategy);

    SisTokenStrategy.prototype.authenticate = function(req) {
        var token = req.headers[SIS.HEADER_AUTH_TOKEN];
        if (!token) { return this.error(SIS.ERR_BAD_REQ("Missing " + SIS.HEADER_AUTH_TOKEN)); }

        var self = this;
        function verified(err, user) {
            if (err) {
                return self.error(err);
            } else if (!user) {
                return self.error(SIS.ERR_BAD_CREDS("No user for the token exists."));
            }
            self.success(user);
        }

        this._verify(token, verified);
    }

    module.exports.createTokenStrategy = function(sm) {
        return new SisTokenStrategy(sm);
    }

})();
