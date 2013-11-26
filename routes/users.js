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
    // User controller
    function UserController(config) {
        var opts = { };
        opts[SIS.OPT_LOG_COMMTS] = true;
        opts[SIS.OPT_TYPE] = SIS.SCHEMA_USERS;
        SIS.UTIL_MERGE_SHALLOW(opts, config);
        ApiController.call(this, opts);
        this.manager = this.sm.auth[SIS.SCHEMA_USERS];
    }

    // inherit
    UserController.prototype.__proto__ = ApiController.prototype;

    // modify attach to also attach the token request route
    UserController.prototype.attach = function(app, prefix) {
        ApiController.prototype.attach.call(this, app, prefix);
        var self = this;
        app.post(prefix + "/auth_token", function(req, res) {
            var p = self.authenticate(req, res, 'basic')
                .then(this.manager.createTempToken.bind(this.manager));
            // passport.authenticate('basic', { session: false })
            return this._finish(req, res, p, 201);
        }.bind(this));
    }

    UserController.prototype.convertToResponseObject = function(req, o) {
        if (o instanceof Array) {
            for (var i = 0; i < o.length; ++i) {
                delete o[i][SIS.FIELD_PW];
            }
        } else {
            delete o[SIS.FIELD_PW];
        }
        return o;
    }
    /////////////////////////////////

    /////////////////////////////////
    // Token controller (user level)
    function TokenController(config) {
        var opts = { };
        opts[SIS.OPT_LOG_COMMTS] = true;
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
                        func.call(self, req, res);
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
        var controller = new UserController(config);
        controller.attach(app, "/api/v1/users");

        // services
        controller = new TokenController(config);
        controller.wrapApi();
        controller.attach(app, "/api/v1/users/:uid/tokens");
    }

})();