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


        // initializer funct
        var init = function() {
            // Set up the mongoose.Hook for a SIS Hook
            // Get the model from the definition and name
            var schema_definition = {
                "name" : "String",
                "target" : { },
                "on": [],
                "owner": "String",
                "entity_type: "String"
            }
            var schema_name = "SisHook";
            SisHookModel = self.getEntityModel({name : schema_name, definition : schema_definition});
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
            if(!modelObj.on) {
                return "Hook has no on parameter.";
            }
            if(!modelObj.on.length) {
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
        
        // get a mongoose model back based on the sis schema
        // passed in.  sisSchema would be an object returned by
        // calls like getByName 
        // the mongoose cached version is returned if available
        // Do not hang on to any of these objects
        // ----------------------------------------------------
        this.getEntityModel = function(sisSchema) {
            if (!sisSchema || !sisSchema.name || !sisSchema.definition) {
                return null;
            }
            var name = sisSchema.name;
            if (name in mongoose.models) {
                return mongoose.models[name];
            }
            // convert to mongoose
            try {
                var schema = mongoose.Schema(sisSchema.definition);
                return mongoose.model(name, schema);
            } catch (ex) {
                return null;
            }
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
            SisHookModel.findOneAndRemove({"name": name},callback);
            return;
        }

        init();
    }

    module.exports = function(mongoose) {
        return new SchemaManager(mongoose);
    }

})();
