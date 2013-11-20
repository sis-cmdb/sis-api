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
                .then(this.manager.createToken.bind(this.manager));
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
    // Services controller (user level)
    function ServiceController(config) {
        var opts = { };
        opts[SIS.OPT_LOG_COMMTS] = true;
        opts[SIS.OPT_TYPE] = SIS.SCHEMA_SERVICES;
        SIS.UTIL_MERGE_SHALLOW(opts, config);
        ApiController.call(this, opts);
        this.manager = this.sm.auth[SIS.SCHEMA_SERVICES];
        this.userManager = this.sm.auth[SIS.SCHEMA_USERS];
    }

    // inherit
    ServiceController.prototype.__proto__ = ApiController.prototype;
    /////////////////////////////////

    // all route controllers expose a setup method
    module.exports.setup = function(app, config) {
        if (!config[SIS.OPT_USE_AUTH]) {
            return;
        }
        var controller = new UserController(config);
        controller.attach(app, "/api/v1/users");

        // services
        controller = new ServiceController(config);
        controller.attach(app, "/api/v1/users/:uid/services");
    }

})();