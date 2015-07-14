'use strict';

var nconf = require('nconf');
var BPromise = require("bluebird");
var vm = require("vm");
var SIS = require("../util/constants");
var clone = require("clone");
var LOGGER = require("../util/logger").createLogger({
    name : "ScriptRunner"
});


function ScriptRunner(schemaManager) {
    this.schemaManager = schemaManager;
    this.manager = require("../util/script-manager")(schemaManager);
    this.hieraManager = require("../util/hiera-manager")(schemaManager);
    this.scriptCache = { };
}

ScriptRunner.prototype._getScript = function(name) {
    return this.manager.getById(name, { lean : true })
    .bind(this).then(function(scriptObj) {
        var scriptText = scriptObj.script;
        LOGGER.info("have script", { script: scriptText });
        var cached = this.scriptCache[name];
        var scriptTime = scriptObj._sis._updated_at;
        var compiled = null;
        if (!cached) {
            compiled = new vm.Script(scriptText, { filename: name });
            this.scriptCache[name] = {
                script : compiled,
                time : scriptTime
            };
            return compiled;
        } else {
            if (scriptObj._sis._updated_at > cached.time) {
                compiled = new vm.Script(scriptText, { filename: name });
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

// internal holder to ensure the script finishes before sending out
// a response
function ResponseHolder(defer) {
    this.response = null;
    this.defer = defer;
}
ResponseHolder.prototype.setResponse = function(response) {
    this.response = response;
    this.defer.resolve(this);
};

// helper function to run a generator of promises
function async(gen) {
    // result = IteratorResult
    function handleResult(result) {
        if (result.done) { return result.value; }
        // wait for the promise to resolve before continuing
        return result.value.then(function(promiseResult) {
            // pass the promise result to the caller (doThing)
            return handleResult(gen.next(promiseResult));
        }, function(error) {
            // allows for try catch in the caller!
            return handleResult(gen.throw(error));
        });
    }
    return handleResult(gen.next());
}


ScriptRunner.prototype._createContext = function(holder, req) {
    var ctx = {
        client : new ApiClient(this.schemaManager, this.hieraManager),
        res : new ApiResponse(holder),
        req : req,
        BPromise : BPromise,
        csv : require('csv'),
        yaml : require('js-yaml'),
        async : async
    };
    return vm.createContext(clone(ctx));
};

ScriptRunner.prototype.handleRequest = function(req) {
    var endpoint = req.endpoint;
    return this._getScript(endpoint).bind(this)
    .then(function(script) {
        var defer = BPromise.pending();
        var holder = new ResponseHolder(defer);
        var ctx = this._createContext(holder, req);
        script.runInNewContext(ctx);
        return defer.promise;
    })
    .then(function(holder) {
        return holder.response;
    })
    .catch(function(err) {
        if (Array.isArray(err)) {
            return BPromise.reject(err);
        }
        var str = err + "";
        if (err.stack) {
            str += " : " + err.stack;
        }
        err = SIS.ERR_INTERNAL(str);
        return BPromise.reject(err);
    });
};

module.exports = ScriptRunner;
