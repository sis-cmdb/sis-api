'use strict';

var SIS = require("../util/constants");
var BPromise = require("bluebird");
var passport = require("passport");
var webUtil = require("./webutil");
var nconf = require("nconf");
var _ = require("lodash");

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
    this.getterReadPref = nconf.get("app:get_read_pref");
}

// overrides
// Returns a promise that returns a Manager instance.
// Subclasses can assign a manager to the 'manager' property.
ApiController.prototype.getManager = function(req) {
    if (this.manager) {
        req.useLean = true;
        return BPromise.resolve(this.manager);
    } else {
        return BPromise.reject(SIS.ERR_INTERNAL("Error fetching object"));
    }
};

// Get the type of object from the request
ApiController.prototype.getType = function(req) {
    return this.type || "invalid" ;
};

// Convert the object to an object suitable for the response.
// Default does nothing, but subclasses may override to
// remove fields from objects or translate it.
// obj may be an individual object or an array of objects
ApiController.prototype.convertToResponseObject = function(req, obj) {
    // default does nothing
    // hiera needs to return a sub field
    return obj;
};

// Apply default parameters to a request
ApiController.prototype.applyDefaults = function(req) {
    // noop
};

ApiController.prototype.shouldSaveCommit = function(req) {
    return (this.commitManager && req.method in SIS.METHODS_TO_EVENT);
};

// Utils - not normal to override these

// Send an error via the response object
// The err is usually an object returned via
// SIS.ERR_* functions/properties
ApiController.prototype.sendError = function(res, err) {
    if (!(err instanceof Array) || err.length < 2) {
        if (res.log) {
            res.log.error(err);
        }
        err = [500, err];
    }
    res.status(err[0]).send(err[1]);
};

var CHUNK_SIZE = 100;

function writeJSONArrayChunk(res, array, cStart, cSize, defer) {
    var slice = null;
    var mapped = null;
    var jsonStr = null;
    if (cStart + cSize >= array.length) {
        // last chunk
        slice = array.slice(cStart);
        jsonStr = JSON.stringify(slice);
        if (cStart === 0) {
            res.write(jsonStr);
        } else {
            res.write(jsonStr.substring(1));
        }
        defer.resolve(res);
    } else {
        // intermediate chunk
        slice = array.slice(cStart, cStart + cSize);
        jsonStr = JSON.stringify(slice);
        if (cStart === 0) {
            res.write(jsonStr.substring(0, jsonStr.length - 1));
        } else {
            res.write(jsonStr.substring(1, jsonStr.length - 1));
        }
        // add trailing comma
        res.write(",");
        setImmediate(function() {
            writeJSONArrayChunk(res, array, cStart + cSize, cSize, defer);
        });
    }
}

function writeJSONArray(res, array) {
    var d = BPromise.pending();
    if (!array.length) {
        res.write("[]");
        d.resolve(res);
    } else {
        writeJSONArrayChunk(res, array, 0, CHUNK_SIZE, d);
    }
    return d.promise;
}

// Send a response with the specified code and data
ApiController.prototype.sendObject = function(res, code, obj, isBulk) {
    res.setHeader("Content-Type","application/json");
    res.status(code);
    if (isBulk) {
        res.setHeader("X-Accel-Buffering","no");
        res.write('{"success":');
        writeJSONArray(res, obj.success).then(function(res) {
            res.write(',"errors":');
            return writeJSONArray(res, obj.errors);
        }).then(function(res) {
            res.write("}");
            res.end();
        });
    } else if (Array.isArray(obj)) {
        if (obj.length < CHUNK_SIZE) {
            // just send
            res.send(obj);
        } else {
            res.setHeader("X-Accel-Buffering","no");
            writeJSONArray(res, obj).then(function(res) {
                res.end();
            });
        }
    } else {
        res.send(obj);
    }
};

// Parse the query parameters for a given req
// Converts the q param to an object and assigns a
// limit and offset
ApiController.prototype.parseQuery = function(req) {
    return webUtil.parseQuery(req.query, req.params.version, true);
};

ApiController.prototype.parseUpsert = function(req) {
    if (typeof req.query.upsert == 'string') {
        return req.query.upsert == 'true';
    } else {
        return req.query.upsert || false;
    }
};

// Returns true if the request wants sub-documents populated
ApiController.prototype.parsePopulate = function(req) {
    return webUtil.parsePopulate(req.query);
};

