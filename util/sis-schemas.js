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

var SIS = require('./constants')

// schema definitions
module.exports.schemas = [
    // sis_schemas
    {
        name : SIS.SCHEMA_SCHEMAS,
        definition : {
            name : { type : "String", required : true, unique : true, match : /^[a-z0-9_]+$/ },
            owner : { type : ["String"], required : true },
            definition : { type : {}, required : true }
        }
    },
    // sis_hooks
    {
        name : SIS.SCHEMA_HOOKS,
        definition : {
            name : { type : "String", required : true, unique : true, match : /^[a-z0-9_]+$/ },
            target : {
                    type : {
                        url : { type : "String", required : true },
                        action : { type : "String", required : true, enum : ["GET", "POST", "PUT"]}
                    },
                    required : true
            },
            retry_count : { type : "Number", min : 0, max : 20, default : 0 },
            retry_delay : { type : "Number", min : 1, max : 60, default : 1 },
            events : { type : [{ type : "String", enum : SIS.EVENTS_ENUM }], required : true },
            owner : { type : ["String"] },
            entity_type : "String"
        }
    },
    // sis_hiera
    {
        name : SIS.SCHEMA_HIERA,
        definition : {
            name : { type : "String", required : true, unique : true },
            owner : { type : ["String"] },
            hieradata : { type : {}, required : true }
        }
    },
    // sis_commits
    {
        name : SIS.SCHEMA_COMMITS,
        definition : {
            type : "String",
            entity_id : "String",
            action : { type : "String", required : true, enum : SIS.EVENTS_ENUM},
            diff : "Mixed",
            old_value : "Mixed",
            date_modified : { type : "Number", "index" : true },
            modified_by : "String"
        },
        indexes : [
            { schema: 1, entity_id: 1 }
        ]
    },
    // sis_users
    {
        name : SIS.SCHEMA_USERS,
        definition : {
            name : { type : "String", required : true,  unique : true, match :  /^[a-z0-9_]+$/ },
            email : { type : "String", required : true,  match: /^([\w-\.]+@([\w-]+\.)+[\w-]{2,4})?$/ },
            verified : { type : "Boolean", default : false },
            super_user : { type : "Boolean", default : false },
            pw : { type : "String", required : true },
            roles : { type : {} }
        }
    },
    // sis_tokens
    {
        name : SIS.SCHEMA_TOKENS,
        definition : {
            name : { type : "String", unique : true },
            expires : { type : "Date", expires : SIS.AUTH_EXPIRATION_TIME },
            type : { type : "String", required : true, enum : SIS.AUTH_TYPES },
            ref : { "sis_services" : { "type" : "ObjectId", ref : SIS.SCHEMA_SERVICES },
                    "sis_users" : { "type" : "ObjectId", ref : SIS.SCHEMA_USERS }
                  }
        }
    },
    // sis_services
    {
        name : SIS.SCHEMA_SERVICES,
        definition : {
            name : { type : "String", required : true,  unique : true, match : /^[a-z0-9_]+$/ },
            desc : "String",
            creator : { type : "ObjectId", ref : SIS.SCHEMA_USERS },
            token : { type : "String", unique : true },
            roles : { type : {} }
        }
    }

];
