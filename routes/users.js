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

// API for schemas
(function() {

    'use strict';

    var ApiController = require("./apicontroller");
    var SIS = require("../util/constants");
    var passport = require("passport");
    var Q = require("q");

    /////////////////////////////////
    // User controller
    function UserController(config) {
        var opts = { };
        // TODO - secure this when enabling.
        //opts[SIS.OPT_LOG_COMMTS] = true;
        opts[SIS.OPT_TYPE] = SIS.SCHEMA_USERS;
        SIS.UTIL_MERGE_SHALLOW(opts, config);
        ApiController.call(this, opts);
        this.manager = this.sm.auth[SIS.SCHEMA_USERS];
    }

    // inherit
    require('util').inherits(UserController, ApiController);

    // extend attach to also attach the token request route
    UserController.prototype.attach = function(app, prefix) {
        ApiController.prototype.attach.call(this, app, prefix);
        this.auth_token_path = prefix + "/auth_token";
        app.post(this.auth_token_path, function(req, res) {
            var p = this.authenticate(req, res, 'basic')
                .then(this.manager.createTempToken.bind(this.manager));
            // hacky
            return this._finish(req, res, p, 201);
        }.bind(this));
    };

    // No password hashes should be returned.
    UserController.prototype.convertToResponseObject = function(req, o) {
        var res = o.toObject();
        if (req.method == "POST" && req.path == this.auth_token_path) {
            // token
            var expireDate = o[SIS.FIELD_EXPIRES];
            var timeLeft = expireDate.getTime() - Date.now();
            if (timeLeft <= 0) {
                timeLeft = 0;
            }
            res[SIS.FIELD_EXPIRES] = timeLeft;
        } else {
            delete res.pw;
        }
        return res;
    };
    /////////////////////////////////

    // all route controllers expose a setup method
    module.exports.setup = function(app, config) {
        if (!config[SIS.OPT_USE_AUTH]) {
            return;
        }
        var controller = new UserController(config);
        controller.attach(app, "/api/v1/users");
    };

})();