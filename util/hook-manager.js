
// A class used to manage the SIS Hooks defined by the /hooks api
'use strict';

// node http lib
var http = require('http');
// simplified http req
var request = require('request');
var nconf = require('nconf');
var logger = require("./logger");

var SIS = require('./constants');
var Manager = require("./manager");
var BPromise = require("bluebird");

var LOGGER = logger.createLogger({
    name : "HookManager"
});


/////////////////////////////////
// Hook Manager
function HookManager(sm, opts) {
    var model = sm.getSisModel(SIS.SCHEMA_HOOKS);
    opts = opts || {};
    opts[SIS.OPT_USE_AUTH] = sm.authEnabled;
    Manager.call(this, model, opts);
    var hookRequestDefaults = nconf.get('hooks:request_defaults');
    if (hookRequestDefaults) {
        request = request.defaults(hookRequestDefaults);
    }
    this.sm = sm;
}

require('util').inherits(HookManager, Manager);

HookManager.prototype.validate = function(modelObj, toUpdate, options) {
    if (!modelObj) {
        return "No model defined.";
    }
    if(!modelObj.name) {
        return "Hook has no name.";
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
    return this.validateOwner(modelObj, options);
};
/////////////////////////////////

var sendRequest = function(options, retry_count, delay, d) {
    request(options, function(err, res) {
        LOGGER.debug({ options: options, res: res, err: err});

        if(err) {
            LOGGER.error({ options: options, err: err }, "Error Response from Outbound Hook Request");
        }
        if (err || !res || res.statusCode >= 300) {
            if (retry_count <= 0) {
                // done with error
                LOGGER.error({options: options, err: err},"Exhausted retries");
                return d.reject(SIS.ERR_INTERNAL(err));
            } else {
                // retry
                LOGGER.info({options: options, retry_count: retry_count, delay: delay},"Hook being retried");
                setTimeout(function() {
                    sendRequest(options, retry_count - 1, delay, d);
                }, delay * 1000);
            }
        } else {
            // success!
            LOGGER.info({options: options, code: res.statusCode},"Hook call successful");
            return d.resolve(res.body);
        }
    });
};

var dispatchHook = function(hook, entity, event, isBulk) {
    if (typeof entity.toObject === 'function') {
        entity = entity.toObject();
    }
    var data = {
        'hook' : hook.name,
        'entity_type' : hook.entity_type,
        'event' : event,
        'data' : entity,
        'is_bulk' : isBulk || false
    };
    if (event == SIS.EVENT_UPDATE && !isBulk) {
        // array of two
        data.data = entity[1];
        data.old_value = entity[0];
    }
    var options = {
        "uri" : hook.target.url,
        "method" : hook.target.action
    };
    if (options.method == 'GET') {
        data.data = JSON.stringify(entity);
        options.qs = {'data' : data};
    } else {
        options.json = data;
    }
    var d = BPromise.pending();
    sendRequest(options, hook.retry_count || 0, hook.retry_delay || 1, d);
    return d.promise;
};

// hook dispatching methods
HookManager.prototype.dispatchHooks = function(entity, entity_type, event, isBulk, callback) {
    if (!callback) {
        callback = function(err) {
            if (err) {
                LOGGER.error({ err: err }, "Error running hooks");
            }
        };
    }
    // find hooks that have the entity_type w/ the
    // event
    var query = {"entity_type" : entity_type, "events" :  event };
    this.model.find(query, null, { lean : true }, function(err, hooks) {
        if (err) {
            callback(SIS.ERR_NOT_FOUND(err), null);
        } else {
            var promises = hooks.map(function(hook) {
                return dispatchHook(hook, entity, event, isBulk);
            });
            BPromise.all(promises).then(function(res) {
                callback(null, res);
            }).catch(callback);
        }
    });
};

// force trigger
HookManager.prototype.triggerHooks = function(entityType, entityId, opts) {
    opts = opts || { };
    return this.sm.getEntityManager(entityType).bind(this)
    .then(function(mgr) {
        // get the entity by ID
        opts.lean = mgr.model.schema._sis_defaultpaths.length === 0;
        return mgr.getById(entityId);
    }).then(function(entity) {
        // trigger an update - which is an array of length 2
        // for old and new
        var obj = [entity, entity];
        this.dispatchHooks(obj, entityType, SIS.EVENT_UPDATE, false);
        return {
            message: "Hooks triggered successfully",
            type: entityType,
            entity: entity
        };
    });
};

module.exports = function(schemaManager, opts) {
    return new HookManager(schemaManager);
};
