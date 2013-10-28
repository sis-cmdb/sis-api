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

    var Common = require("./common");

    var EntityController = function(config) {

        var self = this;
        var mongoose = config['mongoose'];
        var schemaManager = require('../util/schema-manager')(mongoose);
        var hookManager = require('../util/hook-manager')(mongoose);

        // Helper to get a model for a particular type.  Async
        // in case the behavior changes
        var getModelForType = function(type, callback) {
            schemaManager.getByName(type, function(err, result) {
                if (err || !result) {
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
                    Common.sendError(res, 404, "Unknown type specified: " + type);
                } else {
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
                    EntityModel.find(query, null, { skip : offset, limit: limit}, function(err, entities) {
                        Common.sendObject(res, 200, entities);
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
                    Common.sendObject(res, 200, result);
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
                    getModelForType(type, function(err, EntityModel) {
                        EntityModel.remove({"_id" : id}, function(err) {
                            if (err) {
                                Common.sendError(res, 500, "Could not delete entity " + id + ": " + err);
                            } else {
                                Common.sendObject(res, 200, true);
                                hookManager.dispatchHooks(result, type, hookManager.EVENT_DELETE);
                            }
                        });
                    });
                }
            });
        }

        var validateEntity = function(entity) {
            try {
                var keys = Object.keys(entity);
                for (var i = 0; i < keys.length; ++i) {
                    if (keys[i] in schemaManager.reservedFields) {
                        return keys[i] + " is a reserved field";
                    }
                }
            } catch (ex) {
                return "cannot be empty or is not an object";
            }
            return null;
        }

        // Handler for POST /
        this.add = function(req, res) {
            // Get the type - this method would not be called without it
            var type = getTypeFromRequest(req);
            var entity = req.body;
            var err = validateEntity(entity);
            if (err) {
                Common.sendError(res, 400, "Entity is invalid: " + err);
                return;
            }

            // Ensure the schema exists
            getModelForType(type, function(err, EntityModel) {
                if (err || !EntityModel) {
                    Common.sendError(res, 400, "Unknown type specified: ", type);
                } else {
                    // EntityModel is a mongoose model
                    var mongooseEntity = new EntityModel(entity);
                    // TODO: need to cleanup the entity returned to callback
                    mongooseEntity.save(function(err, result) {
                        if (err) {
                            Common.sendError(res, 500, "Unable to add entity: " + err);
                        } else {
                            Common.sendObject(res, 201, result);
                            hookManager.dispatchHooks(result, type, hookManager.EVENT_INSERT);
                        }
                    });
                }
            });
        }

        this.update = function(req, res) {
            var entity = req.body;
            // remove reserved fields..
            for (var rf in schemaManager.reservedFields) {
                delete entity[rf];
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
                            Common.sendObject(res, 200, updated);
                            hookManager.dispatchHooks(updated, type, hookManager.EVENT_UPDATE);
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

