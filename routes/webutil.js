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
    var getBody = require('raw-body');

    // authorization using user and pass via the user manager
    var _verifyUserPass = function(user, pass, done) {
        var userManager = this.auth[SIS.SCHEMA_USERS];
        userManager.getVerifiedUser(user, pass, done);
    };

    // authorization using sis_tokens
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

    // The passport strategy for authenticating x-auth-token
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

    // middleware - json parser
    // from connect.js slightly modified
    // to accept single line comments in json
    module.exports.json = function(options) {
        options = options || {};
        var limit = options.limit || '1mb';

        return function json(req, res, next) {
            if (req._body) return next();
            req.body = req.body || {};

            var hasBody = 'content-length' in req.headers && req.headers['content-length'] !== '0';
            var mimeType = req.headers['content-type'] || '';
            if (!hasBody || mimeType != 'application/json') {
                return next();
            }

            // flag as parsed
            req._body = true;

            // parse
            getBody(req, {
                limit: limit,
                expected: req.headers['content-length']
            }, function (err, buf) {
                if (err) return next(err);
                
                buf = buf.toString('utf8').trim();
                var lines = buf.split('\n')
                var filtered = lines.filter(function(s) {
                    return s.trim().indexOf("//") != 0;
                });
                buf = filtered.join("\n");

                var first = buf[0];

                if (0 == buf.length) {
                    return next(SIS.ERR_BAD_REQ('invalid json, empty body'));
                }

                if ('{' != first && '[' != first) return next(SIS.ERR_BAD_REQ('invalid json'));
                try {
                    req.body = JSON.parse(buf, options.reviver);
                } catch (err){
                    err.body = buf;
                    err.status = 400;
                    return next(SIS.ERR_BAD_REQ(err));
                }
                next();
            })
        };
    };

})();
