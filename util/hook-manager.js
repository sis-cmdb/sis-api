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

// A class used to manage the SIS Hooks defined by the /hooks api

(function() {

    // Take in a mongoose that's already been initialized.
    var HookManager = function(mongoose) {
        
        // A mongoose.model object for SIS Schemas
        var SisHookModel = null;
        // this..
        var self = this;

        var schemaManager = require('./schema-manager')(mongoose);

        // initializer funct
        var init = function() {
            // Set up the mongoose.Hook for a SIS Hook
            // Get the model from the definition and name
            var schema_definition = {
                "name" : {"type" : "String", "required" : true, match : /^[a-z0-9_]+$/ },
                "target" : { },
                "events": [],
                "owner": "String",
                "entity_type": "String"
            }
            var schema_name = "SisHook";
            SisHookModel = schemaManager.getEntityModel({name : schema_name, definition : schema_definition, owner : "SIS"});
            // add an index
            SisHookModel.schema.index({"name": 1, "entity_type": 1},{"unique" : true});
        }

        // Get all the SIS Hooks in the system
        this.getAll = function(condition, options, callback) {
            SisHookModel.find(condition, null, options, callback);
        }

        // Get a SIS Hook by name
        this.getByName = function(name, callback) {
            SisHookModel.findOne({"name" : name}, callback);
        }

        var validateHookObject = function(modelObj) {
            if (!modelObj) {
                return "No model defined.";
            }
            if(!modelObj.name) {
                return "Hook has no name.";
            }
            if(!modelObj.owner) {
                return "Hook has no owner.";
            }
            if(!modelObj.entity_type) {
                return "Hook has no entity_type.";
            }
            if(!modelObj.target) {
                return "Hook has no target.";
            }
            if(!modelObj.target.url) {
                return "Hook target has no url.";
            }
            if(!modelObj.target.action) {
                return "Hook target has no action.";
            }
            if(!modelObj.events) {
                return "Hook has no on parameter.";
            }
            if(!modelObj.events.length) {
                return "Hook on parameter has no values.";
            }
            return null;
        }

        // Add a SIS Hook.  The modelObj must have the following properties:
        // - "name" : "Schema Name" - cannot be empty
        // - "target" : <json_object> that is a action and url.
        // - "owner" : String - Who owns this
        // - "entity_type" : String - What to fire on
        // - "on" : <json_array> - List of insert,update,delete.
        // -----------------------------------------------------------------
        this.addHook = function(modelObj, callback) {
            var err = validateHookObject(modelObj);
            if (err) {
                callback(err, null);
                return;
            }
            // Valid schema, so now we can create a SIS Schema object to persist
            var entity = new SisHookModel(modelObj);

            // TODO: need to cleanup the entity returned to callback
            entity.save(callback);
        }
        
        // Update an object schema
        this.updateHook = function(sisHook, callback) {
            var err = validateHookObject(sisHook);
            if (err) {
                callback(err, null);
                return;
            }
            var updatedHook = SisHookModel.findOneAndUpdate({name: sisHook.name},{ $set: sisHook },callback);
            return updatedHook;

        }

        // Delete a hook by name.
        this.deleteHook = function(name, callback) {
            SisHookModel.findOneAndRemove({"name": name}, function(err, result) {
                if (!result) {
                    callback("Entity does not exist.", false);
                } else {
                    callback(null, true);
                }
            });
        }

        init();
    }

    module.exports = function(mongoose) {
        return new HookManager(mongoose);
    }

})();
