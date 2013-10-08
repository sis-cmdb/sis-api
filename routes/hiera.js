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

    var HieraController = function(config) {

        var self = this;
        var mongoose = config['mongoose'];
        var schemaManager = require('../util/schema-manager')(mongoose);

        // A mongoose.model object for HieraData
        var HieraSchemaModel = null;
        // this..
        var self = this;

        this.reservedFields = {
            "_id" : true,
            "__v" : true
        };

        // initializer funct
        var init = function() {
            // Set up the mongoose.Schema for a SIS Schema
            var definition = {
                "name" : { "type" : "String", "required" : true },
                "hieradata" : { "type" : {}, "required" : true }
            };
            var name = schemaManager.HIERA_SCHEMA_NAME;
            // Get the model from the definition and name
            HieraSchemaModel = schemaManager.getEntityModel({name : name, definition : definition, owner : "SIS"});
        }

        this.getAll = function(req, res) {
            var query = req.query.q || {};
            // try parsing..
            try {
                query = JSON.parse(query);
            } catch (ex) {
                query = {};
            }
            var limit = parseInt(req.query.limit) || Common.MAX_RESULTS;
            var offset = parseInt(req.query.offset) || 0;
            HieraSchemaModel.find(query, null, { skip : offset, limit: limit}, function(err, entities) {
                Common.sendObject(res, 200, entities);
            });
        }

        this.get = function(req, res) {
            var hieraName = req.params.id;
            HieraSchemaModel.findOne({"name" : hieraName}, function(err, result) {
                if (err || !result) {
                    Common.sendError(res, 404, "HieraData for " + name + " not found.");
                } else {                    
                    Common.sendObject(res, 200, result['hieradata']);
                }
            });
        }

        this.delete = function(req, res) {
            var hieraName = req.params.id;
            HieraSchemaModel.find({"name" : hieraName}, function(err, result) {
                if (err || !result) {
                    Common.sendError(res, 404, "HieraData for " + name + " not found.");
                } else {
                    // delete the hiera entry by the id
                    HieraSchemaModel.remove({"_id" : result['_id']}, function(err) {
                        if (err) {
                            Common.sendError(res, 500, "Could not delete hieradata for " + id + ": " + err);
                        } else {
                            Common.sendObject(res, 200, true);
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
                Object.keys(entry.hieradata);
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
            entry = new HieraSchemaModel(entry);
            entry.save(function(err, result) {
                if (err) {
                    Common.sendError(res, 500, "Unable to add hieradata: " + err);
                } else {
                    Common.sendObject(res, 201, result);
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
            HieraSchemaModel.find({"name" : entry.name}, function(err, result) {
                if (err || !result) {
                    Common.sendError(res, 404, "HieraData for " + name + " not found.");
                } else {
                    result['hieradata'] = entry.hieradata;
                    result.save(function(err, result) {
                        if (err) {
                            Common.sendError(res, 500, "Unable to save hieradata: " + err);
                        } else {
                            Common.sendObject(res, 200, result);
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