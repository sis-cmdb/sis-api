"use strict";

// Test-only compatibility shim.
//
// SIS managers used to return bluebird promises, and the test suite leans on
// bluebird's `.nodeify(cb)` to bridge those promises to mocha's `done`
// callbacks. The managers now return native promises; this restores `.nodeify`
// for the existing tests. Production code does NOT use this - it is loaded only
// by the mocha harness (see .mocharc.yml).
if (!Promise.prototype.nodeify) {
    Object.defineProperty(Promise.prototype, "nodeify", {
        value: function(cb) {
            if (typeof cb !== "function") { return this; }
            this.then(function(r) { cb(null, r); }, function(e) { cb(e); });
            return this;
        },
        writable: true,
        configurable: true
    });
}

// bluebird's .done(onFulfilled, onRejected) ran the handlers and surfaced any
// resulting error as an uncaught exception (so mocha fails rather than hangs).
if (!Promise.prototype.done) {
    Object.defineProperty(Promise.prototype, "done", {
        value: function(onFulfilled, onRejected) {
            this.then(onFulfilled, onRejected).then(null, function(err) {
                setTimeout(function() { throw err; }, 0);
            });
        },
        writable: true,
        configurable: true
    });
}
