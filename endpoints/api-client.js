"use strict";

var createEntityManager = require("../util/entity-manager");

function EntityEp(name, schemaManager) {
    this.get = function(id) {
        return schemaManager.getById(name, { lean : true })
        .then(function(schema) {
            var model = schemaManager.getEntityModel(schema);
            return createEntityManager(model, schema, { });
        }).then(function(em) {
            return em.getById(id);
        }).then(function(result) {
            return result.toObject();
        }).catch(function(err) {
            console.log(JSON.stringify(err));
            console.log(err);
            throw err;
        });
    }
};

function Client(schemaManager) {
    this.entities = function(name) {
        return new EntityEp(name, schemaManager);
    };
}

module.exports = Client;
