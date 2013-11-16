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

    var Manager = require("../util/manager");
    var ApiController = require("./apicontroller");
    var SIS = require("../util/constants");
    var Q = require("q");

    //////////
    // Entity manager
    function EntityManager(model, opts) {
        Manager.call(this, model, opts);
    }

    // inherit
    EntityManager.prototype.__proto__ = Manager.prototype;

    EntityManager.prototype.validate = function(entity, isUpdate) {
        if (isUpdate) {
            // remove reserved fields..
            // and sub objects
            for (var rf in Object.keys(entity)) {
                if (rf[0] == '_') {
                    delete entity[rf];
                }
            }
        }
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

    EntityManager.prototype.applyUpdate = function(result, entity) {
        var schema = result.schema;
        for (var k in entity) {
            if (schema.path(k)) {
                if (entity[k] != null) {
                    result[k] = this.applyPartial(result[k], entity[k]);
                } else {
                    delete result[k];
                }
            }
        }
        return result;
    }
    //////////

    //////////
    // Entity controller
    function EntityController(config) {
        var opts = { };
        opts[SIS.OPT_LOG_COMMTS] = true;
        opts[SIS.OPT_FIRE_HOOKS] = true;
        opts[SIS.OPT_ID_FIELD] = SIS.FIELD_ID;
        this.opts = opts;
        ApiController.call(this, config, this.opts);
        this.managerCache = { };
    }

    // inherit
    EntityController.prototype.__proto__ = ApiController.prototype;

    // overrides
    EntityController.prototype.getManager = function(req) {
        var name = this.getType(req);
        if (this.sm.hasEntityModel(name)) {
            var smModel = this.sm.getEntityModelByName(name);
            var current = this.managerCache[name];
            if (!current || current.model != smModel) {
                // out of date..
                this.managerCache[name] = new EntityManager(smModel, this.opts);
            }
            return Q(this.managerCache[name]);
        } else {
            // query to see if it's there (could be due to replication)
            var self = this;
            var d = Q.defer();
            this.sm.getById(name, function(e, schema) {
                if (e) {
                    d.reject(e);
                } else {
                    var model = self.sm.getEntityModel(schema);
                    self.managerCache[name] = new EntityManager(model, self.opts);
                    d.resolve(self.managerCache[name]);
                }
            });
            return d.promise;
        }
    }
    EntityController.prototype.getType = function(req) {
        return req.params.schema;
    }
    EntityController.prototype.applyDefaults = function(req) {
        if (req.method == "GET") {
            // need to populate..
            if (!('populate' in req.query)) {
                req.query['populate'] = true;
            }
        }
    }
    /////////////////////////////////

    // all route controllers expose a setup method
    module.exports.setup = function(app, config) {
        var controller = new EntityController(config);
        controller.attach(app, "/api/v1/entities/:schema");
    }

})();

