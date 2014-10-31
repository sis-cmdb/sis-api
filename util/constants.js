// some constants and util functions

'use strict';

var util = require('util');
var diff = require('jsondiffpatch');

var V1_TO_SIS_META = {
    'sis_tags'      : 'tags',
    'sis_locked'    : 'locked',
    'sis_immutable' : 'immutable',
    'owner'         : 'owner',
    '_references'   : '_references',
    '_created_at'   : '_created_at',
    '_updated_at'   : '_updated_at',
    '_created_by'   : '_created_by',
    '_updated_by'   : '_updated_by',
    '_trans_id'     : '_trans_id'
};

var SIS_META_TO_V1 = function() {
    var res = { };
    for (var k in V1_TO_SIS_META) {
        var v = V1_TO_SIS_META[k];
        res[v] = k;
    }
    return res;
}();

var FIELD_LOCKED = "locked";
var FIELD_IMMUTABLE = "immutable";
var FIELD_OWNER = "owner";
var FIELD_TAGS = "tags";
var FIELD_SIS_META = "_sis";
var FIELD_SIS_VERSION = "_version";
var CURRENT_VERSION = "v1.1";
var FIELD_VERS = "_v";

module.exports = {

    // events / actions
    EVENT_INSERT : "insert",
    EVENT_UPDATE : "update",
    EVENT_DELETE : "delete",

    EVENTS_ENUM : ["insert", "update", "delete"],

    METHOD_PUT : "PUT",
    METHOD_POST : "POST",
    METHOD_GET : "GET",
    METHOD_DELETE : "DELETE",

    METHODS_TO_EVENT : {
        "PUT" : "update",
        "POST" : "insert",
        "DELETE" : "delete"
    },

    // fields
    FIELD_ID : "_id",
    FIELD_VERS : FIELD_VERS,
    FIELD_NAME : "name",
    FIELD_EXPIRES : "expires",
    FIELD_TOKEN : "token",
    FIELD_DESC : "desc",
    FIELD_ROLES : "roles",
    FIELD_PW : "pw",
    FIELD_SUPERUSER : "super_user",
    FIELD_CREATOR : "creator",
    FIELD_EMAIL : "email",
    FIELD_USERNAME : "username",
    FIELD_TOKEN_USER : "sis_token_user",
    FIELD_MODIFIED_BY : "modified_by",
    FIELD_VERIFIED : "verified",
    FIELD_LOCKED_FIELDS : "locked_fields",
    FIELD_TRACK_HISTORY : "track_history",
    FIELD_DESCRIPTION : "description",
    FIELD_IS_OPEN : "is_open",
    FIELD_ID_FIELD : "id_field",
    FIELD_ANY_ADMIN_MOD : "any_owner_can_modify",
    FIELD_IS_PUBLIC : "is_public",

    // meta fields
    // container
    FIELD_SIS_META : FIELD_SIS_META,
    // fields
    // those that start w/ _ are readonly

    FIELD_REFERENCES : "_references",
    FIELD_TRANSACTION_ID : "_trans_id",
    FIELD_SIS_VERSION : FIELD_SIS_VERSION,
    FIELD_CREATED_AT : "_created_at",
    FIELD_UPDATED_AT : "_updated_at",
    FIELD_CREATED_BY : "_created_by",
    FIELD_UPDATED_BY : "_updated_by",
    FIELD_LOCKED : FIELD_LOCKED,
    FIELD_IMMUTABLE : FIELD_IMMUTABLE,
    FIELD_OWNER : FIELD_OWNER,
    FIELD_TAGS : FIELD_TAGS,


    MUTABLE_META_FIELDS : [
        FIELD_TAGS,
        FIELD_IMMUTABLE,
        FIELD_OWNER,
        FIELD_LOCKED
    ],

    // schema names
    SCHEMA_SCHEMAS : "sis_schemas",
    SCHEMA_HOOKS : "sis_hooks",
    SCHEMA_HIERA : "sis_hiera",
    SCHEMA_COMMITS : "sis_commits",
    SCHEMA_USERS : "sis_users",
    SCHEMA_TOKENS : "sis_tokens",

    AUTH_EXPIRATION_TIME : 1000 * 60 * 60 * 8, // 8 hrs
    AUTH_TYPE_SIS : "sis",
    AUTH_TYPE_LDAP : "ldap",
    AUTH_TYPES : ["sis", "ldap"],

    // option keys
    OPT_SCHEMA_MGR : "schema_manager",
    OPT_LOG_COMMTS : "log_commits",
    OPT_FIRE_HOOKS : "fire_hooks",
    OPT_READONLY : "readonly",
    OPT_ID_FIELD : "id_field",
    OPT_TYPE : "type",
    OPT_USE_AUTH : "auth",
    OPT_AUTH_CONFIG : "auth_config",

    // supported versions
    SUPPORTED_VERSIONS : ["v1","v1.1"],
    CURRENT_VERSION : CURRENT_VERSION,

    ROLE_USER : "user",
    ROLE_ADMIN : "admin",

    // an admin of all of the groups
    PERMISSION_ADMIN : "admin",
    // a user of one of the groups
    PERMISSION_USER : "user",
    // a user of all of the groups
    PERMISSION_USER_ALL_GROUPS : "all_groups",
    // no permissions at all
    PERMISSION_NONE : "none",

    DEFAULT_OPT_USE_AUTH : true,


    MAX_RESULTS : 1000,

    // headers
    HEADER_TOTAL_COUNT : "x-total-count",
    HEADER_AUTH_TOKEN : "x-auth-token",

    // errors
    // error objects are an array w/ first elem as http status, second as err obj
    // i.e. [ 404, { error : "string", code : ### }]
    ERR_NOT_FOUND : function(type, id) {
        return [404, { error : util.format("%s %s does not exist", type, id), code : 1000 }];
    },
    ERR_BAD_REQ : function(msg) {
        return [400, { error : util.format("Bad request: %s", msg), code : 1001 }];
    },
    ERR_INTERNAL : function(msg) {
        if (!msg) { return null; }
        if (typeof msg == 'object' && msg.name == 'ValidationError') {
            return [400, { error : util.format("Invalid data %s", msg), code : 1003 }];
        }
        // if (msg.stack) {
        //     console.log(msg.stack);
        // }
        return [500, { error : util.format("Internal error %s", msg), code : 1002 }, msg];
    },
    ERR_INTERNAL_OR_NOT_FOUND : function(err, type, id, result) {
        if (err) {
            if (typeof err == 'object' && err.name == 'CastError') {
                return module.exports.ERR_NOT_FOUND(type, id);
            }
            return module.exports.ERR_INTERNAL(err);
        } else {
            return module.exports.ERR_NOT_FOUND(type, id);
        }
    },
    ERR_BAD_CREDS : function(msg) {
        if (typeof msg !== 'string') {
            msg = JSON.stringify(msg);
        }
        return [401, { error : util.format("Unauthorized. %s", msg), code : 1004 }, msg];
    },

    UTIL_MERGE_SHALLOW : function(obj, partial) {
        for (var k in partial) {
            if (partial.hasOwnProperty(k) && !(k in obj)) {
                obj[k] = partial[k];
            }
        }
    },
    // credit.. http://stackoverflow.com/a/16436975/263895
    UTIL_ARRAYS_EQUAL : function(a, b) {
        if (a === b) return true;
        if (!a || !b) return false;
        if (a.length != b.length) return false;

        // If you don't care about the order of the elements inside
        // the array, you should sort both arrays here.
        for (var i = 0; i < a.length; ++i) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    },

    UTIL_ROLES_EQUAL : function(a, b) {
        var rolesA = a.roles;
        var rolesB = b.roles;
        if (rolesA === rolesB) return true;
        if (!rolesA || !rolesB) return false;
        var roleNamesA = Object.keys(rolesA).sort();
        var roleNamesB = Object.keys(rolesB).sort();
        if (!this.UTIL_ARRAYS_EQUAL(roleNamesA, roleNamesB)) {
            return false;
        }
        for (var r in rolesB) {
            if (rolesB[r] != rolesA[r]) {
                return false;
            }
        }
        return true;
    },

    UTIL_VALIDATE_ROLES : function(obj, isUser) {
        if (isUser) {
            // super users can get away with no roles..
            if (obj[this.FIELD_SUPERUSER]) {
                return null;
            }
        }
        if (!(this.FIELD_ROLES in obj)) {
            return "roles are missing.";
        }
        var roles = obj[this.FIELD_ROLES];
        try {
            var keys = Object.keys(roles);
            // allow empty roles
            if (!keys.length) {
                return null;
            }
            for (var i = 0; i < keys.length; ++i) {
                var k = keys[i];
                if (roles[k] != this.ROLE_USER &&
                    roles[k] != this.ROLE_ADMIN) {
                    return "invalid role specified: " + roles[k];
                }
            }
        } catch (ex) {
            return "roles must be a non empty object";
        }
        return null;
    },

    UTIL_ENSURE_ROLE_SUBSET : function(roles, subset, adminOnly) {
        if (!roles) {
            return false;
        }
        if (!subset) {
            return true;
        }
        for (var k in subset) {
            if (!(k in roles)) {
                return false;
            }
            var masterRole = roles[k];
            var subRole = subset[k];
            if (adminOnly) {
                if (masterRole != this.ROLE_ADMIN) {
                    return false;
                }
            } else {
                if (masterRole == this.ROLE_USER &&
                    subRole == this.ROLE_ADMIN) {
                    return false;
                }
            }
        }
        return true;
    },

    // return an array of arrays where each inner array
    // is a broken down path to an object id type that isn't _id
    // schema is a mongoose schema object
    UTIL_GET_OID_PATHS : function(schema) {
        var paths = [];
        var self = this;
        schema.eachPath(function(pathName, schemaType) {
            if (schemaType.instance == "ObjectID" &&
                schemaType.options && schemaType.options.ref) {
                paths.push({
                    'path' : pathName,
                    'splits' : pathName.split(/\./),
                    'type' : 'oid',
                    'ref' : schemaType.options.ref
                });
            } else if (schemaType.constructor.name.indexOf('Array') != -1) {
                // could be an obj id or a document..
                if (schemaType.caster.instance == "ObjectID" &&
                    schemaType.caster.options.ref) {
                    schemaType = schemaType.caster;
                    paths.push({
                        'path' : pathName,
                        'splits' : pathName.split(/\./),
                        'type' : 'arr',
                        'ref' : schemaType.options.ref
                    });
                } else if (schemaType.constructor.name.indexOf("DocumentArray") != -1 &&
                           schemaType.schema) {
                    var subIdPaths = self.UTIL_GET_OID_PATHS(schemaType.schema);
                    subIdPaths.forEach(function(p) {
                        var fullPath = pathName + "." + p.path;
                        paths.push({
                            path : fullPath,
                            splits : fullPath.split(/\./),
                            container : 'docarr',
                            containerPath : pathName,
                            containerSplits : pathName.split(/\./),
                            subRef : p,
                            ref : p.ref
                        });
                    });
                }
            }
        });
        return paths;
    },

    // field mapping
    V1_TO_SIS_META : V1_TO_SIS_META,

    SIS_META_TO_V1 : SIS_META_TO_V1,

    UTIL_FROM_V1 : function(obj) {
        if (obj[FIELD_SIS_META]) {
            // done
            return obj;
        }
        if (typeof obj.toObject === "function") {
            obj = obj.toObject();
        }
        // returns a shallow copy
        var result = { };
        var sisMeta = obj[FIELD_SIS_META] || { };
        for (var k in obj) {
            if (!(k in V1_TO_SIS_META) &&
                k != '__v') {
                result[k] = obj[k];
            }
        }
        for (k in V1_TO_SIS_META) {
            if (k in obj) {
                sisMeta[V1_TO_SIS_META[k]] = obj[k];
            }
        }
        sisMeta[FIELD_SIS_VERSION] = CURRENT_VERSION;
        // convert __v to _v
        if ('__v' in obj) {
            result[FIELD_VERS] = obj.__v;
        }
        result[FIELD_SIS_META] = sisMeta;
        return result;
    },

    UTIL_TO_V1 : function(obj) {
        if (!obj) {
            return obj;
        }
        if (typeof obj.toObject === "function") {
            obj = obj.toObject();
        }
        if (!obj[FIELD_SIS_META]) {
            return obj;
        }
        // not in place
        var result = { };
        for (var k in obj) {
            if (k != FIELD_SIS_META) {
                result[k] = obj[k];
            }
        }
        var sisMeta = obj[FIELD_SIS_META];
        for (k in SIS_META_TO_V1) {
            if (k in sisMeta) {
                result[SIS_META_TO_V1[k]] = sisMeta[k];
            }
        }
        if ('_v' in obj) {
            result.__v = obj._v;
        }
        return result;
    },

    UTIL_QUERY_FROM_V1 : function(query) {
        var andDoc = query.$and || [];
        if (!(andDoc instanceof Array)) {
            andDoc = [andDoc];
        }
        for (var k in V1_TO_SIS_META) {
            if (k in query) {
                var tmp = query[k];
                delete query[k];
                // change it to an or
                var v1Doc = {};
                v1Doc[k] = tmp;
                var v11Doc = {};
                var metaField = V1_TO_SIS_META[k];
                v11Doc[FIELD_SIS_META + "." + metaField] = tmp;
                var orDoc = {
                    $or : [v1Doc, v11Doc]
                };
                andDoc.push(orDoc);
            }
        }
        if (andDoc.length) {
            query.$and = andDoc;
        }
        return query;
    },

    UTIL_SET_DEFAULT_ARRAY : function(obj, path) {
        var paths = path.split('.');
        var last = paths.pop();
        while(paths.length) {
            var p = paths.shift();
            obj = obj[p];
            if (!obj) {
                // early exit
                return;
            }
        }
        if (!obj[last]) {
            obj[last] = [];
        }
    }
};
