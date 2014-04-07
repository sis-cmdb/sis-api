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
    var Q = require("q");

    /////////////////////////////////
    // Hiera controller
    function HieraController(config) {
        var opts = { };
        opts[SIS.OPT_LOG_COMMTS] = true;
        opts[SIS.OPT_FIRE_HOOKS] = true;
        opts[SIS.OPT_TYPE] = SIS.SCHEMA_HIERA;
        opts[SIS.OPT_USE_AUTH] = config[SIS.OPT_USE_AUTH];
        SIS.UTIL_MERGE_SHALLOW(opts, config);
        ApiController.call(this, opts);
        this.manager = require("../util/hiera-manager")(this.sm, opts);
    }

    // inherit
    require('util').inherits(HieraController, ApiController);

    // The GET/:id request needs to send only the hiera object back
    HieraController.prototype.convertToResponseObject = function(req, obj) {
        if (req.method == "GET" && req.params.id) {
            return obj.hieradata;
        }
        return obj;
    };
    /////////////////////////////////

    // all route controllers expose a setup method
    module.exports.setup = function(app, config) {
        var controller = new HieraController(config);
        controller.attach(app, "/api/v1/hiera");
    };

})();