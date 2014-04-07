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

// A class used to manage the SIS Hooks defined by the /hooks api
(function() {
    'use strict';
    // node http lib
    var http = require('http');
    // async js for parallel hook exec
    var async = require('async');
    // simplified http req
    var request = require('request');


    var SIS = require('./constants');
    var Manager = require("./manager");

    /////////////////////////////////
    // Hook Manager
    function HookManager(sm, opts) {
        var model = sm.getSisModel(SIS.SCHEMA_HOOKS);
        opts = opts || {};
        opts[SIS.OPT_USE_AUTH] = sm.authEnabled;
        Manager.call(this, model, opts);
    }

    require('util').inherits(HookManager, Manager);

    HookManager.prototype.validate = function(modelObj, isUpdate) {
        if (!modelObj) {
            return "No model defined.";
        }
        if(!modelObj.name) {
            return "Hook has no name.";
        }
        if(!modelObj.owner) {
            return "Hook has no owner.";
        }
        if(!modelObj.entity_type) {
            return "Hook has no entity_type.";
        }
        if(!modelObj.target) {
            return "Hook has no target.";
        }
        if(!modelObj.target.url) {
            return "Hook target has no url.";
        }
        if(!modelObj.target.action) {
            return "Hook target has no action.";
        }
        if(!modelObj.events) {
            return "Hook has no on parameter.";
        }
        if(!modelObj.events.length) {
            return "Hook on parameter has no values.";
        }
        return this.validateOwner(modelObj);
    };
    /////////////////////////////////

    var sendRequest = function(options, retry_count, delay, callback) {
        request(options, function(err, res) {
            if (err || !res || res.statusCode >= 300) {
                if (retry_count <= 0) {
                    // done with error
                    return callback(SIS.ERR_INTERNAL(err), null);
                } else {
                    // retry
                    setTimeout(function() {
                        sendRequest(options, retry_count - 1, delay, callback);
                    }, delay * 1000);
                }
            } else {
                // success!
                return callback(null, res.body);
            }
        });
    };

    var dispatchHook = function(hook, entity, event, callback) {
        if (typeof entity.toObject === 'function') {
            entity = entity.toObject();
        }
        var data = {
            'hook' : hook.name,
            'entity_type' : hook.entity_type,
            'event' : event,
            'data' : entity
        };
        if (event == SIS.EVENT_UPDATE) {
            // array of two
            data.data = entity[1];
            data.old_value = entity[0];
        }
        var options = {
            "uri" : hook.target.url,
            "method" : hook.target.action,
        };
        if (options.method == 'GET') {
            data.data = JSON.stringify(entity);
            options.qs = {'data' : data};
        } else {
            options.json = data;
        }
        sendRequest(options, hook.retry_count || 0, hook.retry_delay || 1, callback);
    };

    // hook dispatching methods
    HookManager.prototype.dispatchHooks = function(entity, entity_type, event, callback) {
        if (!callback) {
            callback = function(err) {
                if (err) {
                    console.log("Error running hooks " + err);
                }
            };
        }
        // find hooks that have the entity_type w/ the
        // event
        var query = {"entity_type" : entity_type, "events" :  event };
        this.model.find(query, function(err, hooks) {
            if (err) {
                callback(SIS.ERR_NOT_FOUND(err), null);
            } else {
                async.map(hooks, function(hook, cb) {
                    dispatchHook(hook, entity, event, cb);
                }, callback);
            }
        });
    };

    module.exports = function(schemaManager, opts) {
        return new HookManager(schemaManager);
    };

})();
