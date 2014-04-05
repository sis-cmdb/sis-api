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
var Q = require('q');
var passport = require("passport");
var webUtil = require("./webutil");

// Constructor for the ApiController base
// The controller base attaches to an express app and
// has the code for CRUD ops.  It delegates the ops
// to a manager and handles the authorization aspects here.
//
// opts is a dictionary w/ the following keys
// - schema_manager - the schema manager across the system
// - auth - boolean (default true) indicating if auth is enabled
// - type - optional string indicating the type for hooks/commits
// - log_commits - boolean indicating if this controller should
//       log creates/update/deletions
// - fire_hooks - boolean indicating if web hooks should be fired
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
// Returns a promise that returns a Manager instance.
// Subclasses can assign a manager to the 'manager' property.
ApiController.prototype.getManager = function(req) {
    if (this.manager) {
        return Q(this.manager);
    } else {
        return Q.reject(SIS.ERR_INTERNAL("Error fetching object"));
    }
}

// Get the type of object from the request
ApiController.prototype.getType = function(req) {
    return this.type || "invalid" ;
}

// Convert the object to an object suitable for the response.
// Default does nothing, but subclasses may override to
// remove fields from objects or translate it.
// obj may be an individual object or an array of objects
ApiController.prototype.convertToResponseObject = function(req, obj) {
    // default does nothing
    // hiera needs to return a sub field
    return obj;
}

// Apply default parameters to a request
ApiController.prototype.applyDefaults = function(req) {
    // noop
}

// Utils - not normal to override these

// Send an error via the response object
// The err is usually an object returned via
// SIS.ERR_* functions/properties
ApiController.prototype.sendError = function(res, err) {
    if (typeof err == 'object' && err.stack) {
        console.log(err.stack);
    }
    if (!(err instanceof Array) || err.length < 2) {
        console.log(JSON.stringify(err));
        err = [500, err];
    }
    res.jsonp(err[0], err[1]);
}

// Send a response with the specified code and data
ApiController.prototype.sendObject = function(res, code, obj) {
    res.jsonp(code, obj);
}

// Parse the query parameters for a given req
// Converts the q param to an object and assigns a
// limit and offset
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
    var fields = req.query.fields;
    if (fields) {
        if (typeof fields !== 'string') {
            fields = null;
        } else {
            fields = fields.split(',').join(' ');
        }
    }
    var result = {'query' : query, 'limit' : limit, 'offset' : offset, 'fields' : fields};
    var sort = req.query.sort;
    if (sort) {
        var sortFields = sort.split(',');
        var sortOpt = sortFields.reduce(function(c, field) {
            // default asc
            var opt = 1;
            if (field[0] == '+' || field[0] == '-') {
                opt = field[0] == '+' ? 1 : -1;
                field = field.substr(1);
            }
            c[field] = opt;
            return c;
        }, { });
        result['sort'] = sortOpt;
    }
    return result;
}

// Returns true if the request wants sub-documents populated
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

// A helper that returns a function meant for promise chaining.
// The func parameter is a string which is a method name to
// call on the manager.
// The function returned takes receives a manager and
// calls the func method on the manager with the additional
// arguments.
var MgrPromise = function(func) {
    var argsToFunc = Array.prototype.slice.call(arguments, 1);
    return function(manager) {
        return manager[func].apply(manager, argsToFunc);
    };
}

// Handler for the getAll request (typically GET controller_base/)
ApiController.prototype.getAll = function(req, res) {
    this.applyDefaults(req);
    var rq = this.parseQuery(req);
    var options = { skip : rq.offset, limit: rq.limit};
    if (rq.sort) {
        options['sort'] = rq.sort;
    }
    var fields = rq.fields;
    var condition = rq.query;
    var self = this;
    var p = this.getManager(req)
                .then(function(mgr) {
                    return webUtil.flattenCondition(condition,self.sm,mgr)
                        .then(function(flattenedCondition) {
                            return mgr.count(flattenedCondition).then(function(c) {
                                c = c || 0;
                                res.setHeader(SIS.HEADER_TOTAL_COUNT, c);
                                if (!c) {
                                    return Q([]);
                                }
                                return mgr.getAll(flattenedCondition, options, fields)
                                    .then(self._getPopulatePromise(req, mgr));
                            });
                        });
                    });
    this._finish(req, res, p, 200);
}

// Handler for the get request (typically GET controller_base/:id)
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

// Handler for the delete request (typically DELETE controller_base/:id)
ApiController.prototype.delete = function(req, res) {
    this.applyDefaults(req);
    var id = req.params.id;
    var p = this.getManager(req).then(MgrPromise('delete', id, req.user));
    this._finish(req, res, p, 200);
}

// Handler for the update request (typically PUT controller_base:/id)
ApiController.prototype.update = function(req, res) {
    this.applyDefaults(req);
    var id = req.params.id;
    var obj = req.body;
    var p = this.getManager(req).then(MgrPromise('update', id, obj, req.user));
    this._finish(req, res, p, 200);
}

// Handler for the add request (typically POST controller_base:/)
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
        // wrap authorization around modification calls
        app.put(prefix + "/:id", this._wrapAuth(this.update));
        app.post(prefix, this._wrapAuth(this.add));
        app.delete(prefix + "/:id", this._wrapAuth(this.delete));
        // enable the commit api if we have a commitManager
        if (this.commitManager) {
            this._enableCommitApi(app, prefix);
        }
    }
}

// Returns a promise that authenticates a request
// The type specifies which kind of authentication to use
// and should have already been registered with passport
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

// "private"
// Wrap a controller func with authorization
// The returned function is a request handler
// bound to the controller.
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
    }.bind(this);
}

// Enable the commit API endpoints
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
            var mgQuery = mongooseModel.find(rq.query, rq.fields, opts);
            mgQuery = mgQuery.sort({date_modified: -1});
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

// Get the callback that will send the result from the controller
ApiController.prototype._getSendCallback = function(req, res, code) {
    var self = this;
    return function(err, result) {
        if (err) { return self.sendError(res, err); }
        var orig = result;
        if (req.method == SIS.METHOD_PUT && req.params.id &&
            result instanceof Array) {
            // update.. grab the second obj
            result = result[1];
        }
        result = self.convertToResponseObject(req, result);
        self.sendObject(res, code, result);
        // dispatch hooks
        if (self.hm && req.method in SIS.METHODS_TO_EVENT) {
            self.hm.dispatchHooks(orig, self.getType(req),
                                  SIS.METHODS_TO_EVENT[req.method]);
        }
    }
}

// Save a commit to the commit log
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
        self.commitManager.recordHistory(old, now, req.user, type, function(e, h) {
            // doesn't matter for now.
            d.resolve(result);
        });
        return d.promise;
    }
}

// Do the final steps of the request
// p is the promise that receives the object from the
// request handler
ApiController.prototype._finish = function(req, res, p, code) {
    var self = this;
    if (this.commitManager && req.method in SIS.METHODS_TO_EVENT) {
        p = p.then(this._saveCommit(req));
    }
    return Q.nodeify(p, this._getSendCallback(req, res, code));
}

// Get a function that receives objects and returns a promise
// to populate them
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

