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

(function() {

    var Common = module.exports;

    var attachHistoryRoutes = function(app, controller, prefix) {
        if (!controller.getSchemaFromRequest) {
            var splits = prefix.split("/");
            var type = "sis_" + splits[splits.length - 1];
            controller.getSchemaFromRequest = function(req) {
                return type;
            }
        }
        // all history
        app.get(prefix + "/:id/history", function(req, res) {
            var type = this.getSchemaFromRequest(req);
            var id = req.params.id;
            var rq = Common.parseQuery(req);
            var mongooseModel = this.historyManager.model;

            // update the query for the right types
            rq.query['entity_id'] = id;
            rq.query['type'] = type;

            mongooseModel.count(rq.query, function(err, c) {
                if (err || !c) {
                    res.setHeader("x-total-count", 0);
                    return Common.sendObject(res, 200, []);
                }
                var opts = { skip : rq.offset, limit: rq.limit};
                var mgQuery = mongooseModel.find(rq.query, null, opts);
                mgQuery = mgQuery.sort({date_modified: -1});
                mgQuery.exec(function(err, entities) {
                    res.setHeader("x-total-count", c);
                    Common.sendObject(res, 200, entities);
                });
            });
        }.bind(controller));

        // specific entry by history id
        app.get(prefix + "/:id/history/:hid", function(req, res) {
            var type = this.getSchemaFromRequest(req);
            var id = req.params.id;
            var hid = req.params.hid;
            this.historyManager.getVersionById(type, id, hid, function(err, result) {
                if (err || !result) {
                    Common.sendError(res, 404, "History with id " + hid + " not found.");
                } else {
                    Common.sendObject(res, 200, result);
                }
            });
        }.bind(controller));

        app.get(prefix + "/:id/revision/:utc", function(req, res) {
            var type = this.getSchemaFromRequest(req);
            var id = req.params.id;
            var utc = req.params.utc;
            this.historyManager.getVersionByUtc(type, id, utc, function(err, result) {
                if (err || !result) {
                    Common.sendError(res, 404, "History at time " + utc + " not found.");
                } else {
                    Common.sendObject(res, 200, result);
                }
            });

        }.bind(controller));

    }

    module.exports.attachController = function(app, controller, prefix) {
        app.get(prefix, controller.getAll);
        app.get(prefix + "/:id", controller.get);
        if (!app.get("readonly")) {
            app.put(prefix + "/:id", controller.update);
            app.post(prefix, controller.add);
            app.delete(prefix + "/:id", controller.delete);
            attachHistoryRoutes(app, controller, prefix);
        }
    }

    // wrapped in case we want to do more things here..
    module.exports.sendError = function(res, code, err) {
        res.jsonp(code, {"error" : err });
    }

    module.exports.sendObject = function(res, code, obj) {
        res.jsonp(code, obj);
    }

    module.exports.MAX_RESULTS = 200;

    function mergeHelper(full, partial) {
        if (typeof partial !== 'object' || partial instanceof Array) {
            return partial;
        } else {
            // merge the object
            var result = full;
            for (var k in partial) {
                if (partial[k] != null) {
                    result[k] = mergeHelper(full[k], partial[k]);
                } else {
                    delete result[k];
                }
            }
            return result;
        }
    }

    module.exports.merge = mergeHelper;

    module.exports.parseQuery = function(req) {
        var query = req.query.q || { };
        // try parsing..
        try {
            if (typeof query === 'string') {
                query = JSON.parse(query);
            }
        } catch (ex) {
            query = {};
        }
        var limit = parseInt(req.query.limit) || Common.MAX_RESULTS;
        if (limit > Common.MAX_RESULTS) { limit = Common.MAX_RESULTS };
        var offset = parseInt(req.query.offset) || 0;
        return {'query' : query, 'limit' : limit, 'offset' : offset};
    }

    module.exports.getAll = function(req, res, mongooseModel) {
        var rq = Common.parseQuery(req);
        var query = rq.query;
        var limit = rq.limit;
        var offset = rq.offset;

        mongooseModel.count(query, function(err, c) {
            if (err || !c) {
                res.setHeader("x-total-count", 0);
                return Common.sendObject(res, 200, []);
            }
            var mgQuery = mongooseModel.find(query, null, { skip : offset, limit: limit});
            if (Common.parsePopulate(req)) {
                var populate = Common.buildPopulate(mongooseModel.schema);
                if (populate) {
                    mgQuery = mgQuery.populate(populate);
                }
            }
            mgQuery.exec(function(err, entities) {
                res.setHeader("x-total-count", c);
                Common.sendObject(res, 200, entities);
            });
        });
    }

    module.exports.parsePopulate = function(req) {
        if (typeof req.query.populate == 'string') {
            try {
                return JSON.parse(req.query.populate);
            } catch(ex) {
                return false;
            }
        } else {
            return req.query.populate || false;
        }
    }

    module.exports.buildPopulate = function(schema) {
        var paths = [];
        schema.eachPath(function(pathName, schemaType) {
            if (schemaType.instance == "ObjectID" && pathName != "_id") {
                paths.push(pathName);
            }
        });
        if (paths.length) {
            return paths.join(" ");
        }
        return null;
    }

})();

