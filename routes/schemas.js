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
    var SIS = require("../util/constants");

    var SchemaController = function(config) {

        var self = this;
        var schemaManager = config['schemaManager'];
        var hookManager = require('../util/hook-manager')(schemaManager);
        self.historyManager = require('../util/history-manager')(schemaManager);

        this.getAll = function(req, res) {
            Common.getAll(req, res, schemaManager.model);
        }

        this.get = function(req, res) {
            var schemaName = req.params.id;
            schemaManager.getByName(schemaName, function(err, result) {
                if (err) {
                    Common.sendError(res, err);
                } else {
                    Common.sendObject(res, 200, result);
                }
            });
        }

        this.delete = function(req, res) {
            var schemaName = req.params.id;
            schemaManager.deleteSchema(schemaName, function(err, result) {
                if (err) {
                    Common.sendError(res, err);
                } else {
                    self.historyManager.recordHistory(result, null, req, SIS.SCHEMA_SCHEMAS, function(err, history) {
                        Common.sendObject(res, 200, true);
                        hookManager.dispatchHooks(result, SIS.SCHEMA_SCHEMAS, SIS.EVENT_DELETE);
                    });
                }
            })
        }

        this.add = function(req, res) {
            schemaManager.addSchema(req.body, function(err, entity) {
                if (err) {
                    Common.sendError(res, err);
                } else {
                    self.historyManager.recordHistory(null, entity, req, SIS.SCHEMA_SCHEMAS, function(err, history) {
                        Common.sendObject(res, 201, entity);
                        hookManager.dispatchHooks(entity, SIS.SCHEMA_SCHEMAS, SIS.EVENT_INSERT);
                    });
                }
            });
        }

        this.update = function(req, res) {
            var schemaName = req.params.id;
            var sisSchema = req.body;
            if (sisSchema && sisSchema.name != schemaName) {
                return Common.sendError(res, SIS.ERR_BAD_REQ("Cannot change schema name."));
            }
            schemaManager.updateSchema(sisSchema, function(err, entity, oldValue) {
                if (err) {
                    Common.sendError(res, err);
                } else {
                    self.historyManager.recordHistory(oldValue, entity, req, SIS.SCHEMA_SCHEMAS, function(err, history) {
                        Common.sendObject(res, 200, entity);
                        hookManager.dispatchHooks(entity, SIS.SCHEMA_SCHEMAS, SIS.EVENT_UPDATE);
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

