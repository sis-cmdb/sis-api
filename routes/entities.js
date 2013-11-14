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

// API for entities that adhere to schemas created via
// the schemas API
(function() {

    var Common = require("./common");
    var SIS = require("../util/constants");

    var EntityController = function(config) {

        var self = this;
        var schemaManager = config['schemaManager'];
        var hookManager = require('../util/hook-manager')(schemaManager);

        self.historyManager = require('../util/history-manager')(schemaManager);
        self.historyManager.idField = SIS.FIELD_ID;

        // Helper to get a model for a particular type.  Async
        // in case the behavior changes
        var getModelForType = function(type, callback) {
            schemaManager.getByName(type, function(err, result) {
                callback(err, schemaManager.getEntityModel(result));
            })
        }

        // Wrapper around req.params.schema - depends on the route param
        var getTypeFromRequest = function(req) {
            return req.params.schema;
        }
        this.getSchemaFromRequest= getTypeFromRequest;

        var findSingle = function(type, id, callback) {
            getModelForType(type, function(err, EntityModel) {
                if (err) {
                    return callback(err, null);
                }
                EntityModel.findOne({"_id" : id }, function(err, result) {
                    if (err || !result) {
                        callback(SIS.ERR_NOT_FOUND(type, id), null);
                    } else {
                        callback(null, result);
                    }
                });
            });
        }

        // Handler for GET /
        this.getAll = function(req, res) {
            // type is safe since this route wouldn't be called
            var type = getTypeFromRequest(req);
            getModelForType(type, function(err, EntityModel) {
                if (err) {
                    Common.sendError(res, err);
                } else {
                    // default is to populate entities
                    if (!('populate' in req.query)) {
                        req.query['populate'] = true;
                    }
                    Common.getAll(req, res, EntityModel);
                }
            });
        }

        var sendPopulatedResult = function(req, res, status, result) {
            if (!('populate' in req.query)) {
                req.query['populate'] = true;
            }
            if (Common.parsePopulate(req)) {
                var populate = Common.buildPopulate(result.schema);
                if (populate) {
                    result.populate(populate, function(err, populated) {
                        if (err || !populated) {
                            Common.sendError(res, SIS.ERR_INTERNAL("Failed to populate object."));
                        } else {
                            Common.sendObject(res, status, populated);
                        }
                    });
                } else {
                    Common.sendObject(res, status, result);
                }
            } else {
                Common.sendObject(res, status, result);
            }
        }

        // Handler for GET /:id
        this.get = function(req, res) {
            var type = getTypeFromRequest(req);
            // Get the id and type - wouldn't be routed here without it
            var id = req.params.id;
            findSingle(type, id, function(err, result) {
                if (err) {
                    Common.sendError(res, err);
                } else {
                    sendPopulatedResult(req, res, 200, result);
                }
            });
        }

        // Handler for DELETE /:id
        this.delete = function(req, res) {
            var type = getTypeFromRequest(req);
            // Get the id and type - wouldn't be routed here without it
            var id = req.params.id;
            findSingle(type, id, function(err, result) {
                if (err) {
                    return Common.sendError(res, err);
                }
                // delete the entity by the id
                result.remove(function(err, removed) {
                    if (err) {
                        Common.sendError(res, SIS.ERR_INTERNAL(err));
                    } else {
                        self.historyManager.recordHistory(result, null, req, type, function(err, history) {
                            Common.sendObject(res, 200, true);
                            hookManager.dispatchHooks(result, type, SIS.EVENT_DELETE);
                        });
                    }
                });
            });
        }

        var validateEntity = function(entity) {
            try {
                var keys = Object.keys(entity);
                if (keys.length == 0) {
                    return "entity cannot be empty";
                }
                for (var i = 0; i < keys.length; ++i) {
                    if (keys[i][0] == '_') {
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
                return Common.sendError(res, SIS.ERR_BAD_REQ(err));
            }

            // Ensure the schema exists
            getModelForType(type, function(err, EntityModel) {
                if (err) {
                    Common.sendError(res, err);
                } else {
                    // EntityModel is a mongoose model
                    var mongooseEntity = new EntityModel(entity);
                    // TODO: need to cleanup the entity returned to callback
                    mongooseEntity.save(function(err, result) {
                        if (err) {
                            Common.sendError(res, SIS.ERR_INTERNAL(err));
                        } else {
                            self.historyManager.recordHistory(null, result, req, type, function(err, history) {
                                sendPopulatedResult(req, res, 201, result);
                                hookManager.dispatchHooks(result, type, SIS.EVENT_INSERT);
                            });
                        }
                    });
                }
            });
        }

        this.update = function(req, res) {
            var entity = req.body;
            // remove reserved fields..
            // and sub objects
            for (var rf in Object.keys(entity)) {
                if (rf[0] == '_') {
                    delete entity[rf];
                }
            }

            // Get the entity by id
            var type = getTypeFromRequest(req);
            // Get the id and type - wouldn't be routed here without it
            var id = req.params.id;
            findSingle(type, id, function(err, result) {
                if (err) {
                    Common.sendError(res, err);
                } else {
                    // update fields that have a path on the schema
                    var schema = result.schema;
                    var oldObj = result.toObject();
                    for (var k in entity) {
                        if (schema.path(k)) {
                            if (entity[k] != null) {
                                result[k] = Common.merge(result[k], entity[k]);
                            } else {
                                delete result[k];
                            }
                        }
                    }
                    result.save(function(err, updated) {
                        if (err) {
                            Common.sendError(res, SIS.ERR_INTERNAL(err));
                        } else {
                            self.historyManager.recordHistory(oldObj, result, req, type, function(err, history) {
                                sendPopulatedResult(req, res, 200, updated);
                                hookManager.dispatchHooks(updated, type, SIS.EVENT_UPDATE);
                            });
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

