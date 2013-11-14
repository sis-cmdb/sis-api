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

    var HookController = function(config) {

        var self = this;
        var schemaManager = config['schemaManager'];
        var hookManager = require('../util/hook-manager')(schemaManager);
        self.historyManager = require('../util/history-manager')(schemaManager);

        this.getAll = function(req, res) {
            Common.getAll(req, res, hookManager.model);
        }

        this.get = function(req, res) {
            var hookName = req.params.id;
            hookManager.getByName(hookName, function(err, result) {
                if (err) {
                    Common.sendError(res, err);
                } else {
                    Common.sendObject(res, 200, result);
                }
            });
        }

        this.delete = function(req, res) {
            var hookName = req.params.id;
            hookManager.deleteHook(hookName, function(err, result) {
                if (err) {
                    Common.sendError(res, err);
                } else {
                    self.historyManager.recordHistory(result, null, req, SIS.SCHEMA_HOOKS, function(err, history) {
                        Common.sendObject(res, 200, true);
                    });
                }
            })
        }

        this.add = function(req, res) {
            hookManager.addHook(req.body, function(err, entity) {
                if (err) {
                    Common.sendError(res, err);
                } else {
                    self.historyManager.recordHistory(null, entity, req, SIS.SCHEMA_HOOKS, function(err, history) {
                        Common.sendObject(res, 201, entity);
                    });
                }
            });
        }

        this.update = function(req, res) {
            hookManager.updateHook(req.body, function(err, entity, oldValue) {
                if (err) {
                    Common.sendError(res, err);
                } else {
                    self.historyManager.recordHistory(oldValue, entity, req, SIS.SCHEMA_HOOKS, function(err, history) {
                        Common.sendObject(res, 200, entity);
                    })
                }
            });

        }
    }

    // all route controllers expose a setup method
    module.exports.setup = function(app, config) {
        var controller = new HookController(config);
        Common.attachController(app, controller, "/api/v1/hooks");
    }

})();

