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

    var Common = require("./common.js");

    var HookController = function(config) {

        var self = this;
        var schemaManager = config['schemaManager'];
        var hookManager = require('../util/hook-manager')(schemaManager);

        this.getAll = function(req, res) {
            Common.getAll(req, res, hookManager.model);
        }

        this.get = function(req, res) {
            var hookName = req.params.id;
            hookManager.getByName(hookName, function(err, result) {
                if (err || !result) {
                    Common.sendError(res, 404, "Hook with name " + hookName + " not found.");
                } else {
                    Common.sendObject(res, 200, result);
                }
            });
        }

        this.delete = function(req, res) {
            var hookName = req.params.id;
            hookManager.deleteHook(hookName, function(err, result) {
                if (err) {
                    Common.sendError(res, 404, "Unable to delete hook with name " + hookName + " : " + err);
                } else {
                    Common.sendObject(res, 200, true);
                }
            })
        }

        this.add = function(req, res) {
            hookManager.addHook(req.body, function(err, entity) {
                if (err) {
                    Common.sendError(res, 400, "Unable to save hook: " + err);
                } else {
                    Common.sendObject(res, 201, entity);
                }
            });
        }

        this.update = function(req, res) {
            hookManager.updateHook(req.body, function(err, entity) {
                if (err) {
                    Common.sendError(res, 400, "Unable to update hook: " + err);
                } else if (!entity) {
                    Common.sendError(res, 404, "Hook not found");
                } else {
                    Common.sendObject(res, 200, entity);
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

