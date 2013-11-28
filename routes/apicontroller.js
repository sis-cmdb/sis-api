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

var SIS = require("../util/constants");
var Manager = require("../util/manager");
var Q = require('q');
var passport = require("passport");

Q.longStackSupport = true;

function ApiController(opts) {
    this.sm = opts[SIS.OPT_SCHEMA_MGR];
    this.auth = SIS.OPT_USE_AUTH in opts ? opts[SIS.OPT_USE_AUTH] : SIS.DEFAULT_OPT_USE_AUTH;
    opts = opts || { };
    if (opts[SIS.OPT_TYPE]) {
        this.type = opts[SIS.OPT_TYPE];
    }
    if (opts[SIS.OPT_LOG_COMMTS]) {
        this.commitManager = require("../util/commit-manager")(this.sm);
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

// Utils
ApiController.prototype.sendError = function(res, err) {
    // if (typeof err == 'object' && err.stack) {
    //     console.log(err.stack);
    // }

    if (!(err instanceof Array) || err.length < 2) {
        //console.log(JSON.stringify(err));
        err = [500, err];
    }
    if (err.length == 3) {
        console.log(err[2].stack || err[2]);
    }
    res.jsonp(err[0], err[1]);
}

ApiController.prototype.sendObject = function(res, code, obj) {
    res.jsonp(code, obj);
}

ApiController.prototype.parseQuery = function(req) {
    var query = req.query.q || { };
    // try parsing..
    try {
        if (typeof query === 'string') {
            query = JSON.parse(query);
        }
    } catch (ex) {
        query = {};
    }
    var limit = parseInt(req.query.limit) || SIS.MAX_RESULTS;
    if (limit > SIS.MAX_RESULTS) { limit = SIS.MAX_RESULTS };
    var offset = parseInt(req.query.offset) || 0;
    return {'query' : query, 'limit' : limit, 'offset' : offset};
}

ApiController.prototype.parsePopulate = function(req) {
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

var MgrPromise = function(func) {
    var argsToFunc = Array.prototype.slice.call(arguments, 1);
    return function(manager) {
        return manager[func].apply(manager, argsToFunc);
    };
}

// Common stuff that shouldn't need to be overridden..
ApiController.prototype.getAll = function(req, res) {
    this.applyDefaults(req);
    var rq = this.parseQuery(req);
    var options = { skip : rq.offset, limit: rq.limit};
    var condition = rq.query;
    var self = this;
    var p = this.getManager(req)
                .then(function(mgr) {
                    return mgr.count(condition).then(function(c) {
                        c = c || 0;
                        res.setHeader(SIS.HEADER_TOTAL_COUNT, c);
                        if (!c) {
                            return Q([]);
                        }
                        return mgr.getAll(condition, options)
                            .then(self._getPopulatePromise(req, mgr));
                    });
                });
    this._finish(req, res, p, 200);
}

ApiController.prototype.get = function(req, res) {
    this.applyDefaults(req);
    var id = req.params.id;
    var self = this;
    var p = this.getManager(req)
                .then(function(m) {
                    return m.getById(id).then(self._getPopulatePromise(req, m));
                });

    this._finish(req, res, p, 200);
}

ApiController.prototype.delete = function(req, res) {
    this.applyDefaults(req);
    var id = req.params.id;
    var p = this.getManager(req).then(MgrPromise('delete', id, req.user));
    this._finish(req, res, p, 200);
}

ApiController.prototype.update = function(req, res) {
    this.applyDefaults(req);
    var id = req.params.id;
    var obj = req.body;
    var p = this.getManager(req).then(MgrPromise('update', id, obj, req.user));
    this._finish(req, res, p, 200);
}

ApiController.prototype.add = function(req, res) {
    this.applyDefaults(req);
    var obj = req.body;
    var p = this.getManager(req).then(MgrPromise('add', obj, req.user));
    this._finish(req, res, p, 201);
}

// Attach the controller to the app at a particular base
ApiController.prototype.attach = function(app, prefix) {
    app.get(prefix, this.getAll.bind(this));
    app.get(prefix + "/:id", this.get.bind(this));
    if (!app.get(SIS.OPT_READONLY)) {
        app.put(prefix + "/:id", this._wrapAuth(this.update).bind(this));
        app.post(prefix, this._wrapAuth(this.add).bind(this));
        app.delete(prefix + "/:id", this._wrapAuth(this.delete).bind(this));
        if (this.commitManager) {
            this._enableCommitApi(app, prefix);
        }
    }
}

ApiController.prototype.authenticate = function(req, res, type) {
    var d = Q.defer();
    var self = this;
    var next = function(err) {
        if (err) {
            d.reject(err);
        }
    }
    passport.authenticate(type, {session : false}, function(err, user) {
        if (err) {
            d.reject(SIS.ERR_BAD_CREDS("" + err));
        } else if (!user) {
            d.reject(SIS.ERR_BAD_CREDS("Invalid credentials"));
        } else {
            req.user = user;
            d.resolve(user)
        }
    })(req, res, next);
    return d.promise;
}

// private / subclass support
ApiController.prototype._wrapAuth = function(func) {
    return function(req, res) {
        if (!this.auth) {
            return func.call(this, req, res);
        }
        var p = this.authenticate(req, res, SIS.SCHEMA_TOKENS);
        var self = this;
        Q.nodeify(p, function(err, auth) {
            if (err) { return self.sendError(res, err); }
            func.call(self, req, res);
        });
    }
}

ApiController.prototype._enableCommitApi = function(app, prefix) {
    // all history
    var self = this;
    app.get(prefix + "/:id/commits", function(req, res) {
        var type = this.getType(req);
        var id = req.params.id;
        var rq = this.parseQuery(req);
        var mongooseModel = this.commitManager.model;

        // update the query for the right types
        rq.query['entity_id'] = id;
        rq.query['type'] = type;

        mongooseModel.count(rq.query, function(err, c) {
            if (err || !c) {
                res.setHeader("x-total-count", 0);
                return self.sendObject(res, 200, []);
            }
            var opts = { skip : rq.offset, limit: rq.limit};
            var mgQuery = mongooseModel.find(rq.query, null, opts);
            mgQuery = mgQuery.sort({date_modified: 1});
            mgQuery.exec(function(err, entities) {
                res.setHeader("x-total-count", c);
                self.sendObject(res, 200, entities);
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
                self.sendError(res, SIS.ERR_NOT_FOUND("commit", hid));
            } else {
                self.sendObject(res, 200, result);
            }
        });
    }.bind(this));

    app.get(prefix + "/:id/revision/:utc", function(req, res) {
        var type = this.getType(req);
        var id = req.params.id;
        var utc = req.params.utc;
        this.commitManager.getVersionByUtc(type, id, utc, function(err, result) {
            if (err || !result) {
                self.sendError(res, SIS.ERR_NOT_FOUND("commit at time", utc));
            } else {
                self.sendObject(res, 200, result);
            }
        });

    }.bind(this));

}

ApiController.prototype._getSendCallback = function(req, res, code) {
    var self = this;
    return function(err, result) {
        if (err) { return self.sendError(res, err); }
        self.sendObject(res, code, result);
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
        if (req.method == SIS.METHOD_PUT && req.params.id &&
            o instanceof Array) {
            // was an update on a single item from a manager.
            // grab the update
            o = o[1];
        }
        return self.convertToResponseObject(req, o);
    });
    return Q.nodeify(p, this._getSendCallback(req, res, code));
}

ApiController.prototype._getPopulatePromise = function(req, m) {
    var self = this;
    return function(results) {
        if (self.parsePopulate(req)) {
            return m.populate(results);
        } else {
            return Q(results);
        }
    }
}

// export it
module.exports = exports = ApiController;

