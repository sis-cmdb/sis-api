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

    var Common = require("./common");

    var SchemaController = function(config) {

        var self = this;
        var mongoose = config['mongoose'];
        var schemaManager = require('../util/schema-manager')(mongoose);

        this.getAll = function(req, res) {
            var query = req.query.q || {};
            // try parsing..
            try {
                query = JSON.parse(query);                
            } catch (ex) {                
                query = {};
            }
            var limit = parseInt(req.query.limit) || Common.MAX_RESULTS;
            if (limit > Common.MAX_RESULTS) { limit = Common.MAX_RESULTS };
            var offset = parseInt(req.query.offset) || 0;
            schemaManager.getAll(query, { limit : limit, skip : offset }, function(err, results) {
                Common.sendObject(res, 200, results);
            });
        }

        this.get = function(req, res) {
            var schemaName = req.params.id;
            schemaManager.getByName(schemaName, function(err, result) {
                if (err || !result) {
                    Common.sendError(res, 404, "Schema with name " + name + " not found.");
                } else {
                    Common.sendObject(res, 200, result);
                }
            });
        }

        this.delete = function(req, res) {
            var schemaName = req.params.id;
            schemaManager.deleteSchema(schemaName, function(err, result) {
                if (err) {
                    Common.sendError(res, 404, "Unable to delete schema with name " + name + " : " + err);
                } else {
                    Common.sendObject(res, 200, true);
                }
            })
        }

        this.add = function(req, res) {
            schemaManager.addSchema(req.body, function(err, entity) {
                if (err) {
                    Common.sendError(res, 400, "Unable to save schema " + err);
                } else {
                    Common.sendObject(res, 201, entity);
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
            schemaManager.updateSchema(sisSchema, function(err, entity) {
                if (err) {
                    Common.sendError(res, 400, "Unable to update schema " + err);
                } else {
                    Common.sendObject(res, 200, entity);
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