// Handler for the getAll request (typically GET controller_base/)
ApiController.prototype.getAll = function(req, res) {
    this.applyDefaults(req);
    var rq = this.parseQuery(req);
    if (rq.query === webUtil.ERROR_QUERY) {
        this.sendError(res, SIS.ERR_BAD_REQ("Query parameter is invalid.  Must be JSON"));
        return;
    }
    var options = this._getReqOptions(req);
    options.skip = rq.offset;
    options.limit = rq.limit;
    if (rq.sort) {
        options.sort = rq.sort;
    }
    var fields = rq.fields;
    var condition = rq.query;
    var p = this.getManager(req).bind(this).then(function(mgr) {
        return webUtil.flattenCondition(condition,this.sm,mgr);
    }).spread(function(flattenedCondition, mgr) {
        return mgr.count(flattenedCondition);
    }).spread(function(c, flattenedCondition, mgr) {
        c = c || 0;
        res.setHeader(SIS.HEADER_TOTAL_COUNT, c);
        if (!c || c < options.offset) {
            return BPromise.resolve([]);
        }
        options.lean = req.useLean;
        var populate = this.parsePopulate(req);
        if (populate) {
            return mgr.getPopulateFields(this.sm, populate).then(function(populateFields) {
                if (populateFields) {
                    options.populate = populateFields;
                }
                return mgr.getAll(flattenedCondition, options, fields);
            });
        } else {
            return mgr.getAll(flattenedCondition, options, fields);
        }
    });
    this._finish(req, res, p, 200);
};

// Handler for the get request (typically GET controller_base/:id)
ApiController.prototype.get = function(req, res) {
    this.applyDefaults(req);
    var id = req.params.id;
    var p = this.getManager(req).bind(this).then(function(mgr) {
        var options = this._getReqOptions(req);
        options.lean = req.useLean;
        var populate = this.parsePopulate(req);
        if (populate) {
            return mgr.getPopulateFields(this.sm, populate).then(function(populateFields) {
                if (populateFields) {
                    options.populate = populateFields;
                }
                return mgr.getById(id, options);
            });
        } else {
            return mgr.getById(id, options);
        }
    });

    this._finish(req, res, p, 200);
};

// Handler for the delete request (typically DELETE controller_base/:id)
ApiController.prototype.delete = function(req, res) {
    this.applyDefaults(req);
    var id = req.params.id;
    var p = null;
    var options = this._getReqOptions(req);
    if (id) {
        p = this.getManager(req).call('delete', id, options);
        this._finish(req, res, p, 200);
    } else {
        // bulk delete - query is required
        req.params.isBulk = true;
        var self = this;
        var rq = this.parseQuery(req);
        var condition = rq.query;
        if (!condition || !Object.keys(condition).length) {
            this.sendError(res, SIS.ERR_BAD_REQ("Bulk delete requires a non empty query."));
            return;
        }
        p = this.getManager(req).bind(this).then(function(mgr) {
            return webUtil.flattenCondition(condition,this.sm,mgr);
        }).spread(function(flattenedCondition, mgr) {
            // delegate to mgr
            return mgr.bulkDelete(flattenedCondition, options);
        });
        this._finish(req, res, p, 200);
    }
};

ApiController.prototype.bulkUpdate = function(req, res) {
    // either an array of objects or a query with an object to set
    var obj = req.body;
    var options = this._getReqOptions(req);
    var p = null;
    req.params.isBulk = true;
    if (Array.isArray(obj)) {
        if (!obj.length) {
            return this.sendError(res, SIS.ERR_BAD_REQ("Array must not be empty."));
        }
        // array of individual objects
        p = this.getManager(req).call('bulkUpdateArray', obj, options);
    } else {
        if (typeof obj !== "object") {
            return this.sendError(res, SIS.ERR_BAD_REQ("Bulk update requires array or object as body"));
        }
        var rq = this.parseQuery(req);
        var condition = rq.query;
        if (!condition || !Object.keys(condition).length) {
            return this.sendError(res, SIS.ERR_BAD_REQ("A valid query is required"));
        }
        if (!Object.keys(obj).length) {
            return this.sendError(res, SIS.ERR_BAD_REQ("Body should not be empty"));
        }
        p = this.getManager(req).bind(this).then(function(mgr) {
            return webUtil.flattenCondition(condition,this.sm, mgr);
        }).spread(function(flattenedCondition, mgr) {
            return mgr.bulkUpdateQuery(flattenedCondition, obj, options);
        });
    }
    return this._finish(req, res, p, 200);
};

