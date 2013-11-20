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
    function SchemaController(config) {
        var opts = { };
        opts[SIS.OPT_LOG_COMMTS] = true;
        opts[SIS.OPT_FIRE_HOOKS] = true;
        opts[SIS.OPT_TYPE] = SIS.SCHEMA_SCHEMAS;
        opts[SIS.OPT_USE_AUTH] = config[SIS.OPT_USE_AUTH];
        SIS.UTIL_MERGE_SHALLOW(opts, config);
        ApiController.call(this, opts);
        this.manager = this.sm;
    }

    // inherit
    SchemaController.prototype.__proto__ = ApiController.prototype;
    /////////////////////////////////

    // all route controllers expose a setup method
    module.exports.setup = function(app, config) {
        var controller = new SchemaController(config);
        controller.attach(app, "/api/v1/schemas");
    }

})();

