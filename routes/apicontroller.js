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
// API for schemas

var Common = require("./common");
var SIS = require("../util/constants");
var Manager = require("../util/manager");
var Q = require('q');

function ApiController(config, opts) {
    this.sm = config[SIS.OPT_SCHEMA_MGR];
    opts = opts || { };
    if (opts[SIS.OPT_TYPE]) {
        this.type = opts[SIS.OPT_TYPE];
    }
    if (opts[SIS.OPT_LOG_COMMTS]) {
        this.commitManager = require("../util/history-manager")(this.sm);
        if (opts[SIS.OPT_ID_FIELD]) {
            this.commitManager.idField = opts[SIS.OPT_ID_FIELD];
        }
    }
    if (opts[SIS.OPT_FIRE_HOOKS]) {
        this.hm = require('../util/hook-manager')(this.sm);
    }
}

// overrides
ApiController.prototype.getManager = function(req) {
    if (this.manager) {
        return Q(this.manager);
    } else {
        return Q.reject(SIS.ERR_INTERNAL("Error fetching object"));
    }
}
ApiController.prototype.getType = function(req) {
    return this.type || "invalid" ;
}

ApiController.prototype.convertToResponseObject = function(req, obj) {
    // default does nothing
    // hiera needs to return a sub field
    return Q(obj);
}
ApiController.prototype.applyDefaults = function(req) {
    // noop
}

var MgrPromise = function(func) {
    var argsToFunc = Array.prototype.slice.call(arguments, 1);
    return function(manager) {
        return func.apply(manager, argsToFunc);
    };
}

// Common stuff that shouldn't need to be overridden..
ApiController.prototype.getAll = function(req, res) {
    this.applyDefaults(req);
    this.getManager(req).then(function(m) {
        Common.getAll(req, res, m.model);
    }, function(e) {
        Common.sendError(res, e);
    });
}

ApiController.prototype.get = function(req, res) {
    this.applyDefaults(req);
    var id = req.params.id;
    var p = this.getManager(req).then(MgrPromise(Manager.prototype.getById, id));
    this._finish(req, res, p, 200);
}

ApiController.prototype.delete = function(req, res) {
    this.applyDefaults(req);
    var id = req.params.id;
    var p = this.getManager(req).then(MgrPromise(Manager.prototype.delete, id));
    this._finish(req, res, p, 200);
}

ApiController.prototype.update = function(req, res) {
    this.applyDefaults(req);
    var id = req.params.id;
    var obj = req.body;
    var p = this.getManager(req).then(MgrPromise(Manager.prototype.update, id, obj));
    this._finish(req, res, p, 200);
}

ApiController.prototype.add = function(req, res) {
    this.applyDefaults(req);
    var obj = req.body;
    var p = this.getManager(req).then(MgrPromise(Manager.prototype.add, obj));
    this._finish(req, res, p, 201);
}

// Attach the controller to the app at a particular base
ApiController.prototype.attach = function(app, prefix) {
    app.get(prefix, this.getAll.bind(this));
    app.get(prefix + "/:id", this.get.bind(this));
    if (!app.get(SIS.OPT_READONLY)) {
        app.put(prefix + "/:id", this.update.bind(this));
        app.post(prefix, this.add.bind(this));
        app.delete(prefix + "/:id", this.delete.bind(this));
        if (this.commitManager) {
            this._enableCommitApi(app, prefix);
        }
    }
}

ApiController.prototype._enableCommitApi = function(app, prefix) {
    // all history
    app.get(prefix + "/:id/commits", function(req, res) {
        var type = this.getType(req);
        var id = req.params.id;
        var rq = Common.parseQuery(req);
        var mongooseModel = this.commitManager.model;

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
    }.bind(this));

    // specific entry by history id
    app.get(prefix + "/:id/commits/:hid", function(req, res) {
        var type = this.getType(req);
        var id = req.params.id;
        var hid = req.params.hid;
        this.commitManager.getVersionById(type, id, hid, function(err, result) {
            if (err || !result) {
                Common.sendError(res, SIS.ERR_NOT_FOUND("commit", hid));
            } else {
                Common.sendObject(res, 200, result);
            }
        });
    }.bind(this));

    app.get(prefix + "/:id/revision/:utc", function(req, res) {
        var type = this.getType(req);
        var id = req.params.id;
        var utc = req.params.utc;
        this.commitManager.getVersionByUtc(type, id, utc, function(err, result) {
            if (err || !result) {
                Common.sendError(res, SIS.ERR_NOT_FOUND("commit at time", utc));
            } else {
                Common.sendObject(res, 200, result);
            }
        });

    }.bind(this));

}

ApiController.prototype._getSendCallback = function(req, res, code) {
    var self = this;
    return function(err, result) {
        if (err) { return Common.sendError(res, err); }
        Common.sendObject(res, code, result);
        // dispatch hooks
        if (self.hm && req.method in SIS.METHODS_TO_EVENT) {
            self.hm.dispatchHooks(result, self.getType(req),
                                  SIS.METHODS_TO_EVENT[req.method]);
        }
    }
}

ApiController.prototype._saveCommit = function(req) {
    // need to return a promise that saves history
    // but returns the initial object passed to it
    var self = this;
    return function(result) {
        var d = Q.defer();
        var old = null;
        var now = null;
        switch (req.method) {
            case SIS.METHOD_PUT:
                // update.. result is an array
                old = result[0];
                now = result[1];
                break;
            case SIS.METHOD_POST:
                // add
                now = result;
                break;
            case SIS.METHOD_DELETE:
                old = result;
                break;
            default:
                d.reject(SIS.ERR_INTERNAL("invalid commit being saved"));
                return d.promise;
        }
        // save it
        var type = self.getType(req);
        self.commitManager.recordHistory(old, now, req, type, function(e, h) {
            // doesn't matter for now.
            d.resolve(now || old);
        });
        return d.promise;
    }
}

ApiController.prototype._finish = function(req, res, p, code) {
    var self = this;
    if (this.commitManager && req.method in SIS.METHODS_TO_EVENT) {
        p = p.then(this._saveCommit(req));
    }
    p = p.then(function(o) {
        return self.convertToResponseObject(req, o);
    });
    return Q.nodeify(p, this._getSendCallback(req, res, code));
}

// export it
module.exports = exports = ApiController;
