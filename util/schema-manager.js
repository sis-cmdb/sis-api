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

// The model class for a schema object in SIS
// Not all controllers need this and can use mongoose directly
// but we have it here since the schemas and entities controller can benefit
(function() {

    var SchemaManager = function(mongoose) {
        
        var SchemaType = null;
        var self = this;

        var init = function() {
            var definition = {
                "name" : "String",
                "definition" : { }
            }
            var name = "SisSchema";
            SchemaType = self.getEntityModel({name : name, definition : definition});
        }

        this.getAll = function(callback) {
            SchemaType.find({}, callback);
        }

        this.getByName = function(name, callback) {
            SchemaType.findOne({"name" : name}, callback);
        }

        this.addSchema = function(modelObj, callback) {
            // see if the object itself is a valid schema
            try {
                var testSchema = mongoose.Schema(modelObj.definition);
            } catch (ex) {
                callback("Schema is invalid: " + ex, null);
                return;
            }
            var entity = new SchemaType(modelObj);
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