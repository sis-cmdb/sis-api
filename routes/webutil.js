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

(function() {

    'use strict';

    var passport = require('passport');
    var BasicStrategy = require('passport-http').BasicStrategy;
    var SIS = require("../util/constants");
    var Promise = require("bluebird");
    var util = require("util");

    // authorization using user and pass via the user manager
    var _verifyUserPass = function(user, pass, done) {
        var userManager = this.auth[SIS.SCHEMA_USERS];
        userManager.getVerifiedUser(user, pass, done);
    };

    var getLdapVerificationFunc = function(sm, auth_config) {
        if (!auth_config) {
            throw new Error("LDAP authentication requires configuration.");
        }
        var ldap = require('ldapjs');
        var userManager = sm.auth[SIS.SCHEMA_USERS];
        var url = auth_config.url;
        var ud = auth_config.user_domain;
        var ed = auth_config.email_domain;
        if (!url || !ud || !ed) {
            throw new Error("LDAP authentication requires url, user_domain, and email_domain");
        }
        var client_opts = auth_config.client_opts || { };
        client_opts.url = url;
        if (client_opts.tlsOptions && client_opts.tlsOptions.rejectUnauthorized === false) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        }
        // "user" that is in the created by fields - a super user
        var ldapSisUser = {
            name : "_sis_ldap_auth_",
            super_user : true
        };
        return function(user, pass, done) {
            var client = ldap.createClient(client_opts);
            var ldapUser = user + '@' + ud;
            client.bind(ldapUser, pass, function(err) {
                // unbind - don't wait around.
                client.unbind(function() { });
                if (err) {
                    return done(SIS.ERR_BAD_CREDS("LDAP authentication failed : " + err), null);
                }
                var userObj = {
                    name : user,
                    email : user + '@' + ed
                };
                return userManager.getOrCreateEmptyUser(userObj, ldapSisUser, done);
            });
        };
    };

    // authorization using sis_tokens
    var _verifySisToken = function(token, done) {
        var tokenManager = this.auth[SIS.SCHEMA_TOKENS];
        var userManager = this.auth[SIS.SCHEMA_USERS];
        var p = tokenManager.getById(token, {lean : true}).then(function(t) {
            // check if the token has expired
            if (t[SIS.FIELD_EXPIRES]) {
                var expires = t[SIS.FIELD_EXPIRES];
                var timeLeft = expires.getTime() - Date.now();
                if (timeLeft <= 0) {
                    // no good
                    return Promise.reject(SIS.ERR_BAD_CREDS("Token has expired."));
                }
            }
            return userManager.getById(t[SIS.FIELD_USERNAME], {lean : true});
        });
        return p.nodeify(done);
    };

    var getAuthType = function(config) {
        if (!config.auth_config || !config.auth_config.type ||
            SIS.AUTH_TYPES.indexOf(config.auth_config.type) == -1) {
            return SIS.AUTH_TYPE_SIS;
        }
        return config.auth_config.type;
    };

    // need a schema manager for the strategies
    module.exports.createUserPassStrategy = function(sm, config) {
        var type = getAuthType(config);
        var verifyFunc = _verifyUserPass.bind(sm);
        if (type == SIS.AUTH_TYPE_LDAP) {
            verifyFunc = getLdapVerificationFunc(sm, config.auth_config);
        }
        return new BasicStrategy({}, verifyFunc);
    };

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
    };

    module.exports.createTokenStrategy = function(sm) {
        return new SisTokenStrategy(sm);
    };

    var stripOutId = function(idObj) {
        return idObj._id.toString();
    };

    var getQueryIdsCallback = function(d) {
        return function(e, ids) {
            if (e) {
                return d.reject(SIS.ERR_INTERNAL(e));
            }
            ids = ids.map(stripOutId);
            d.resolve(ids);
        };
    };

    var getFindCond = function(key, condition) {
        var result = {};
        result[key] = condition;
        return result;
    };

    // returns a promise for an array of object ids that match a given condition
    // at the model's schemaPath.  remainingPath is the path left over
    // in the query.
    // for instance, a query for ref_field.num - schema path would be
    // ref_field, and num would be remainingPath.  model would point to
    // the model that knows about the ref_field and which other model it
    // belongs to.
    var getObjectIds = function(schemaPath, condition, remainingPath,
                                sm, model) {
        // get the ObjectId schemaType from mongoose
        var oidType = model.schema.path(schemaPath);
        var opts = oidType.options;
        if (!opts || !opts.ref) {
            // just return an empty array
            return Promise.resolve([]);
        }
        var d = Promise.pending();
        sm.getEntityModelAsync(opts.ref, function(err, sisModel) {
            if (err) {
                return d.reject(err);
            }
            // need to check if the remainingPath is another reference
            // or the actual path
            var path = sisModel.schema.path(remainingPath);
            if (path) {
                // we can query this since it is a property of the model
                sisModel.find(getFindCond(remainingPath, condition), '_id', getQueryIdsCallback(d));
            } else {
                // need to see if we're looking to join another set of object ids
                var references = SIS.UTIL_GET_OID_PATHS(sisModel.schema).filter(function(ref) {
                    return ref.type != 'arr';
                }).map(function(ref) {
                    return ref.path;
                });
                if (!references.length) {
                    // no object ids referenced by this nested model, so the
                    // path is invalid.. bail
                    return d.resolve([]);
                } else {
                    // find out which reference matches the remainingPath
                    var found = false;
                    path = null;
                    var ref = null;
                    for (var i = 0; i < references.length; ++i) {
                        ref = references[i];
                        path = ref + ".";
                        if (remainingPath.indexOf(path) === 0) {
                            found = true;
                            break;
                        }
                    }
                    if (found) {
                        // if it's path._id then we can just query this
                        if (remainingPath == path + "_id") {
                            sisModel.find(getFindCond(remainingPath, condition), '_id',
                                          getQueryIdsCallback(d));
                        } else {
                            // nested so we need to get the ids and then
                            // issue an $in query for this path
                            var nestedRemain = remainingPath.substring(path.length);
                            var inner = getObjectIds(references[i], condition, nestedRemain,
                                                     sm, sisModel);
                            inner.then(function(ids) {
                                if (!ids.length) {
                                    d.resolve(ids);
                                } else if (ids.length == 1) {
                                    // no need for $in
                                    sisModel.find(getFindCond(ref, ids[0]), '_id',
                                                  getQueryIdsCallback(d));
                                } else {
                                    // need in..
                                    sisModel.find(getFindCond(ref, { "$in" : ids }), '_id',
                                                  getQueryIdsCallback(d));
                                }
                            }, function(err) {
                                d.reject(err);
                            });
                        }
                    } else {
                        // path is invalid.  just return empty
                        return d.resolve([]);
                    }
                }
            }
        });
        return d.promise;
    };

    var addIdsToFlattenedCondition = function(flattened, path, ids) {
        if (!ids.length ||
            ((flattened[path] instanceof Array) &&
             !flattened[path].length)) {
            flattened[path] = [];
            return;
        }
        if (!(path in flattened)) {
            if (ids.length == 1) {
                flattened[path] = ids[0];
            } else {
                flattened[path] = ids;
            }
        } else {
            var existingIds = flattened[path];
            if (existingIds instanceof Array) {
                flattened[path] = existingIds.filter(function(id) {
                    return ids.indexOf(id) != -1;
                });
                if (flattened[path].length == 1) {
                    flattened[path] = flattened[path][0];
                }
            } else {
                if (ids.indexOf(existingIds) == -1) {
                    flattened[path] = [];
                }
            }
            // TODO: optimize

        }
    };

    // "flatten" a query to deal with all joins
    // returns a promise for the flattened query
    module.exports.flattenCondition = function(condition, schemaManager, mgr) {
        var references = mgr.getReferences();
        if (!condition || typeof condition !== 'object' ||
            !references || !references.length) {
            return Promise.resolve([condition, mgr]);
        }
        var keys = Object.keys(condition);
        if (!keys.length) {
            return Promise.resolve([condition, mgr]);
        }
        var paths = references.filter(function(ref) {
            return ref.type != 'arr';
        }).map(function(ref) {
            return ref.path;
        });

        var found = false;
        var flattened = { };
        // the field in the condition that maps
        // to a join path
        var fieldToPath = {};
        for (var k = 0; k < keys.length; ++k) {
            var key = keys[k];
            if (key[key.length - 1] == '.') {
                // invalid query - just let it flow.
                return Promise.resolve([condition, mgr]);
            }
            // compare with the references - probably a better way to do
            // this ;)
            for (var i = 0; i < paths.length; ++i) {
                var ref = paths[i] + ".";
                if (key.indexOf(ref) === 0 && key != ref + "_id") {
                    fieldToPath[key] = [paths[i], condition[key]];
                    found = true;
                    break;
                }
            }
            if (!fieldToPath[key]) {
                // shallow copy to flattened
                flattened[key] = condition[key];
            }
        }
        if (found) {
            // need to flatten the condition
            // convert all keys in the fieldToPath to
            // path => [id]
            var fieldKeys = Object.keys(fieldToPath);
            var promises = fieldKeys.map(function(key) {
                var schemaPath = fieldToPath[key][0];
                var cond = fieldToPath[key][1];
                var remainingPath = key.substring(schemaPath.length + 1);
                return getObjectIds(schemaPath, cond, remainingPath,
                                    schemaManager, mgr.model);
            });
            return Promise.all(promises).then(function(results) {
                var refConds = {};
                for (var i = 0; i < results.length; ++i) {
                    var key = fieldKeys[i];
                    var path = fieldToPath[key][0];
                    var ids = results[i];
                    addIdsToFlattenedCondition(refConds, path, ids);
                }
                for (var k in refConds) {
                    var v = refConds[k];
                    if (v instanceof Array) {
                        flattened[k] = { "$in" : v };
                    } else {
                        flattened[k] = v;
                    }
                }
                return Promise.resolve([flattened, mgr]);
            });
        } else {
            return Promise.resolve([condition, mgr]);
        }
    };

})();
