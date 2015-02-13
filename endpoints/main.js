'use strict';

var nconf = require('nconf');
var config = require('../config');
var BPromise = require("bluebird");
var mongoose = BPromise.promisifyAll(require("mongoose"));

var SIS = require("../util/constants");

nconf.defaults(config);

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
        d.resolve(schemaManager);
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
                var res = {
                    status : err.status || 500,
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


