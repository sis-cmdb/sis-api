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
    module.exports.attachController = function(app, controller, prefix) {
        app.get(prefix, controller.getAll);
        app.get(prefix + "/:id", controller.get);
        if (!app.get("readonly")) {
            app.put(prefix + "/:id", controller.update);
            app.post(prefix, controller.add);
            app.delete(prefix + "/:id", controller.delete);
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

    var Common = module.exports;

    module.exports.getAll = function(req, res, mongooseModel) {
        var query = req.query.q || {};
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

