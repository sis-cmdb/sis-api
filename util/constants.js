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

var util = require('util');
var diff = require('jsondiffpatch');

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
    FIELD_VERS : "__v",
    FIELD_CREATED_AT : "_created_at",
    FIELD_UPDATED_AT : "_updated_at",
    FIELD_CREATED_BY : "_created_by",
    FIELD_UPDATED_BY : "_updated_by",
    FIELD_NAME : "name",
    FIELD_EXPIRES : "expires",
    FIELD_TOKEN : "token",
    FIELD_DESC : "desc",
    FIELD_ROLES : "roles",
    FIELD_PW : "pw",
    FIELD_OWNER : "owner",
    FIELD_SUPERUSER : "super_user",
    FIELD_CREATOR : "creator",
    FIELD_EMAIL : "email",
    FIELD_USERNAME : "username",
    FIELD_TOKEN_USER : "sis_token_user",
    FIELD_MODIFIED_BY : "modified_by",
    FIELD_VERIFIED : "verified",
    FIELD_LOCKED : "locked",

    // schema names
    SCHEMA_SCHEMAS : "sis_schemas",
    SCHEMA_HOOKS : "sis_hooks",
    SCHEMA_HIERA : "sis_hiera",
    SCHEMA_COMMITS : "sis_commits",
    SCHEMA_USERS : "sis_users",
    SCHEMA_TOKENS : "sis_tokens",

    AUTH_TYPES : ["sis_users", "sis_services"],
    AUTH_EXPIRATION_TIME : 1000 * 60 * 60 * 8, // 8 hrs

    // option keys
    OPT_SCHEMA_MGR : "schema_manager", // TODO: snake case
    OPT_LOG_COMMTS : "log_commits",
    OPT_FIRE_HOOKS : "fire_hooks",
    OPT_READONLY : "readonly",
    OPT_ID_FIELD : "id_field",
    OPT_TYPE : "type",
    OPT_USE_AUTH : "auth",
    OPT_ADMIN_REQUIRED : "admin_required",

    ROLE_USER : "user",
    ROLE_ADMIN : "admin",

    // an admin of one of the groups
    PERMISSION_ADMIN : "admin",
    // a user of one of the groups
    PERMISSION_USER : "user",
    // a user of all of the groups
    PERMISSION_USER_ALL_GROUPS : "all_groups",
    // no permissions at all
    PERMISSION_NONE : "none",

    DEFAULT_OPT_USE_AUTH : true,


    MAX_RESULTS : 200,

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
        if (msg.stack) {
            console.log(msg.stack);
        }
        return [500, { error : util.format("Internal error %s", msg), code : 1002 }, msg];
    },
    ERR_INTERNAL_OR_NOT_FOUND : function(err, type, id, result) {
        if (err) {;
            if (typeof err == 'object' && err.name == 'CastError') {
                return module.exports.ERR_NOT_FOUND(type, id);
            }
            return module.exports.ERR_INTERNAL(err);
        } else {
            return module.exports.ERR_NOT_FOUND(type, id);
        }
    },
    ERR_BAD_CREDS : function(msg) {
        //throw new Error("WTF?!?!");
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
        if (a == null || b == null) return false;
        if (a.length != b.length) return false;

        // If you don't care about the order of the elements inside
        // the array, you should sort both arrays here.
        for (var i = 0; i < a.length; ++i) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    },

    UTIL_ROLES_EQUAL : function(a, b) {
        var rolesA = a['roles'];
        var rolesB = b['roles'];
        if (rolesA === rolesB) return true;
        if (rolesA == null || rolesB == null) return false;
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
            if (keys.length == 0) {
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
    UTIL_GET_OID_PATHS : function(model) {
        var schema = model.schema;
        var paths = [];
        schema.eachPath(function(pathName, schemaType) {
            if (schemaType.instance == "ObjectID" && pathName != "_id") {
                paths.push(pathName.split(/\./));
            }
        });
        return paths;
    }
}
