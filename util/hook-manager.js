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
// A class used to manage the SIS Hooks defined by the /hooks api
// imports..
// node http lib
var http = require('http');
// async js for parallel hook exec
var async = require('async');
// simplified http req
var request = require('request');

(function() {

    var SIS = require('./constants');

    // Take in a schemaManager that's already been initialized.
    var HookManager = function(schemaManager) {

        // this..
        var self = this;

        this.historyManager = require('./history-manager')(schemaManager);

        // initializer funct
        var init = function() {
            self.model = schemaManager.getSisModel(SIS.SCHEMA_HOOKS);
        }

        // Get all the SIS Hooks in the system
        this.getAll = function(condition, options, callback) {
            self.model.find(condition, null, options, function(err, results) {
                if (err) {
                    return callback(SIS.ERR_INTERNAL(err), null);
                }
                callback(null, results);
            });
        }

        // Get a SIS Hook by name
        this.getByName = function(name, callback) {
            self.model.findOne({"name" : name}, function(err, result) {
                if (err || !result) {
                    return callback(SIS.ERR_INTERNAL_OR_NOT_FOUND(err, "schema", name), null);
                }
                callback(null, result);
            });
        }

        var validateHookObject = function(modelObj) {
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
            return null;
        }

        // Add a SIS Hook.  The modelObj must have the following properties:
        // - "name" : "Schema Name" - cannot be empty
        // - "target" : <json_object> that is a action and url.
        // - "owner" : String - Who owns this
        // - "entity_type" : String - What to fire on
        // - "on" : <json_array> - List of insert,update,delete.
        // -----------------------------------------------------------------
        this.addHook = function(modelObj, callback) {
            var err = validateHookObject(modelObj);
            if (err) {
                return callback(SIS.ERR_BAD_REQ(err), null);
            }
            // Valid schema, so now we can create a SIS Schema object to persist
            var entity = new self.model(modelObj);

            // TODO: need to cleanup the entity returned to callback
            entity.save(function(err, result) {
                callback(SIS.ERR_INTERNAL(err), result);
            });
        }

        // Update an object schema
        this.updateHook = function(sisHook, callback) {
            var err = validateHookObject(sisHook);
            if (err) {
                return callback(SIS.ERR_BAD_REQ(err), null);
            }
            self.model.findOne({name : sisHook.name}, function(err, hookDoc) {
                if (err || !hookDoc) {
                    return callback(SIS.ERR_INTERNAL_OR_NOT_FOUND(err, "hook", sisHook.name), null);
                }
                var oldHook = hookDoc.toObject();
                hookDoc.set(sisHook);
                hookDoc.save(function(err, result) {
                    callback(SIS.ERR_INTERNAL(err), result, oldHook);
                });
            });
        }

        // Delete a hook by name.
        this.deleteHook = function(name, callback) {
            self.model.findOne({"name": name}, function(err, result) {
                if (err || !result) {
                    callback(SIS.ERR_INTERNAL_OR_NOT_FOUND(err, "hook", name), false);
                } else {
                    result.remove(function(err) {
                        return callback(SIS.ERR_INTERNAL(err), result);
                    });
                }
            });
        }

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
                        }, delay * 1000)
                    }
                } else {
                    // success!
                    return callback(null, res.body);
                }
            });
        }

        var dispatchHook = function(hook, entity, event, callback) {
            if (typeof entity['toObject'] == 'function') {
                entity = entity.toObject();
            }
            var data = {
                'hook' : hook.name,
                'entity_type' : hook.entity_type,
                'event' : event,
                'data' : entity
            };
            var options = {
                "uri" : hook.target.url,
                "method" : hook.target.action,
            };
            if (options['method'] == 'GET') {
                data['data'] = JSON.stringify(entity);
                options['qs'] = {'data' : data};
            } else {
                options['json'] = data;
            }
            sendRequest(options, hook.retry_count || 0, hook.retry_delay || 1, callback);
        }

        // hook dispatching methods
        this.dispatchHooks = function(entity, entity_type, event, callback) {
            if (!callback) {
                callback = function(err) {
                    if (err) {
                        console.log("Error running hooks " + err);
                    }
                }
            }
            // find hooks that have the entity_type w/ the
            // event
            var query = {"entity_type" : entity_type, "events" :  event };
            self.model.find(query, function(err, hooks) {
                if (err) {
                    callback(SIS.ERR_NOT_FOUND(err), null);
                } else {
                    async.map(hooks, function(hook, cb) {
                        dispatchHook(hook, entity, event, cb);
                    }, callback);
                }
            });
        }

        init();
    }

    module.exports = function(schemaManager) {
        return new HookManager(schemaManager);
    }

})();
