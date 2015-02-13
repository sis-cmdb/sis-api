'use strict';

var ChildProcess = require("child_process");
var express = require("express");
var SIS = require("../util/constants");

// child states
var IDLE = 0,
    DEAD = 1,
    SPAWNING = 2,
    BUSY = 3;

/////////////////////////////////
// Endpoint controller
// - Note that this runs in the main process
function EndpointController(config) {
    // need to spawn child proc
    this.child = null;
    this.childState = DEAD;
    this.currentReq = null;
    this.requestQueue = [];
}

EndpointController.prototype.attach = function(app, base) {
    this._spawnWorker();
    this.base = base;
    // ensure the request is handled with a slash
    var router = express.Router({ strict : true });
    router.use("/:id/", this.handler.bind(this));
    app.use(base, router);
};

EndpointController.prototype.handler = function(req, res) {
    this.requestQueue.push({ req : req, res : res });
    this._runNext();
};

EndpointController.prototype._runNext = function() {
    if (!this.requestQueue.length || this.childState !== IDLE) {
        return;
    }
    this.childState = BUSY;
    this.currentReq = this.requestQueue.pop();
    var req = this.currentReq.req;
    var message = {
        type : SIS.EP_REQ,
        data : {
            path : req.path,
            endpoint : req.params.id,
            method : req.method,
            body : req.body,
            query : req.query,
            headers : req.headers
        }
    };
    this.child.send(message);
};

EndpointController.prototype._spawnWorker = function() {
    this.child = ChildProcess.fork(__dirname + "/../endpoints/main.js");
    this.childState = SPAWNING;
    this.child.on("message", function(msg) {
        var type = msg.type;
        var data = msg.data;
        if (type === SIS.EP_DONE) {
            this.childState = IDLE;
            var res = this.currentReq.res;
            this.currentReq = null;
            res.status(data.status);
            res.set(data.headers);
            res.send(data.data);
            this._runNext();
        } else if (type === SIS.EP_READY) {
            this.childState = IDLE;
            this._runNext();
        }
    }.bind(this));
};

/////////////////////////////////

// all route controllers expose a setup method
module.exports.setup = function(app, config) {
    var controller = new EndpointController(config);
    controller.attach(app, "/api/v1.1/endpoints");
};

