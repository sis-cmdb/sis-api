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

module.exports = {

    // events / actions
    EVENT_INSERT : "insert",
    EVENT_UPDATE : "update",
    EVENT_DELETE : "delete",

    EVENTS_ENUM : ["insert", "update", "delete"],

    // fields
    FIELD_ID : "_id",
    FIELD_VERS : "__v",
    FIELD_CREATED_AT : "_created_at",
    FIELD_UPDATED_AT : "_updated_at",

    // schema names
    SCHEMA_SCHEMAS : "sis_schemas",
    SCHEMA_HOOKS : "sis_hooks",
    SCHEMA_HIERA : "sis_hiera",
    SCHEMA_COMMITS : "sis_commits",
    SCHEMA_USERS : "sis_users",
    SCHEMA_SERVICES : "sis_services",
    SCHEMA_TOKENS : "sis_tokens"

}