// Handler for the update request (typically PUT controller_base:/id)
ApiController.prototype.update = function(req, res) {
    this.applyDefaults(req);
    var id = req.params.id;
    var obj = req.body;
    var upsert = this.parseUpsert(req);
    var p = null;
    var options = this._getReqOptions(req);
    var cas;
    if ('cas' in req.query) {
        cas = req.query.cas;
        try {
            if (typeof cas === 'string') {
                cas = JSON.parse(cas);
            }
        } catch (ex) {
            cas = { };
        }
        if (typeof cas !== 'object' ||
            cas instanceof Array ||
            !Object.keys(cas).length) {
            // invalid query
            return this.sendError(res, SIS.ERR_BAD_REQ("CAS condition must be an object."));
        }
        options.cas = cas;
    }
    if (upsert) {
        p = this.getManager(req).call('upsert', id, obj, options);
    } else {
        p = this.getManager(req).call('update', id, obj, options);
    }
    this._finish(req, res, p, 200);
};

// Handler for the add request (typically POST controller_base:/)
ApiController.prototype.add = function(req, res) {
    this.applyDefaults(req);
    var body = req.body;
    if (body instanceof Array) {
        req.params.isBulk = true;
        if (typeof req.query.all_or_none == 'undefined') {
            req.query.all_or_none = false;
        } else {
            req.query.all_or_none = req.query.all_or_none == "true";
        }
        if (!body.length) {
            return this.sendError(res, SIS.ERR_BAD_REQ("Array must not be empty."));
        }
    }
    var p = this.getManager(req);
    var options = this._getReqOptions(req);
    if (req.params.isBulk) {
        options.allOrNone = req.query.all_or_none;
        p = p.call('bulkAdd', body, options);
        this._finish(req, res, p, 200);
    } else {
        p = p.call('add', body, options);
        this._finish(req, res, p, 201);
    }
};

// Attach the controller to the app at a particular base
ApiController.prototype.attach = function(app, prefix) {
    // prepend prefix w/ /api/version str
    prefix = "/api/:version(" + SIS.SUPPORTED_VERSIONS.join("|") + ")" + prefix;
    this.apiPrefix = prefix;
    app.get(prefix, this.getAll.bind(this));
    app.get(prefix + "/:id", this.get.bind(this));
    if (!app.get(SIS.OPT_READONLY)) {
        // wrap authorization around modification calls
        app.put(prefix + "/:id", this._wrapAuth(this.update));
        app.put(prefix, this._wrapAuth(this.bulkUpdate));
        app.post(prefix, this._wrapAuth(this.add));
        app.delete(prefix + "/:id?", this._wrapAuth(this.delete));
        app.put(prefix, this._wrapAuth(this.bulkUpdate));
        // enable the commit api if we have a commitManager
        if (this.commitManager) {
            this._enableCommitApi(app, prefix);
        }
    }
};

// Returns a promise that authenticates a request
// The type specifies which kind of authentication to use
// and should have already been registered with passport
ApiController.prototype.authenticate = function(req, res, type) {
    var d = BPromise.pending();
    var self = this;
    passport.authenticate(type, {session : false}, function(err, user) {
        if (err) {
            d.reject(err);
        } else if (!user) {
            d.reject(SIS.ERR_BAD_CREDS("Invalid credentials"));
        } else {
            req.user = user;
            d.resolve(user);
        }
    })(req, res);
    return d.promise;
};

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
        p.then(function(auth) {
            func.call(self, req, res);
        })
        .catch(function(err) {
            return self.sendError(res, err);
        }).done();
    }.bind(this);
};

// Enable the commit API endpoints
ApiController.prototype._enableCommitApi = function(app, prefix) {
    // all history
    var self = this;
    app.get(prefix + "/:id/commits", function(req, res) {
        req.params.isCommitApi = true;
        var type = this.getType(req);
        var id = req.params.id;
        var rq = this.parseQuery(req);
        var mongooseModel = this.commitManager.model;

        // update the query for the right types
        rq.query.entity_id = id;
        rq.query.type = type;

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
        req.params.isCommitApi = true;
        this.commitManager.getVersionById(type, id, hid, function(err, result) {
            if (err || !result) {
                self.sendError(res, SIS.ERR_NOT_FOUND("commit", hid));
            } else {
                result.value_at = self.convertToResponseObject(req, result.value_at);
                self.sendObject(res, 200, result);
            }
        });
    }.bind(this));

    app.get(prefix + "/:id/revision/:utc", function(req, res) {
        var type = this.getType(req);
        var id = req.params.id;
        var utc = req.params.utc;
        req.params.isCommitApi = true;
        this.commitManager.getVersionByUtc(type, id, utc, function(err, result) {
            if (err || !result) {
                self.sendError(res, SIS.ERR_NOT_FOUND("commit at time", utc));
            } else {
                result = self.convertToResponseObject(req, result);
                self.sendObject(res, 200, result);
            }
        });

    }.bind(this));
};

