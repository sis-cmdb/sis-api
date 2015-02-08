'use strict';

var ChildProcess = require("child_process");

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
    this.base = base + "/:id";
    // ensure the request is handled with a slash
    app.use(this.base + "/", this.handler.bind(this));
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
	type : "request",
	data : {
	    path : req.path,
	    method : req.method,
	    params : req.params,
	    body : req.body,
	    query : req.body,
	    headers : req.headers
	}
    };
    this.child.send(message);
};

EndpointController.prototype._spawnWorker = function() {
    this.child = ChildProcess.fork(__dirname + "/../endpoints/runner.js");
    this.childState = SPAWNING;
    this.child.on("message", function(msg) {
	var type = msg.type;
	var data = msg.data;
	if (type === "done") {
	    this.childState = IDLE;
	    var res = this.currentReq.res;
	    this.currentReq = null;
	    res.status(data.status);
	    res.set("Content-Type", data.mime);
	    res.send(data.data);
	    this._runNext();
	} else if (type === "ready") {
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

