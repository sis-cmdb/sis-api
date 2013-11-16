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

var util = require('util')

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
    FIELD_NAME : "name",

    // schema names
    SCHEMA_SCHEMAS : "sis_schemas",
    SCHEMA_HOOKS : "sis_hooks",
    SCHEMA_HIERA : "sis_hiera",
    SCHEMA_COMMITS : "sis_commits",
    SCHEMA_USERS : "sis_users",
    SCHEMA_SERVICES : "sis_services",
    SCHEMA_TOKENS : "sis_tokens",

    // option keys
    OPT_SCHEMA_MGR : "schemaManager", // TODO: snake case
    OPT_LOG_COMMTS : "log_commits",
    OPT_FIRE_HOOKS : "fire_hooks",
    OPT_READONLY : "readonly",
    OPT_ID_FIELD : "id_field",
    OPT_TYPE : "type",

    MAX_RESULTS : 200,

    // populate option
    OPT_MGR_POPULATE : "_sis_populate",

    // headers
    HEADER_TOTAL_COUNT : "x-total-count",

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
            return [400, { error : util.format("Invalid data %s", msg), code : 1001 }];
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
    ERR_BAD_CREDS : [401, { error : "Invalid credentials", code : 1003}]
}
