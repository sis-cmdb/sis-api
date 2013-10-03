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

    var Common = require("./common.js");

    var SchemaController = function(config) {

        var self = this;
        var mongoose = config['mongoose'];
        var schemaManager = require('../util/schema-manager')(mongoose);

        this.getAll = function(req, res) {
            schemaManager.getAll(function(err, results) {
                res.send(200, results);
            });
        }

        this.get = function(req, res) {

        }

        this.delete = function(req, res) {

        }

        this.add = function(req, res) {
            var name = req.body.name;
            var schema = req.body.definition;
            if (!name || typeof schema != 'object') {
                Common.sendError(res, 400, "JSON object must contain a 'name', and a 'definition' object");
                return;
            }
            // TODO: check if one exists

            schemaManager.addSchema({"name" : name, "definition" : schema}, function(err, entity) {
                if (err) {
                    Common.sendError(res, 400, "Unable to save schema " + err);
                } else {
                    res.send(201, entity);
                }
            });
        }

        this.update = function(req, res) {

        }
    } 

    // all route controllers expose a setup method
    module.exports.setup = function(app, config) {
        var controller = new SchemaController(config);
        Common.attachController(app, controller, "/api/v1/schemas");
    }

})();

