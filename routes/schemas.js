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

    var Common = require("./common");

    var SchemaController = function(config) {

        var self = this;
        var schemaManager = config['schemaManager'];
        var hookManager = require('../util/hook-manager')(schemaManager);
        var historyManager = require('../util/history-manager')(schemaManager);
        this.historyManager = historyManager;

        this.getAll = function(req, res) {
            Common.getAll(req, res, schemaManager.model);
        }

        this.get = function(req, res) {
            var schemaName = req.params.id;
            schemaManager.getByName(schemaName, function(err, result) {
                if (err || !result) {
                    Common.sendError(res, 404, "Schema with name " + schemaName + " not found.");
                } else {
                    Common.sendObject(res, 200, result);
                }
            });
        }

        this.delete = function(req, res) {
            var schemaName = req.params.id;
            schemaManager.deleteSchema(schemaName, function(err, result) {
                if (err) {
                    Common.sendError(res, 404, "Unable to delete schema with name " + schemaName + " : " + err);
                } else {
                    historyManager.recordHistory(result, null, req, schemaManager.SIS_SCHEMA_NAME, function(err, history) {
                        Common.sendObject(res, 200, true);
                        hookManager.dispatchHooks(result, schemaManager.SIS_SCHEMA_NAME, hookManager.EVENT_DELETE);
                    });
                }
            })
        }

        this.add = function(req, res) {
            schemaManager.addSchema(req.body, function(err, entity) {
                if (err) {
                    Common.sendError(res, 400, "Unable to save schema " + err);
                } else {
                    historyManager.recordHistory(null, entity, req, schemaManager.SIS_SCHEMA_NAME, function(err, history) {
                        Common.sendObject(res, 201, entity);
                        hookManager.dispatchHooks(entity, schemaManager.SIS_SCHEMA_NAME, hookManager.EVENT_INSERT);
                    });
                }
            });
        }

        this.update = function(req, res) {
            var schemaName = req.params.id;
            var sisSchema = req.body;
            if (!sisSchema || sisSchema.name != schemaName) {
                Common.sendError(res, 400, "Schema name cannot be changed.");
                return;
            }
            schemaManager.updateSchema(sisSchema, function(err, entity, oldValue) {
                if (err) {
                    Common.sendError(res, 400, "Unable to update schema " + err);
                } else if (!entity) {
                    Common.sendError(res, 404, "Schema not found");
                } else {
                    historyManager.recordHistory(oldValue, entity, req, schemaManager.SIS_SCHEMA_NAME, function(err, history) {
                        Common.sendObject(res, 200, entity);
                        hookManager.dispatchHooks(entity, schemaManager.SIS_SCHEMA_NAME, hookManager.EVENT_UPDATE);
                    });
                }
            });
        }
    }

    // all route controllers expose a setup method
    module.exports.setup = function(app, config) {
        var controller = new SchemaController(config);
        Common.attachController(app, controller, "/api/v1/schemas");
    }

})();

