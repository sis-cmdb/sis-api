
'use strict';

var SIS = require('./constants');

var sisMetaDef = { };
sisMetaDef[SIS.FIELD_CREATED_AT] = { "type" : "Number" };
sisMetaDef[SIS.FIELD_UPDATED_AT] = { "type" : "Number" };
sisMetaDef[SIS.FIELD_CREATED_BY] = { "type" : "String" };
sisMetaDef[SIS.FIELD_UPDATED_BY] = { "type" : "String" };
sisMetaDef[SIS.FIELD_LOCKED] = { type : "Boolean", required : true, "default" : false };
sisMetaDef[SIS.FIELD_IMMUTABLE] = { type : "Boolean", "default" : false };
sisMetaDef[SIS.FIELD_TAGS] = { type: ["String"], index: true };
sisMetaDef[SIS.FIELD_SIS_VERSION] = "String";


// meta fields
module.exports.metaDef = sisMetaDef;

// schema definitions
module.exports.schemas = [
    // sis_schemas
    {
        name : SIS.SCHEMA_SCHEMAS,
        definition : {
            name : { type : "String", required : true, unique : true, match : /^[a-z0-9_]+$/ },
            description : { type : "String" },
            definition : { type : {}, required : true },
            locked_fields : { type : ["String"] },
            track_history : { type : "Boolean", default : true },
            is_open : { type : "Boolean", default : false },
            id_field : { type : "String", default : "_id" },
            is_public : { type : "Boolean", default : false },
            any_owner_can_modify : { type : "Boolean", default : false },
            // sis meta
            _sis : {
                owner : { type : ["String"], required : true },
                _references : ["String"]
            }
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
            retry_count : { type : "Number", min : 0, max : 20, "default" : 0 },
            retry_delay : { type : "Number", min : 1, max : 60, "default" : 1 },
            events : { type : [{ type : "String", enum : SIS.EVENTS_ENUM }], required : true },
            entity_type : { type: "String", required: true },
            // sis meta
            _sis : {
                owner : { type : ["String"], required : true }
            }
        }
    },
    // sis_hiera
    {
        name : SIS.SCHEMA_HIERA,
        definition : {
            name : { type : "String", required : true, unique : true },
            hieradata : { type : {}, required : true },
            // sis meta
            _sis : {
                owner : { type : ["String"], required : true }
            }
        }
    },
    // sis_commits
    {
        name : SIS.SCHEMA_COMMITS,
        definition : {
            type : { required : true, type : "String" },
            entity_id : { required : true, type : "String" },
            entity_oid : { required : true, type : "String" },
            action : { type : "String", required : true, enum : SIS.EVENTS_ENUM},
            commit_data : "Mixed",
            date_modified : { type : "Number", "index" : true },
            modified_by : "String"
        },
        indexes : [
            { type: 1, entity_id: 1 }
        ],
        ignored_meta : [
            SIS.FIELD_TAGS,
            SIS.FIELD_IMMUTABLE,
            SIS.FIELD_LOCKED
        ]
    },
    // sis_users
    {
        name : SIS.SCHEMA_USERS,
        definition : {
            name : { type : "String", required : true,  unique : true, match :  /^[a-z0-9_\-]+$/ },
            email : { type : "String", required : true,  match: /^([\w-\.]+@([\w-]+\.)+[\w-]{2,4})?$/ },
            verified : { type : "Boolean", "default" : false },
            super_user : { type : "Boolean", "default" : false },
            pw : { type : "String" },
            roles : { type : {}, "default" : { } }
        }
    },
    // sis_tokens
    {
        name : SIS.SCHEMA_TOKENS,
        definition : {
            // the token itself
            name : { type : "String", unique : true },
            desc : "String",
            expires : { type : "Date", expires : 0 },
            username : { type: "String", required : true }
        }
    },
    // sis_scripts
    {
        name : SIS.SCHEMA_SCRIPTS,
        definition : {
            // the script name
            name : { type : "String", required : true,  unique : true, match :  /^[a-z0-9_\-]+$/ },
            description : { type : "String" },
            script_type : { type: "String", required : true, enum : ["application/javascript"] },
            script : { type: "String", code : true, code_type_field : "script_type" },
            // sis meta
            _sis : {
                owner : { type : ["String"], required : true }
            }
        }
    }

];
