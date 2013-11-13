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

    var HieraController = function(config) {

        var self = this;
        var schemaManager = config['schemaManager'];

        var hookManager = require('../util/hook-manager')(schemaManager);
        self.historyManager = require("../util/history-manager")(schemaManager);
        self.model = null;

        // initializer funct
        var init = function() {
            // Get the model from the definition and name
            self.model = schemaManager.getSisModel(SIS.SCHEMA_HIERA);
            if (!self.model) {
                throw "Model is null for " + SIS.SCHEMA_HIERA;
            }
        }

        this.getAll = function(req, res) {
            Common.getAll(req, res, self.model);
        }

        this.get = function(req, res) {
            var hieraName = req.params.id;
            self.model.findOne({"name" : hieraName}, function(err, result) {
                if (err || !result) {
                    Common.sendError(res, 404, "HieraData for " + hieraName + " not found.");
                } else {
                    Common.sendObject(res, 200, result['hieradata']);
                }
            });
        }

        this.delete = function(req, res) {
            var hieraName = req.params.id;
            self.model.findOne({"name" : hieraName}, function(err, result) {
                if (err || !result) {
                    Common.sendError(res, 404, "HieraData for " + hieraName + " not found.");
                } else {
                    // delete the hiera entry by the id
                    result.remove(function(err) {
                        if (err) {
                            Common.sendError(res, 500, "Could not delete hieradata for " + id + ": " + err);
                        } else {
                            self.historyManager.recordHistory(result, null, req, SIS.SCHEMA_HIERA, function(err, history) {
                                Common.sendObject(res, 200, true);
                                hookManager.dispatchHooks(result, SIS.SCHEMA_HIERA, SIS.EVENT_DELETE);
                            });
                        }
                    });
                }
            });
        }

        var validateEntry = function(entry) {
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

        this.add = function(req, res) {
            var entry = req.body;
            var err = validateEntry(entry);
            if (err) {
                Common.sendError(res, 400, err);
                return;
            }
            entry = new self.model(entry);
            entry.save(function(err, result) {
                if (err) {
                    Common.sendError(res, 500, "Unable to add hieradata: " + err);
                } else {
                    self.historyManager.recordHistory(null, result, req, SIS.SCHEMA_HIERA, function(err, history) {
                        Common.sendObject(res, 201, result);
                        hookManager.dispatchHooks(result, SIS.SCHEMA_HIERA, SIS.EVENT_INSERT);
                    });
                }
            });
        }

        this.update = function(req, res) {
            var entry = req.body;
            var err = validateEntry(entry);
            if (err) {
                Common.sendError(res, 400, err);
                return;
            }
            var id = req.params.id;
            if (id != entry.name) {
                Common.sendError(res, 400, "Name in body does not match name in path.");
                return;
            }
            // find it and update
            self.model.findOne({"name" : entry.name}, function(err, result) {
                if (err || !result) {
                    Common.sendError(res, 404, "HieraData for " + id + " not found.");
                } else {
                    var oldObj = result.toObject();
                    /* allow partial update */
                    result.hieradata = Common.merge(result.hieradata, entry.hieradata);
                    result.save(function(err, updated) {
                        if (err) {
                            Common.sendError(res, 500, "Unable to save hieradata: " + err);
                        } else {
                            self.historyManager.recordHistory(oldObj, updated, req, SIS.SCHEMA_HIERA, function(err, history) {
                                Common.sendObject(res, 200, updated);
                                hookManager.dispatchHooks(updated, SIS.SCHEMA_HIERA, SIS.EVENT_UPDATE);
                            });
                        }
                    });
                }
            });
        }

        init();
    }

    // all route controllers expose a setup method
    module.exports.setup = function(app, config) {
        var controller = new HieraController(config);
        Common.attachController(app, controller, "/api/v1/hiera");
    }

})();