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

    /////////////////////////////////
    // Hiera controller
    function HookController(config) {
        var opts = { };
        opts[SIS.OPT_LOG_COMMTS] = true;
        opts[SIS.OPT_TYPE] = SIS.SCHEMA_HOOKS;
        ApiController.call(this, config, opts);
        this.manager = require("../util/hook-manager")(this.sm);
    }

    // inherit
    HookController.prototype.__proto__ = ApiController.prototype;
    /////////////////////////////////

    // all route controllers expose a setup method
    module.exports.setup = function(app, config) {
        var controller = new HookController(config);
        controller.attach(app, "/api/v1/hooks");
    }

})();

