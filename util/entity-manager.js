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

// Manager for entities
(function() {

    var Manager = require("./manager");

    //////////
    // Entity manager
    function EntityManager(model, schema, opts) {
        this.schema = schema;
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

    module.exports = function(model, schema, opts) {
        return new EntityManager(model, schema, opts);
    }

})();