describe('@API @V1.1API - Unique fields', function() {
    "use strict";

    var should = require('should');

    var TestUtil = require('../fixtures/util');

    var ApiServer = new TestUtil.TestServer();

    function uniqueSchema(name) {
        return {
            name : name,
            _sis : { owner : ["sistest"] },
            definition : {
                host : { type : "String", required : true, unique : true }
            }
        };
    }

    // the response of a write rejected because a unique value is taken
    function shouldBeConflict(res, field, value) {
        res.body.should.eql({
            error : "Conflict: " + field + " " + JSON.stringify(value) + " already exists",
            code : 1005
        });
    }

    before(function(done) {
        ApiServer.start(function(e) {
            if (e) { return done(e); }
            ApiServer.becomeSuperUser(done);
        });
    });

    after(function(done) {
        ApiServer.stop(done);
    });

    describe("conflicts", function() {
        var name = "test_unique_conflicts";
        var other = null;

        before(function() {
            return ApiServer.del("/api/v1.1/schemas/" + name).endAsync().then(function() {
                return ApiServer.post("/api/v1.1/schemas").send(uniqueSchema(name)).expectAsync(201);
            }).then(function() {
                return ApiServer.post("/api/v1.1/entities/" + name).send({ host : "taken" }).expectAsync(201);
            }).then(function() {
                return ApiServer.post("/api/v1.1/entities/" + name).send({ host : "free" }).expectAsync(201);
            }).then(function(res) {
                other = res.body;
            });
        });

        after(function() {
            return ApiServer.del("/api/v1.1/schemas/" + name).endAsync();
        });

        it("Should reject adding a taken value with 409", function() {
            return ApiServer.post("/api/v1.1/entities/" + name).send({ host : "taken" }).expectAsync(409)
            .then(function(res) {
                shouldBeConflict(res, "host", "taken");
            });
        });

        it("Should reject changing a value to a taken one with 409", function() {
            return ApiServer.put("/api/v1.1/entities/" + name + "/" + other._id).send({ host : "taken" })
            .expectAsync(409).then(function(res) {
                shouldBeConflict(res, "host", "taken");
            });
        });

        it("Should reject a schema with a taken name with 409", function() {
            var dupe = uniqueSchema(name);
            dupe.definition = { a : "String" };
            return ApiServer.post("/api/v1.1/schemas").send(dupe).expectAsync(409).then(function(res) {
                shouldBeConflict(res, "name", name);
            });
        });

        it("Should not send internal details such as a stack trace", function() {
            return ApiServer.post("/api/v1.1/entities/" + name).send({ host : "taken" }).expectAsync(409)
            .then(function(res) {
                res.text.should.not.match(/\n\s+at /);
                res.text.should.not.match(/node_modules|MongoServerError|E11000/);
            });
        });
    });

    // Mongoose builds the indexes of a new schema in the background; writes
    // must not get ahead of the unique index (a duplicate written first even
    // keeps the index from being built).
    describe("writes right after a schema is created", function() {
        var names = [];

        after(function() {
            return Promise.all(names.map(function(n) {
                return ApiServer.del("/api/v1.1/schemas/" + n).endAsync();
            }));
        });

        function createSchema(n) {
            names.push(n);
            return ApiServer.del("/api/v1.1/schemas/" + n).endAsync().then(function() {
                return ApiServer.post("/api/v1.1/schemas").send(uniqueSchema(n)).expectAsync(201);
            });
        }

        function countHosts(n, host) {
            var q = encodeURIComponent(JSON.stringify({ host : host }));
            return ApiServer.get("/api/v1.1/entities/" + n + "?q=" + q).expectAsync(200).then(function(res) {
                return res.body.length;
            });
        }

        it("Should reject a duplicate written right after the first", function() {
            var tries = [];
            for (var i = 0; i < 10; ++i) {
                tries.push("test_unique_seq_" + i);
            }
            return tries.reduce(function(prev, n) {
                return prev.then(function() {
                    return createSchema(n);
                }).then(function() {
                    return ApiServer.post("/api/v1.1/entities/" + n).send({ host : "same" }).expectAsync(201);
                }).then(function() {
                    return ApiServer.post("/api/v1.1/entities/" + n).send({ host : "same" }).expectAsync(409);
                }).then(function() {
                    return countHosts(n, "same");
                }).then(function(count) {
                    count.should.eql(1);
                });
            }, Promise.resolve());
        });

        it("Should accept exactly one of simultaneous writes of the same value", function() {
            var n = "test_unique_parallel";
            return createSchema(n).then(function() {
                return Promise.all([1, 2, 3, 4].map(function() {
                    return ApiServer.post("/api/v1.1/entities/" + n).send({ host : "same" }).endAsync();
                }));
            }).then(function(responses) {
                responses.map(function(r) { return r.status; }).sort().should.eql([201, 409, 409, 409]);
                return countHosts(n, "same");
            }).then(function(count) {
                count.should.eql(1);
            });
        });

        it("Should enforce the unique index on a field made unique by an update", function() {
            var n = "test_unique_update";
            var schema = uniqueSchema(n);
            schema.definition = { host : "String" };
            names.push(n);
            return ApiServer.del("/api/v1.1/schemas/" + n).endAsync().then(function() {
                return ApiServer.post("/api/v1.1/schemas").send(schema).expectAsync(201);
            }).then(function() {
                schema.definition = { host : { type : "String", unique : true } };
                return ApiServer.put("/api/v1.1/schemas/" + n).send(schema).expectAsync(200);
            }).then(function() {
                return ApiServer.post("/api/v1.1/entities/" + n).send({ host : "same" }).expectAsync(201);
            }).then(function() {
                return ApiServer.post("/api/v1.1/entities/" + n).send({ host : "same" }).expectAsync(409);
            });
        });
    });
});
