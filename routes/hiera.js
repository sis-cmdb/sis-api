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

    var Manager = require("../util/manager");
    var ApiController = require("./apicontroller");
    var SIS = require("../util/constants");
    var Q = require("q");

    /////////////////////////////////
    // Hiera Manager
    // hiera overrides
    function HieraManager(sm) {
        var model = sm.getSisModel(SIS.SCHEMA_HIERA);
        var opts = { };
        opts[SIS.OPT_TYPE] = SIS.SCHEMA_HIERA;
        Manager.call(this, model, opts);
    }

    // inherit
    HieraManager.prototype.__proto__ = Manager.prototype;

    HieraManager.prototype.validate = function(entry, isUpdate) {
        if (!entry || !entry.name || typeof entry.name != 'string') {
            return "Hiera entry has an invalid or missing name";
        }
        var name = entry.name;
        var hieradata = entry.hieradata;
        try {
            // validate it's an object
            if (Object.keys(entry.hieradata).length == 0) {
                return "hieradata cannot be empty";
            }
        } catch (ex) {
            return "hieradata is not a valid object";
        }
        return null;
    }

    HieraManager.prototype.applyUpdate = function(doc, updateObj) {
        /* allow partial update */
        doc.hieradata = this.applyPartial(doc.hieradata, updateObj.hieradata);
        return doc;
    }
    /////////////////////////////////

    /////////////////////////////////
    // Hiera controller
    function HieraController(config) {
        var opts = { };
        opts[SIS.OPT_LOG_COMMTS] = true;
        opts[SIS.OPT_FIRE_HOOKS] = true;
        opts[SIS.OPT_TYPE] = SIS.SCHEMA_HIERA;
        ApiController.call(this, config, opts);
        this.manager = new HieraManager(this.sm);
    }

    // inherit
    HieraController.prototype.__proto__ = ApiController.prototype;

    HieraController.prototype.convertToResponseObject = function(req, obj) {
        if (req.method == "GET" && req.params.id) {
            return Q(obj['hieradata']);
        }
        return Q(obj);
    }
    /////////////////////////////////

    // all route controllers expose a setup method
    module.exports.setup = function(app, config) {
        var controller = new HieraController(config);
        controller.attach(app, "/api/v1/hiera");
    }

})();