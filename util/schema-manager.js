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

// A class used to manage the SIS Schemas defined by the /schemas api
// and also help out the /entities apis

// Not all controllers need this and can use mongoose directly
// but we have it here since the schemas and entities controller can benefit
(function() {

    // Take in a mongoose that's already been initialized.
    var SchemaManager = function(mongoose) {
        
        // A mongoose.model object for SIS Schemas
        var SisSchemaModel = null;
        // this..
        var self = this;

        // initializer funct
        var init = function() {
            // Set up the mongoose.Schema for a SIS Schema
            var definition = {
                "name" : "String",
                "definition" : { }
            }
            var name = "SisSchema";
            // Get the model from the definition and name
            SisSchemaModel = self.getEntityModel({name : name, definition : definition});
        }

        // Get all the SIS Schemas in the system
        this.getAll = function(callback) {
            SisSchemaModel.find({}, callback);
        }

        // Get a SIS Schema by name
        this.getByName = function(name, callback) {
            SisSchemaModel.findOne({"name" : name}, callback);
        }

        // Add a SIS Schema.  The modelObj must have the following properties:
        // - "name" : "Schema Name" - cannot be empty
        // - "definition" : <json_object> that is a mongoose schema
        this.addSchema = function(modelObj, callback) {
            if (!modelObj.name) {
                callback("Schema has no name.", null);
                return;
            }
            // see if the object itself is a valid schema
            try {
                // object.keys will fail if the var is not an object..
                if (Object.keys(modelObj.definition).length == 0) {
                    callback("Cannot add an empty schema.", null);
                    return;
                }
                var testSchema = mongoose.Schema(modelObj.definition);
                if (!testSchema) {
                    callback("Schema is invalid: " + ex, null);    
                    return;
                }
            } catch (ex) {
                callback("Schema is invalid: " + ex, null);
                return;
            }
            // Valid schema, so now we can create a SIS Schema object to persist
            var entity = new SisSchemaModel(modelObj);
            // TODO: need to cleanup the entity returned to callback
            entity.save(callback);
        }
        
        // get a mongoose model back based on the sis schema
        // passed in.  sisSchema would be an object returned by
        // calls like getByName 
        // the mongoose cached version is returned if available
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

        init();
    }

    module.exports = function(mongoose) {
        return new SchemaManager(mongoose);
    }

})();