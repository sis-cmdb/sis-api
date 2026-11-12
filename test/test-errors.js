describe('Error responses', function() {
    "use strict";

    var should = require('should');
    var SIS = require("../util/constants");

    // runs fn, capturing what it logs (bunyan writes to stdout); returns
    // [fn's result, the log records]
    function capturingLog(fn) {
        var write = process.stdout.write;
        var lines = [];
        process.stdout.write = function(chunk) {
            lines.push(String(chunk));
            return true;
        };
        try {
            var result = fn();
            return [result, lines.join("").split("\n").filter(Boolean).map(JSON.parse)];
        } finally {
            process.stdout.write = write;
        }
    }

    describe("ERR_INTERNAL", function() {
        it("Should send the error's name and message, and log its stack", function() {
            var err = new TypeError("boom");
            var captured = capturingLog(function() { return SIS.ERR_INTERNAL(err); });
            var result = captured[0];
            result[0].should.eql(500);
            result[1].should.eql({ error : "Internal error TypeError: boom", code : 1002 });
            result[2].should.equal(err);
            captured[1].length.should.eql(1);
            captured[1][0].err.stack.should.match(/TypeError: boom\n\s+at /);
        });

        it("Should keep string messages", function() {
            var result = capturingLog(function() { return SIS.ERR_INTERNAL("disk full"); })[0];
            result[1].should.eql({ error : "Internal error disk full", code : 1002 });
            should.not.exist(SIS.ERR_INTERNAL(null));
        });

        it("Should turn a duplicate key error into a 409 naming the value", function() {
            var err = new Error("E11000 duplicate key error collection: db.hosts index: host_1 dup key: { host: \"web1\" }");
            err.name = "MongoServerError";
            err.code = 11000;
            err.keyValue = { host : "web1" };
            var captured = capturingLog(function() { return SIS.ERR_INTERNAL(err); });
            captured[0].should.eql([409, { error : "Conflict: host \"web1\" already exists", code : 1005 }]);
            // a conflict is the client's mistake, not an error of the server
            captured[1].should.eql([]);
        });

        it("Should describe duplicates of compound keys and bulk writes", function() {
            var compound = { code : 11000, keyValue : { a : 1, b : "x" } };
            SIS.ERR_INTERNAL(compound)[1].error.should.eql("Conflict: a 1, b \"x\" already exists");
            var bulk = { name : "MongoBulkWriteError", code : 11000, writeErrors : [{ err : { keyValue : { name : "n" } } }] };
            SIS.ERR_INTERNAL(bulk)[1].error.should.eql("Conflict: name \"n\" already exists");
            var unknown = { code : 11001 };
            SIS.ERR_INTERNAL(unknown)[1].error.should.eql("Conflict: an object with the same unique value already exists");
        });

        it("Should keep reporting validation errors as bad data", function() {
            var err = { name : "ValidationError", toString : function() { return "ValidationError: host required"; } };
            SIS.ERR_INTERNAL(err)[0].should.eql(400);
        });
    });
});
