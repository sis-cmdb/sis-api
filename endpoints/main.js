// The script runner child process entry point

'use strict';

var nconf = require('nconf');
var config = require('../config');
var BPromise = require("bluebird");
var mongoose = BPromise.promisifyAll(require("mongoose"));
var SIS = require("../util/constants");

if (process.env.TESTING) {
    nconf.env("__")
        .argv()
        .file("config.test.json", __dirname + "/../test/fixtures/config.test.json");
} else {
    nconf.env('__')
        .argv()
        .file("config.json.local", __dirname + "/../conf/config.json.local")
        .file("config.json", __dirname + "/../conf/config.json");
}


function sendResponse(res) {
    process.send({
        type : SIS.EP_DONE,
        data : res
    });
}

var opts = nconf.get('db').opts || { };
mongoose.connectAsync(nconf.get('db').url, opts)
.then(function() {
    var appConfig = nconf.get('app') || { };
    var schemaManager = require('../util/schema-manager')(mongoose, appConfig);
    var d = BPromise.pending();
    schemaManager.bootstrapEntitySchemas(function(err) {
        if (err) { return d.reject(err); }
        return d.resolve(schemaManager);
    });
    return d.promise;
}).then(function(schemaManager) {
    var ScriptRunner = require('./runner');
    var runner = new ScriptRunner(schemaManager);
    process.on("message", function(msg) {
        var type = msg.type;
        var data = msg.data;
        if (type === SIS.EP_REQ) {
            runner.handleRequest(data)
            .then(function(res) {
                sendResponse(res);
            }).catch(function(err) {
                var status = err.status || 500;
                if (Array.isArray(err)) {
                    status = err[0];
                    err = err[1];
                }
                var res = {
                    status : status,
                    data : JSON.stringify(err),
                    headers : { "Content-Type" : "application/json" }
                };
                sendResponse(res);
            });
        }
    });
    process.send({ type : SIS.EP_READY });
}).catch(function(err) {
    console.log(err);
    process.send({ type : SIS.EP_ERROR, data : err });
});

// need to also register the disconnect handler
process.on("disconnect", function() {
    // this is not ok.
    process.exit(1);
});
