"use strict";

var webUtil = require("../routes/webutil");
var createEntityManager = require("../util/entity-manager");

function EntityEp(name, schemaManager) {
    var mgrPromise = schemaManager.getById(name, { lean : true })
        .then(function(schema) {
            var model = schemaManager.getEntityModel(schema);
            return createEntityManager(model, schema, { });
        });

    this.get = function(id) {
        return mgrPromise.then(function(em) {
            return em.getById(id);
        }).then(function(result) {
            return result.toObject();
        }).catch(function(err) {
            console.log(JSON.stringify(err));
            console.log(err);
            throw err;
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
                return mgr.getPopulateFields(schemaManager).then(function(fields) {
                    if (fields) { options.populate = fields; }
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
    this.entities = function(name) {
        return new EntityEp(name, schemaManager);
    };
}

module.exports = Client;
