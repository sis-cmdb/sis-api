'use strict';

var ChildProcess = require("child_process");
var express = require("express");
var Pool = require("generic-pool");
var BPromise = require("bluebird");
var nconf = require("nconf");
var logger = require("../util/logger");

var WORKER_LOGGER = logger.createLogger({ name:"EndpointWorker" });
var LOGGER = logger.createLogger({ name : "EndpointController" });

var SIS = require("../util/constants");
// child states
var IDLE = 0,
    DEAD = 1,
    SPAWNING = 2,
    BUSY = 3,
    ERROR = 4,
    DESTROYED = 5,
    TIMEDOUT = 6;

// small wrapper around the sandbox process
// takes in a pending defer and resolves it
// when done or should be killed
function EndpointWorker(errHandler) {
    this.childproc = null;
    this.childState = DEAD;
    this.errHandler = errHandler;

    // request being handled and callback
    // set per request
    this.currentReq = null;
    this.defer = null;
    this.reqTimer = null;
}

// called when a worker needs to be created
EndpointWorker.prototype.create = function() {
    if (this.childState !== DEAD) {
        return BPromise.reject({ error: "Process is in invalid state: " + this.childState });
    }
    var createDefer = BPromise.pending();
    this.childState = SPAWNING;
    this.child = ChildProcess.fork(__dirname + "/../endpoints/main.js");
    // set a timeout - no message back in 5 seconds is bad
    var timer = setTimeout(function() {
        this.childState = ERROR;
        this.destroy();
        LOGGER.error("Failed to spawn child within 5 seconds");
        createDefer.reject({ error : "Failed to spawn within 5 seconds" });
    }.bind(this), 5000);
    this.child.on("message", function(msg) {
        var type = msg.type;
        var data = msg.data;
        if (type === SIS.EP_DONE) {
            if (this.childState === BUSY) {
                this.childState = IDLE;
                clearTimeout(this.reqTimer);
                this.reqTimer = null;
                // send it back up to the master
                this.defer.resolve(data);
            } else if (this.childState === TIMEDOUT) {
                // ignore - the request already timed out
            }
        } else if (type === SIS.EP_READY && this.childState === SPAWNING) {
            this.childState = IDLE;
            clearTimeout(timer);
            createDefer.resolve(this);
            LOGGER.debug({pid : this.child.pid}, "Spawned worker process");
        } else {
            // unexpected state
            WORKER_LOGGER.error({ message: "Received unexpected message.",
                                  data: msg,
                                  state: this.childState
                                });
            var state = this.childState;
            this.childState = ERROR;
            if (state === SPAWNING) {
                clearTimeout(timer);
                this.destroy();
                createDefer.reject({ error : "Failed to spawn within 5 seconds" });
            } else if (state === BUSY) {
                WORKER_LOGGER.error("Unexpected message while busy");
                // message during a request
                this.defer.reject({ error : "Unexpected message received. "});
            } else {
                // inform parent we should be cleaned up and removed from pool
                this.errHandler(this);
                // err handler will call destroy
            }
        }
    }.bind(this));
    return createDefer.promise;
};

EndpointWorker.prototype.handleRequest = function(request) {
    if (this.childState !== IDLE) {
        return BPromise.reject({ error : "Worker is busy", status : 500 });
    }
    this.currentReq = request;
    this.defer = BPromise.pending();
    this.childState = BUSY;
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
    var self = this;
    this.reqTimer = setTimeout(function() {
        self.childState = TIMEDOUT;
        self.defer.reject({ error : "Request timed out", status : 500 });
    }, 10000);
    return this.defer.promise;
};

EndpointWorker.prototype.destroy = function() {
    // kill proc
    if (this.childState !== DESTROYED) {
        this.childState = DESTROYED;
        clearTimeout(this.reqTimer);
        this.child.kill("SIGKILL");
    }
};

/////////////////////////////////
// Endpoint controller
// - Note that this runs in the main process
function EndpointController(config) {
    this.requestQueue = [];
    var self = this;
    function errHandler(worker) {
        self.workerPool.destroy(worker);
    }
    // create the pool of workers
    this.workerPool = Pool.Pool({
        name : "EndpointWorkers",
        create : function(callback) {
            var worker = new EndpointWorker(errHandler);
            return worker.create().then(function(worker) {
                callback(null, worker);
            }).catch(function(err) {
                LOGGER.error(err);
                callback(err);
            });
        },
        destroy : function(worker) {
            if (!worker.destroy) {
                LOGGER.error(worker);
            } else {
                worker.destroy();
            }
        },
        min : nconf.get("app:scripts_min") || 1,
        max : nconf.get("app:scripts_max") || 2,
        idleTimeoutMillis : nconf.get("app:script_worker_idle_time_ms") || 300000,
        log : function(msg, level) {
            // level is one of 'verbose', 'warn', 'info', 'error'
            if (level === 'verbose') { level = 'trace'; }
            if (typeof LOGGER[level] === 'function') {
                LOGGER[level](msg);
            }
        }
    });
}


EndpointController.prototype.attach = function(app, base) {
    this.base = base;
    // ensure the request is handled with a slash
    var router = express.Router({ strict : true });
    router.use("/:id/", this.handler.bind(this));
    app.use(base, router);
    var self = this;
    app.locals.closeListeners.push(function() {
        LOGGER.info("Draining pool");
        self.workerPool.drain(function() {
            self.workerPool.destroyAllNow();
        });
    });
};

EndpointController.prototype.handler = function(req, res) {
    this.requestQueue.push({ req : req, res : res });
    this._runNext();
};

EndpointController.prototype._runNext = function() {
    if (!this.requestQueue.length) {
        return;
    }
    var req = this.requestQueue.pop();
    var res = req.res;
    var self = this;
    this.workerPool.acquire(function(err, worker) {
        if (err) {
            res.status(500).json({ error : "Unable to run script.  Internal error", status : 500 });
            self.workerPool.destroy(worker);
        } else {
            var p = worker.handleRequest(req);
            p.then(function(data) {
                res.status(data.status);
                res.set(data.headers);
                res.send(data.data);
                self.workerPool.release(worker);
            }).catch(function(err) {
                if (err instanceof Error) {
                    LOGGER.error({ err: err }, "Endpoint caught an error");
                    err = {
                        status : 500,
                        error : err + ": " + err.stack
                    };
                }
                // timeout or exception
                // errors from the script should be sent properly
                res.status(500).json(err);
                // always destroy badness - let the pool spin up another
                self.workerPool.destroy(worker);
            });
        }
    });
};

/////////////////////////////////

// all route controllers expose a setup method
module.exports.setup = function(app, config) {
    if (!nconf.get('app:scripts_enabled')) {
        return;
    }
    var controller = new EndpointController(config);
    controller.attach(app, "/api/v1.1/endpoints");
};
