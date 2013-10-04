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

    var EntityController = function(config) {

        var self = this;
        var mongoose = config['mongoose'];
        var schemaManager = require('../util/schema-manager')(mongoose);

        this.entity = "entities";

        var getModelForType = function(type, callback) {
            schemaManager.getByName(type, function(err, result) {
                if (err) { 
                    callback(err, null); 
                } else {
                    // convert the schema object from the model to a 
                    // mongoose model we can query directly
                    callback(null, schemaManager.getEntityModel(result));
                }
            })
        }

        var getTypeFromRequest = function(req) {
            return req.params.schema;
        }

        this.getAll = function(req, res) {
            var type = getTypeFromRequest(req);
            if (!type) {
                Common.sendError(res, 400, "No type specified");
                return;
            }
            getModelForType(type, function(err, result) {
                if (err || !result) {
                    Common.sendError(res, 404, "Unknown type specified: ", type);
                } else {
                    // result is a mongoose model
                    result.find({}, function(err, entities) {
                        res.send(200, entities);
                    });
                }
            });
        }

        this.get = function(req, res) {

        }

        this.delete = function(req, res) {

        }

        this.add = function(req, res) {
            var type = getTypeFromRequest(req);
            if (!type) {
                Common.sendError(res, 400, "No type specified");
                return;
            }            
            getModelForType(type, function(err, EntityType) {                
                if (err || !EntityType) {
                    Common.sendError(res, 400, "Unknown type specified: ", type);
                } else {
                    // EntityType is a mongoose model
                    var entity = req.body;
                    var mongooseEntity = new EntityType(entity);
                    // TODO: need to cleanup the entity returned to callback
                    mongooseEntity.save(function(err, result) {
                        if (err) {
                            Common.sendError(res, 400, "Unable to save entity: " + err);
                        } else {
                            res.send(201, result);
                        }
                    });
                }
            });
        }

        this.update = function(req, res) {

        }
    } 

    // all route controllers expose a setup method
    module.exports.setup = function(app, config) {
        var controller = new EntityController(config);
        Common.attachController(app, controller, "/api/v1/entities/:schema");
    }

})();