ApiController.prototype._convertToResponseObject = function(req, obj) {
    var self = this;
    if (req.params.isBulk) {
        // change the success array
        obj.success = obj.success.map(function(o) {
            if (req.method == SIS.METHOD_PUT) {
                // get the update value
                o = o[1];
            }
            o = self.convertToResponseObject(req, o);
            return o;
        });
        return obj;
    }
    if (obj instanceof Array) {
        obj = obj.map(function(o) {
            o = self.convertToResponseObject(req, o);
            return o;
        });
    } else {
        obj = self.convertToResponseObject(req, obj);
    }
    return obj;
};

// Get the callback that will send the result from the controller
ApiController.prototype._getSendCallback = function(req, res, code) {
    var self = this;
    return function(err, result) {
        if (err) { return self.sendError(res, err); }
        var orig = result;
        if (!req.params.isBulk &&
            req.method == SIS.METHOD_PUT && req.params.id) {
            // update.. grab the second obj
            if (result instanceof Array) {
                result = result[1];
            } else if (self.parseUpsert(req)) {
                // code becomes 201 since it was created
                code = 201;
            }
        }
        result = self._convertToResponseObject(req, result);
        self.sendObject(res, code, result, req.params.isBulk);
        // dispatch hooks
        var hookType = self.getType(req);
        var hookEvt = SIS.METHODS_TO_EVENT[req.method];
        if (self.hm && req.method in SIS.METHODS_TO_EVENT) {
            var toSend = orig;
            if (req.params.isBulk) {
                toSend = orig.success;
            }
            self.hm.dispatchHooks(toSend, hookType, hookEvt, req.params.isBulk);
        }
    };
};

ApiController.prototype._saveSingleCommit = function(req, result) {
    var old = null;
    var now = null;
    switch (req.method) {
        case SIS.METHOD_PUT:
            // might be an upsert
            if (!(result instanceof Array) &&
                req.query.upsert) {
                now = result;
                break;
            }
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
            return BPromise.reject(SIS.ERR_INTERNAL("invalid commit being saved"));
    }
    // save it
    var d = BPromise.pending();
    var type = this.getType(req);
    this.commitManager.recordHistory(old, now, req.user, type, function(e, h) {
        // doesn't matter for now.
        d.resolve(result);
    });
    return d.promise;
};

ApiController.prototype._saveBulkCommits = function(req, items) {
    // save it
    var action = SIS.METHODS_TO_EVENT[req.method];
    var type = this.getType(req);
    return this.commitManager.recordHistoryBulk(items, req.user, action, type)
    .then(function() {
        return items;
    });
};

// Save a commit to the commit log
ApiController.prototype._saveCommit = function(req) {
    // need to return a promise that saves history
    // but returns the initial object passed to it
    return function(result) {
        if (!this.shouldSaveCommit(req)) {
            return BPromise.resolve(result);
        }

        if (req.params.isBulk) {
            var items = result.success;
            if (items.length) {
                return this._saveBulkCommits(req, items)
                .then(function() {
                    return result;
                }).catch(function() {
                    return result;
                });
            } else {
                return BPromise.resolve(result);
            }
        } else {
            return this._saveSingleCommit(req, result);
        }
    }.bind(this);
};

// Do the final steps of the request
// p is the promise that receives the object from the
// request handler
ApiController.prototype._finish = function(req, res, p, code) {
    p = p.tap(this._saveCommit(req));
    var cb = this._getSendCallback(req, res, code);
    p.then(function(result) {
        cb(null, result);
    })
    .catch(function(err) {
        cb(err);
    })
    .done();
};

// get request options to pass to managers per request
ApiController.prototype._getReqOptions = function(req) {
    var result = {
        user : req.user,
        version : req.params.version,
        log : req.log,
        params : req.params,
        query : req.query
    };
    if (req.method === "GET" && this.getterReadPref) {
        result.read = this.getterReadPref;
    }
    return result;
};

// export it
module.exports = exports = ApiController;
