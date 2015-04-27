"use strict";

var webUtil = require("../routes/webutil");
var createEntityManager = require("../util/entity-manager");
var _ = require("lodash");

function EntityEp(name, schemaManager) {
    var mgrPromise = schemaManager.getById(name, { lean : true })
        .then(function(schema) {
            var model = schemaManager.getEntityModel(schema);
            return createEntityManager(model, schema, { });
        });

    this.get = function(id, query) {
        query = query || { };
        var rq = webUtil.parseQuery(query, '1.1', false);
        var populate = webUtil.parsePopulate(query);
        var lean = false;
        return mgrPromise.then(function(em) {
            lean = em.model.schema._sis_defaultpaths.length === 0;
            var options = { };
            options.lean = lean;
            if (populate) {
                return em.getPopulateFields(schemaManager, populate)
                .then(function(populateFields) {
                    if (populateFields) {
                        options.populate = populateFields;
                    }
                    return em.getById(id, options);
                });
            } else {
                return em.getById(id, options);
            }
        }).then(function(result) {
            if (!lean) {
                result = result.toObject();
            }
            return result;
        });
    };

    this.listAll = function(query) {
        query = query || { };
        var rq = webUtil.parseQuery(query, '1.1', false);
        var populate = webUtil.parsePopulate(query);
        var lean = false;
        return mgrPromise.then(function(mgr) {
            lean = mgr.model.schema._sis_defaultpaths.length === 0;
            return webUtil.flattenCondition(rq.query, schemaManager, mgr);
        }).spread(function(flattenedCondition, mgr) {
            var options = { };
            if (rq.sort) { options.sort = rq.sort; }
            if (rq.limit) { options.limit = rq.limit; }
            if (rq.offset) { options.skip = rq.offset; }
            options.lean = lean;
            if (populate) {
                return mgr.getPopulateFields(schemaManager, populate)
                .then(function(fields) {
                    if (fields) {
                        options.populate = fields;
                    }
                    return mgr.getAll(flattenedCondition, options, rq.fields);
                });
            } else {
                return mgr.getAll(flattenedCondition, options, rq.fields);
            }
        }).then(function(result) {
            if (!lean) {
                result = result.map(function(o) { return o.toObject(); });
            }
            return result;
        });
    };
}

function Client(schemaManager) {

    var epCache = { };
    this.entities = function(name) {
        if (!epCache[name]) {
            epCache[name] = new EntityEp(name, schemaManager);
        }
        return epCache[name];
    };
}

module.exports = Client;
