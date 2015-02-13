'use strict';

var nconf = require('nconf');
var BPromise = require("bluebird");
var vm = require("vm");
var SIS = require("../util/constants");
var clone = require("clone");

function ScriptRunner(schemaManager) {
    this.schemaManager = schemaManager;
    this.manager = require("../util/script-manager")(schemaManager);
    this.scriptCache = { };
}

ScriptRunner.prototype._getScript = function(name) {
    return this.manager.getById(name, { lean : true })
    .bind(this).then(function(scriptObj) {
        var scriptText = scriptObj.script;
        var cached = this.scriptCache[name];
        var scriptTime = scriptObj._sis._updated_at;
        var compiled = null;
        if (!cached) {
            compiled = vm.createScript(scriptText, name);
            this.scriptCache[name] = {
                script : compiled,
                time : scriptTime
            };
            return compiled;
        } else {
            if (scriptObj._sis._updated_at > cached.time) {
                compiled = vm.createScript(scriptText, name);
                cached.script = compiled;
                cached.time = scriptTime;
            }
            return cached.script;
        }
    });
};

// context apis
var ApiClient = require("./api-client");
var ApiResponse = require("./api-response");
ScriptRunner.prototype._createContext = function(d, req) {
    var ctx = {
        client : new ApiClient(this.schemaManager),
        res : new ApiResponse(d),
        req : req,
        BPromise : BPromise,
        csv : require('csv')
    };
    return vm.createContext(clone(ctx));
};

var TIMEOUT_ERROR = { };

ScriptRunner.prototype.handleRequest = function(req) {
    var endpoint = req.endpoint;
    return this._getScript(endpoint).bind(this)
    .then(function(script) {
        var d = BPromise.pending();
        var ctx = this._createContext(d, req);
        script.runInNewContext(ctx);
        return BPromise.any([d.promise, BPromise.delay(TIMEOUT_ERROR, 60000)]);
    })
    .then(function(result) {
        if (result === TIMEOUT_ERROR) {
            return {
                status : 500,
                data : JSON.stringify({ error : "Request timed out" }),
                headers : { "Content-Type" : "application/json" }
            };
        }
        return result;
    })
    .catch(function(err) {
        var str = err + "";
        console.log(err.stack);
        return BPromise.reject({ err : str, status : 500 });
    });
};

module.exports = ScriptRunner;
