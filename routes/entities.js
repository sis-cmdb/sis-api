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

    var Common = require("./common.js");

    var EntityController = function(config) {

        var self = this;
        var mongoose = config['mongoose'];
        var schemaManager = require('../util/schema-manager')(mongoose);

        // Helper to get a model for a particular type.  Async 
        // in case the behavior changes
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

        // Wrapper around req.params.schema - depends on the route param
        var getTypeFromRequest = function(req) {
            return req.params.schema;
        }

        var findSingle = function(type, condition, callback) {
            getModelForType(type, function(err, EntityModel) {
                if (err) {
                    callback(err, null);
                    return;
                }
                EntityModel.findOne(condition, function(err, result) {
                    callback(err, result);
                });
            });
        }

        // Handler for GET /
        this.getAll = function(req, res) {
            // type is safe since this route wouldn't be called
            var type = getTypeFromRequest(req);
            getModelForType(type, function(err, EntityModel) {
                if (err || !EntityModel) {
                    Common.sendError(res, 404, "Unknown type specified: ", type);
                } else {
                    EntityModel.find({}, function(err, entities) {
                        res.send(200, entities);
                    });
                }
            });
        }

        // Handler for GET /:id
        this.get = function(req, res) {
            var type = getTypeFromRequest(req);
            // Get the id and type - wouldn't be routed here without it
            var id = req.params.id;
            findSingle(type, {"_id" : id }, function(err, result) {
                if (err || !result) {
                    Common.sendError(res, 404, "Unable to find entity of type " + type + " with id " + id);
                } else {
                    res.send(200, result);
                }
            });
        }

        // Handler for DELETE /:id
        this.delete = function(req, res) {
            var type = getTypeFromRequest(req);
            // Get the id and type - wouldn't be routed here without it
            var id = req.params.id;
            findSingle(type, {"_id" : id }, function(err, result) {
                if (err || !result) {
                    Common.sendError(res, 404, "Unable to find entity of type " + type + " with id " + id);
                } else {
                    // delete the entity by the id
                    EntityModel.remove({"_id" : id}, function(err) {
                        if (err) {
                            Common.sendError(res, 500, "Could not delete entity " + id + ": " + err);
                        } else {
                            res.send(200, true);
                        }
                    })
                }
            });
        }

        // Handler for POST /
        this.add = function(req, res) {
            // Make sure type is specified
            var type = getTypeFromRequest(req);
            if (!type) {
                Common.sendError(res, 400, "No type specified");
                return;
            }            
            // Ensure the schema exists
            getModelForType(type, function(err, EntityModel) {                
                if (err || !EntityModel) {
                    Common.sendError(res, 400, "Unknown type specified: ", type);
                } else {
                    // EntityModel is a mongoose model
                    var entity = req.body;
                    var mongooseEntity = new EntityModel(entity);
                    // TODO: need to cleanup the entity returned to callback
                    mongooseEntity.save(function(err, result) {
                        if (err) {
                            Common.sendError(res, 500, "Unable to add entity: " + err);
                        } else {
                            res.send(201, result);
                        }
                    });
                }
            });
        }

        this.update = function(req, res) {
            var entity = req.body;
            if (!entity) {
                Common.sendError(res, 400, "Update requires an entity body");
                return;
            }
            // Get the entity by id
            var type = getTypeFromRequest(req);
            // Get the id and type - wouldn't be routed here without it
            var id = req.params.id;
            findSingle(type, {"_id" : id }, function(err, result) {
                if (err || !result) {
                    Common.sendError(res, 404, "Unable to find entity of type " + type + " with id " + id);
                } else {
                    // update fields that have a path on the schema
                    var schema = result.schema;
                    for (var k in entity) {
                        if (schema.path(k)) {
                            result[k] = entity[k];
                        }
                    }
                    result.save(function(err, updated) {
                        if (err) {
                            Common.sendError(res, 500, "Unable to save entity of type " + type + " with id " + id + ": " + err);
                        } else {
                            res.send(200, updated);
                        }
                    });
                }
            });
        }
    } 

    // all route controllers expose a setup method
    module.exports.setup = function(app, config) {
        var controller = new EntityController(config);
        Common.attachController(app, controller, "/api/v1/entities/:schema");
    }

})();

