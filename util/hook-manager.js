
// A class used to manage the SIS Hooks defined by the /hooks api
'use strict';

var qs = require('qs');
var nconf = require('nconf');
var logger = require("./logger");

var SIS = require('./constants');
var Manager = require("./manager");
var P = require("./promises");

var LOGGER = logger.createLogger({
    name : "HookManager"
});

// Defaults merged into every outbound hook request (was request.defaults(...)).
var requestDefaults = { };


/////////////////////////////////
// Hook Manager
function HookManager(sm, opts) {
    var model = sm.getSisModel(SIS.SCHEMA_HOOKS);
    opts = opts || {};
    opts[SIS.OPT_USE_AUTH] = sm.authEnabled;
    Manager.call(this, model, opts);
    var hookRequestDefaults = nconf.get('hooks:request_defaults');
    if (hookRequestDefaults) {
        requestDefaults = hookRequestDefaults;
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
    var fetchOpts = Object.assign({ }, requestDefaults, { method: options.method });
    fetchOpts.headers = Object.assign({ }, requestDefaults.headers, options.headers);
    if (options.body !== undefined) {
        fetchOpts.body = options.body;
    }
    fetch(options.url, fetchOpts).then(function(res) {
        if (res.status >= 300) {
            // non 2xx - treat as an error so the retry logic kicks in
            var httpErr = new Error("Hook target responded with status " + res.status);
            httpErr.statusCode = res.status;
            throw httpErr;
        }
        return res.text();
    }).then(function(body) {
        // success!
        d.resolve(body);
    }).catch(function(err) {
        LOGGER.error({ err: err }, "Error Response from Outbound Hook Request");
        if (retry_count <= 0) {
            // done with error
            LOGGER.error({ err: err }, "Exhausted retries");
            return d.reject(SIS.ERR_INTERNAL(err));
        }
        // retry
        setTimeout(function() {
            sendRequest(options, retry_count - 1, delay, d);
        }, delay * 1000);
    });
};

var dispatchHook = function(hook, entity, event, isBulk) {
    // This check will never be true
    if (typeof entity.toObject === 'function') {
        entity = entity.toObject();
        //LOGGER.error({entity:entity},"Got a function instead of an entity");
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
        "url" : hook.target.url,
        "method" : hook.target.action
    };
    if (options.method == 'GET') {
        data.data = JSON.stringify(entity);
        // serialize with qs so the nested object round-trips through the
        // receiver's query parser (which also uses qs), e.g. data[entity_type]=...
        var query = qs.stringify({ 'data' : data });
        options.url += (options.url.indexOf('?') === -1 ? '?' : '&') + query;
    } else {
        options.headers = { 'content-type' : 'application/json' };
        options.body = JSON.stringify(data);
        LOGGER.info({ payload: data }, "Hook payload: ");
    }
    var d = P.defer();
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
    Promise.resolve(this.model.find(query, null, { lean : true }).exec())
    .then(function(hooks) {
        var promises = hooks.map(function(hook) {
            return dispatchHook(hook, entity, event, isBulk);
        });
        return Promise.all(promises).then(function(res) {
            callback(null, res);
        });
    }).catch(function(err) {
        callback(SIS.ERR_NOT_FOUND(err), null);
    });
};

// force trigger
HookManager.prototype.triggerHooks = function(entityType, entityId, opts) {
    var self = this;
    opts = opts || { };
    return self.sm.getEntityManager(entityType)
    .then(function(mgr) {
        // get the entity by ID
        opts.lean = mgr.model.schema._sis_defaultpaths.length === 0;
        return mgr.getById(entityId);
    }).then(function(entity) {
        // trigger an update - which is an array of length 2
        // for old and new
        //LOGGER.info({entity: entity},"Dispatching hooks for "+entityType+" with id "+entityId);

        var obj = [entity, entity];
        self.dispatchHooks(obj, entityType, SIS.EVENT_UPDATE, false);
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
