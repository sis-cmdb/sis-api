'use strict';

var passport = require('passport');
var BasicStrategy = require('passport-http').BasicStrategy;
var SIS = require("../util/constants");
var BPromise = require("bluebird");
var util = require("util");
var _ = require("lodash");

// authorization using user and pass via the user manager
var _verifyUserPass = function(user, pass, done) {
    var userManager = this.auth[SIS.SCHEMA_USERS];
    userManager.getVerifiedUser(user, pass).nodeify(done);
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
            return userManager.getOrCreateEmptyUser(userObj, ldapSisUser).nodeify(done);
        });
    };
};

// authorization using sis_tokens
var _verifySisToken = function(token, done) {
    var userManager = this.auth[SIS.SCHEMA_USERS];
    var p = this.tokenFetcher.getTokenByName(token).then(function(t) {
        // check if the token has expired
        if (t[SIS.FIELD_EXPIRES]) {
            var expires = t[SIS.FIELD_EXPIRES];
            var timeLeft = expires.getTime() - Date.now();
            if (timeLeft <= 0) {
                // no good
                return BPromise.reject(SIS.ERR_BAD_CREDS("Token has expired."));
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

var mapIds = function(ids) {
    return ids.map(stripOutId);
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
var getObjectIds = function(schemaRef, condition, remainingPath,
                            sm, model) {
    var optRef = schemaRef.ref;
    if (!optRef) {
        // just return an empty array
        return BPromise.resolve([]);
    }
    return sm.getEntityModelAsync(optRef).then(function(sisModel){
        // need to check if the remainingPath is another reference
        // or the actual path
        var path = sisModel.schema.path(remainingPath);
        if (path) {
            // we can query this since it is a property of the model
            return sisModel.findAsync(getFindCond(remainingPath, condition), '_id')
                .then(mapIds);
        } else {
            // need to see if we're looking to join another set of object ids
            var references = SIS.UTIL_GET_OID_PATHS(sisModel.schema);
            if (!references.length) {
                // no object ids referenced by this nested model, so the
                // path is invalid.. bail
                return BPromise.resolve([]);
            } else {
                // find out which reference matches the remainingPath
                var found = false;
                path = null;
                var ref = null;
                for (var i = 0; i < references.length; ++i) {
                    ref = references[i].path;
                    path = ref + ".";
                    if (remainingPath.indexOf(path) === 0) {
                        found = true;
                        break;
                    }
                }
                if (found) {
                    // if it's path._id then we can just query this
                    if (remainingPath == path + "_id") {
                        return sisModel.findAsync(getFindCond(remainingPath, condition), '_id',
                                                  { lean : true }).then(mapIds);
                    } else {
                        // nested so we need to get the ids and then
                        // issue an $in query for this path
                        var nestedRemain = remainingPath.substring(path.length);
                        return getObjectIds(references[i], condition, nestedRemain,
                                            sm, sisModel).then(function(ids) {
                            if (!ids || !ids.length) {
                                return BPromise.resolve([]);
                            }
                            var findCond = ids.length == 1 ? getFindCond(ref, ids[0]) : getFindCond(ref, { "$in" : ids});
                            return sisModel.findAsync(findCond, '_id', {lean : true}).then(mapIds);
                        });
                    }
                } else {
                    // path is invalid.  just return empty
                    return BPromise.resolve([]);
                }
            }
        }
    })
    .catch(function(err) {
        if (err instanceof Array) {
            return BPromise.reject(err);
        }
        return BPromise.reject(SIS.ERR_INTERNAL(err));
    });
};

var addIdsToFlattenedCondition = function(flattened, path, ids) {
    if (!ids || !ids.length ||
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

function getValidKeys(condition) {
    var keys = Object.keys(condition);
    if (!keys.length) {
        return null;
    }
    var invalid = keys.some(function(key) {
        return key[key.length - 1] === '.' ||
            ((key === "$or" || key === "$and" || key === "$nor") &&
             !Array.isArray(condition[key]));
    });
    return invalid ? null : keys;
}

var OR_AND_NOR = ["$or","$and","$nor"];

// "flatten" a query to deal with all joins
// returns a promise for the flattened query + mgr
module.exports.flattenCondition = function(condition, schemaManager, mgr) {
    var references = mgr.getReferences();
    if (!condition || typeof condition !== 'object' ||
        !references || !references.length) {
        return BPromise.resolve([condition, mgr]);
    }
    var keys = getValidKeys(condition);
    if (!keys) {
        return BPromise.resolve([condition, mgr]);
    }
    var paths = references.map(function(ref) {
        return ref;
    });

    function mapInnerCondition(innerCond) {
        return module.exports.flattenCondition(innerCond, schemaManager, mgr);
    }

    var mustFlatten = false;
    var flattened = { };
    var orAndNorPromises = [];
    // the field in the condition that maps
    // to a join path
    var fieldToPath = {};

    // deal with $or and $and and $nor
    OR_AND_NOR.forEach(function(key) {
        if (condition[key]) {
            var promise = BPromise.map(condition[key], mapInnerCondition)
                .then(function(flatResults) {
                    // flatResults is an array of arrays where
                    // each array is a flattend condition, manager tuple
                    // so we need to only grab the flattened conditions out
                    var flatConditions = flatResults.map(function(fr) {
                        return fr[0];
                    });
                    return [key, flatConditions];
                });
            orAndNorPromises.push(promise);
            mustFlatten = true;
            delete condition[key];
        }
    });

    // or and nor already taken care of
    var k = 0;
    var key = null;
    for (k = 0; k < keys.length; ++k) {
        key = keys[k];
        // compare with the references - probably a better way to do
        // this ;)
        for (var i = 0; i < paths.length; ++i) {
            var ref = paths[i].path + ".";
            if (key.indexOf(ref) === 0 && key != ref + "_id") {
                fieldToPath[key] = [paths[i], condition[key]];
                mustFlatten = true;
                break;
            }
        }
        if (!fieldToPath[key]) {
            // shallow copy to flattened since it is a reference to an embedded
            // subdoc
            flattened[key] = condition[key];
        }
    }
    if (mustFlatten) {
        // need to flatten the condition
        // convert all keys in the fieldToPath to
        // path => [id]
        var fieldKeys = Object.keys(fieldToPath);
        var promises = fieldKeys.map(function(key) {
            var schemaPath = fieldToPath[key][0];
            var cond = fieldToPath[key][1];
            var remainingPath = key.substring(schemaPath.path.length + 1);
            return getObjectIds(schemaPath, cond, remainingPath,
                                schemaManager, mgr.model);
        });
        var resultPromise = BPromise.resolve([flattened, mgr]);
        if (promises.length) {
            resultPromise = resultPromise.spread(function(flattened, mgr) {
                return BPromise.all(promises).then(function(results) {
                    var refConds = {};
                    for (var i = 0; i < results.length; ++i) {
                        var key = fieldKeys[i];
                        var path = fieldToPath[key][0].path;
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
                    return BPromise.resolve([flattened, mgr]);
                });
            });
        }
        if (orAndNorPromises.length) {
            resultPromise = resultPromise.spread(function(flattened, mgr) {
                return BPromise.all(orAndNorPromises).then(function(results) {
                    results.forEach(function(res) {
                        // res is tuple of key => flattened conditions
                        flattened[res[0]] = res[1];
                    });
                    return BPromise.resolve([flattened, mgr]);
                });
            });
        }
        return resultPromise;
    } else {
        return BPromise.resolve([condition, mgr]);
    }
};

module.exports.parsePopulate = function(reqQuery) {
    reqQuery = reqQuery || { };
    var param = reqQuery.populate;
    if (typeof param === 'string') {
        if (param === 'true') { return true; }
        if (param === 'false') { return false; }
        // array
        return _.uniq(param.split(",").map(_.trim));
    } else {
        return param || false;
    }
};

module.exports.parseQuery = function(reqQuery, version, enforceLimit) {
    var query = reqQuery.q || { };
    // try parsing..
    try {
        if (typeof query === 'string') {
            query = JSON.parse(query);
        }
    } catch (ex) {
        query = {};
    }
    if (version === "v1") {
        query = SIS.UTIL_QUERY_FROM_V1(query);
    }
    var fields = reqQuery.fields;
    if (fields) {
        if (typeof fields !== 'string') {
            fields = null;
        } else {
            fields = fields.split(',').join(' ');
        }
    }
    var result = {'query' : query, 'fields' : fields};
    if (enforceLimit) {
        var limit = parseInt(reqQuery.limit, 10) || SIS.MAX_RESULTS;
        if (limit > SIS.MAX_RESULTS) { limit = SIS.MAX_RESULTS; }
        var offset = parseInt(reqQuery.offset, 10) || 0;
        result.limit = limit;
        result.offset = offset;
    } else {
        // optional - but still might be there
        if (reqQuery.limit) {
            result.limit = parseInt(reqQuery.limit, 10);
        }
        if (reqQuery.offset) {
            result.offset = parseInt(reqQuery.offset, 10);
        }
    }

    var sort = reqQuery.sort;
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
        result.sort = sortOpt;
    }
    return result;
};
