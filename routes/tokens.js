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
// API for schemas
(function() {

    var ApiController = require("./apicontroller");
    var SIS = require("../util/constants");
    var passport = require("passport");
    var Q = require("q");

    /////////////////////////////////
    // Token controller (user level)
    function TokenController(config) {
        var opts = { };
        // TODO - secure this when enabling.
        //opts[SIS.OPT_LOG_COMMTS] = true;
        opts[SIS.OPT_TYPE] = SIS.SCHEMA_TOKENS;
        SIS.UTIL_MERGE_SHALLOW(opts, config);
        ApiController.call(this, opts);
        this.manager = this.sm.auth[SIS.SCHEMA_TOKENS];
        this.userManager = this.sm.auth[SIS.SCHEMA_USERS];
    }

    // inherit
    TokenController.prototype.__proto__ = ApiController.prototype;

    TokenController.prototype.applyDefaults = function(req) {
        if (req.method == "GET" && req[SIS.FIELD_TOKEN_USER]) {
            var rq = this.parseQuery(req);
            var query = rq['query'];
            query[SIS.FIELD_USERNAME] = req[SIS.FIELD_TOKEN_USER][SIS.FIELD_NAME];
            req.query.q = query;
        }
    }

    TokenController.prototype.convertToResponseObject = function(req, o) {
        var convertToken = function(token) {
            if (token[SIS.FIELD_EXPIRES]) {
                // change it to be a time in MS
                var d = token[SIS.FIELD_EXPIRES];
                var timeLeft = d.getTime() - Date.now();
                if (timeLeft <= 0) {
                    timeLeft = 0;
                }
                token[SIS.FIELD_EXPIRES] = timeLeft;
            }
            return token;
        }
        if (o instanceof Array) {
            o = o.map(convertToken);
        } else {
            o = convertToken(o);
        }
        return o;
    }

    // override main entry points to ensure user exists..
    TokenController.prototype.ensureUser = function(req, callback) {
        var uid = req.params.uid;
        return Q.nodeify(this.userManager.getById(uid), callback);
    }

    var fixBody = function(req) {
        if (req.method == "PUT" || req.method == "POST") {
            var obj = req.body;
            if (obj) {
                obj[SIS.FIELD_TOKEN_USER] = req[SIS.FIELD_TOKEN_USER][SIS.FIELD_NAME];
                delete obj[SIS.FIELD_EXPIRES];
            }
        }
    }

    TokenController.prototype.wrapApi = function() {
        var self = this;
        // takes in an api controller function(req, res), and
        // returns a wrapper around it
        var wrapFunc = function(func) {
            return function(req, res) {
                self.ensureUser(req, function(e, user) {
                    if (e) {
                        return self.sendError(res, e);
                    } else {
                        req[SIS.FIELD_TOKEN_USER] = user;
                        fixBody(req);
                        if (req.method == "GET") {
                            // need to ensure that only admins of the user
                            // super users, or the user himself are
                            // getting the tokens
                            var p = self.authenticate(req, res, SIS.SCHEMA_TOKENS);
                            Q.nodeify(p, function(err, auth) {
                                if (err) { return self.sendError(res, err); }
                                if (self.manager.canAdministerTokensOf(req.user, user)) {
                                    func.call(self, req, res);
                                } else {
                                    return self.sendError(res, SIS.ERR_BAD_CREDS("Cannot read tokens for user."));
                                }
                            });
                        } else {
                            func.call(self, req, res);
                        }
                    }
                });
            }
        }
        var apis = ['get', 'getAll', 'update', 'add', 'delete'];
        for (var i = 0; i < apis.length; ++i) {
            var fname = apis[i];
            this[fname] = wrapFunc(ApiController.prototype[fname]).bind(this);
        }
    }

    /////////////////////////////////

    // all route controllers expose a setup method
    module.exports.setup = function(app, config) {
        if (!config[SIS.OPT_USE_AUTH]) {
            return;
        }

        var controller = new TokenController(config);
        controller.wrapApi();
        controller.attach(app, "/api/v1/users/:uid/tokens");
    }

})();