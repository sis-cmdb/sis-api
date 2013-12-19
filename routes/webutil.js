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

    var passport = require('passport');
    var BasicStrategy = require('passport-http').BasicStrategy;
    var SIS = require("../util/constants");
    var Q = require("q");
    var util = require("util");
    var getBody = require('raw-body');
    var async = require('async');

    // authorization using user and pass via the user manager
    var _verifyUserPass = function(user, pass, done) {
        var userManager = this.auth[SIS.SCHEMA_USERS];
        userManager.getVerifiedUser(user, pass, done);
    };

    // authorization using sis_tokens
    var _verifySisToken = function(token, done) {
        var tokenManager = this.auth[SIS.SCHEMA_TOKENS];
        var userManager = this.auth[SIS.SCHEMA_USERS];
        var p = tokenManager.getById(token).then(function(t) {
            // check if the token has expired
            if (t[SIS.FIELD_EXPIRES]) {
                var expires = t[SIS.FIELD_EXPIRES];
                var timeLeft = expires.getTime() - Date.now();
                if (timeLeft <= 0) {
                    // no good
                    return Q.reject(SIS.ERR_BAD_CREDS("Token has expired."));
                }
            }
            return userManager.getById(t[SIS.FIELD_USERNAME]);
        });
        return Q.nodeify(p, done);
    };

    // need a schema manager for the strategies
    module.exports.createUserPassStrategy = function(sm) {
        return new BasicStrategy({}, _verifyUserPass.bind(sm));
    }

    // The passport strategy for authenticating x-auth-token
    function SisTokenStrategy(sm) {
        var opts = { realm : SIS.SCHEMA_TOKENS };
        this._verify = _verifySisToken.bind(sm);
        passport.Strategy.call(this);
        this.name = SIS.SCHEMA_TOKENS;
    }

    util.inherits(SisTokenStrategy, passport.Strategy);

    SisTokenStrategy.prototype.authenticate = function(req) {
        var token = req.headers[SIS.HEADER_AUTH_TOKEN];
        if (!token) { return this.error(SIS.ERR_BAD_REQ("Missing " + SIS.HEADER_AUTH_TOKEN)); }

        var self = this;
        function verified(err, user) {
            if (err) {
                return self.error(err);
            } else if (!user) {
                return self.error(SIS.ERR_BAD_CREDS("No user for the token exists."));
            }
            self.success(user);
        }

        this._verify(token, verified);
    }

    module.exports.createTokenStrategy = function(sm) {
        return new SisTokenStrategy(sm);
    }

    // middleware - json parser
    // from connect.js slightly modified
    // to accept single line comments in json
    module.exports.json = function(options) {
        options = options || {};
        var limit = options.limit || '1mb';

        return function json(req, res, next) {
            if (req._body) return next();
            req.body = req.body || {};

            var hasBody = 'content-length' in req.headers && req.headers['content-length'] !== '0';
            var mimeType = req.headers['content-type'] || '';
            if (!hasBody || mimeType != 'application/json') {
                return next();
            }

            // flag as parsed
            req._body = true;

            // parse
            getBody(req, {
                limit: limit,
                expected: req.headers['content-length']
            }, function (err, buf) {
                if (err) return next(err);

                buf = buf.toString('utf8').trim();
                var lines = buf.split('\n')
                var filtered = lines.filter(function(s) {
                    return s.trim().indexOf("//") != 0;
                });
                buf = filtered.join("\n");

                var first = buf[0];

                if (0 == buf.length) {
                    return next(SIS.ERR_BAD_REQ('invalid json, empty body'));
                }

                if ('{' != first && '[' != first) return next(SIS.ERR_BAD_REQ('invalid json'));
                try {
                    req.body = JSON.parse(buf, options.reviver);
                } catch (err){
                    err.body = buf;
                    err.status = 400;
                    return next(SIS.ERR_BAD_REQ(err));
                }
                next();
            })
        };
    };

    var stripOutId = function(idObj) {
        return idObj['_id'];
    }

    var getQueryIdsCallback = function(callback) {
        return function(e, ids) {
            if (e) {
                return callback(SIS.ERR_INTERNAL(e), null);
            }
            ids = ids.map(stripOutId);
            callback(null, ids);
        }
    }

    var getFindCond = function(key, condition) {
        var result = {};
        result[key] = condition;
        return result;
    }

    // provides callback with an array of object ids that match a given condition
    // at the model's schemaPath.  remainingPath is the path left over
    // in the query.
    // for instance, a query for ref_field.num - schema path would be
    // ref_field, and num would be remainingPath.  model would point to
    // the model that knows about the ref_field and which other model it
    // belongs to.
    var getObjectIds = function(schemaPath, condition, remainingPath,
                                sm, model, callback) {
        // get the ObjectId schemaType from mongoose
        var oidType = model.schema.path(schemaPath);
        var opts = oidType.options;
        if (!opts || !opts.ref) {
            // just return an empty array
            return callback(null, []);
        }
        sm.getSisModelAsync(opts.ref, function(err, sisModel) {
            if (err) {
                return callback(err, null);
            }
            // need to check if the remainingPath is another reference
            // or the actual path
            var path = sisModel.schema.path(remainingPath);
            if (path) {
                // we can query this since it is a property of the model
                sisModel.find(getFindCond(remainingPath, condition), '_id', getQueryIdsCallback(callback));
            } else {
                // need to see if we're looking to join another set of object ids
                var references = SIS.UTIL_GET_OID_PATHS(sisModel).map(function(arr) {
                    return arr.join(".");
                });
                if (references.length == 0) {
                    // no object ids referenced by this nested model, so the
                    // path is invalid.. bail
                    return callback(null, []);
                } else {
                    // find out which reference matches the remainingPath
                    var found = false;
                    for (var i = 0; i < references.length; ++i) {
                        var ref = references[i];
                        var path = ref + ".";
                        if (remainingPath.indexOf(path) == 0) {
                            found = true;
                            // if it's path._id then we can just query this
                            if (remainingPath == path + "_id") {
                                sisModel.find(getFindCond(remainingPath, condition), '_id',
                                              getQueryIdsCallback(callback));
                            } else {
                                // nested so we need to get the ids and then
                                // issue an $in query for this path
                                var nestedRemain = remainingPath.substring(path.length);
                                getObjectIds(references[i], condition, nestedRemain,
                                             sm, sisModel, function(e, ids) {
                                    if (e) {
                                        return callback(e, null);
                                    } else if (ids.length == 0) {
                                        return callback(null, ids);
                                    } else if (ids.length == 1) {
                                        // no need for $in
                                        sisModel.find(getFindCond(ref, ids[0]), '_id',
                                                      getQueryIdsCallback(callback));
                                    } else {
                                        // need in..
                                        sisModel.find(getFindCond(ref, { "$in" : ids }), '_id',
                                                      getQueryIdsCallback(callback));
                                    }
                                });
                            }
                        }
                    }
                    if (!found) {
                        // path is invalid.  just return empty
                        return callback(null, []);
                    }
                }
            }
        });
    }

    // "flatten" a query to deal with all joins
    // returns a promise for the flattened query
    module.exports.flattenCondition = function(condition, schemaManager, mgr) {
        if (!condition || typeof condition !== 'object' ||
            !mgr.references || mgr.references.length == 0) {
            return Q(condition);
        }
        var keys = Object.keys(condition);
        if (keys.length == 0) {
            return Q(condition);
        }
        var paths = mgr.references.map(function(arr) {
            return arr.join(".");
        });

        var found = false;
        var flattened = { };
        // the field in the condition that maps
        // to a join path
        var fieldToPath = {};
        for (var k = 0; k < keys.length; ++k) {
            var key = keys[k];
            // compare with the references - probably a better way to do
            // this ;)
            for (var i = 0; i < paths.length; ++i) {
                var ref = paths[i] + ".";
                if (key.indexOf(ref) == 0 && key != ref + "_id") {
                    fieldToPath[key] = [paths[i], condition[key]];
                    found = true;
                    // break inner
                    break;
                }
            }
            if (!fieldToPath[key]) {
                // shallow copy to flattened
                flattened[key] = condition[key];
            }
        }
        if (found) {
            var d = Q.defer();
            // need to flatten the condition
            // convert all keys in the fieldToPath to
            // path => [id]
            var fieldKeys = Object.keys(fieldToPath);
            async.map(fieldKeys, function(key, callback) {
                var schemaPath = fieldToPath[key][0];
                var cond = fieldToPath[key][1];
                var remainingPath = key.substring(schemaPath.length + 1);
                getObjectIds(schemaPath, cond, remainingPath,
                             schemaManager, mgr.model, callback);
            }, function(err, results) {
                // results is an array of tuples key -> condition
                if (err) {
                    d.reject(err);
                } else {
                    for (var i = 0; i < results.length; ++i) {
                        var key = fieldKeys[i];
                        var path = fieldToPath[key][0];
                        var ids = results[i];
                        if (ids.length == 1) {
                            flattened[path] = ids[0];
                        } else {
                            flattened[path] = { "$in" : ids };
                        }
                    }
                    d.resolve(flattened);
                }
            });
            return d.promise;
        } else {
            return Q(condition);
        }
    }


})();
