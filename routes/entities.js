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

// API for entities that adhere to schemas created via
// the schemas API
(function() {

    'use strict';

    var ApiController = require("./apicontroller");
    var SIS = require("../util/constants");
    var Promise = require("bluebird");
    var createEntityManager = require("../util/entity-manager");

    //////////
    // Entity controller
    function EntityController(config) {
        var opts = { };
        opts[SIS.OPT_LOG_COMMTS] = true;
        opts[SIS.OPT_FIRE_HOOKS] = true;
        opts[SIS.OPT_ID_FIELD] = SIS.FIELD_ID;
        opts[SIS.OPT_USE_AUTH] = config[SIS.OPT_USE_AUTH];
        SIS.UTIL_MERGE_SHALLOW(opts, config);
        this.opts = opts;
        ApiController.call(this, this.opts);
    }

    // inherit
    require('util').inherits(EntityController, ApiController);

    // overrides
    // Get the manager to handle this query
    EntityController.prototype.getManager = function(req) {
        // Get the latest
        var name = this.getType(req);
        var self = this;
        return this.sm.getById(name, { lean : true }).then(function(schema) {
            var model = self.sm.getEntityModel(schema);
            var manager = createEntityManager(model, schema, self.opts);
            req.sisManager = manager;
            self.useLean = !model.schema._sis_defaultpaths.length;
            return manager;
        });
    };

    EntityController.prototype.convertToResponseObject = function(req, obj) {
        if (req.query.removeEmpty &&
            req.sisManager.model.schema._sis_arraypaths.length) {
            var paths = req.sisManager.model.schema._sis_arraypaths;
            if (!obj.toObject) {
                obj = new req.sisManager.model(obj);
            }
            paths.forEach(function(p) {
                var arr = obj.get(p);
                if (arr && arr.length === 0) {
                    obj.set(p, undefined);
                }
            });
            obj = obj.toObject();
        }
        return obj;
    };

    EntityController.prototype.shouldSaveCommit = function(req) {
        return req.sisManager &&
               req.sisManager.schema[SIS.FIELD_TRACK_HISTORY] &&
               ApiController.prototype.shouldSaveCommit.call(this, req);
    };

    // The type is the schema being requested
    EntityController.prototype.getType = function(req) {
        return req.params.schema;
    };

    // Apply the default to populate the objects returned from GET
    EntityController.prototype.applyDefaults = function(req) {
        if (req.method == "GET") {
            // need to populate..
            if (!('populate' in req.query)) {
                req.query.populate = true;
            }
        }
    };
    /////////////////////////////////

    // all route controllers expose a setup method
    module.exports.setup = function(app, config) {
        var controller = new EntityController(config);
        controller.attach(app, "/api/v1/entities/:schema");
    };

})();

