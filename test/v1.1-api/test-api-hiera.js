describe('@API @V1.1API - Hiera API', function() {
    "use strict";

    var should = require('should');

    var SIS = require("../../util/constants");

    var TestUtil = require('../fixtures/util');

    var ApiServer = new TestUtil.TestServer();

    it("Should setup fixtures", function(done) {
        ApiServer.start(function(e) {
            if (e) { done(e); return; }
            ApiServer.becomeSuperUser(done);
        });
    });

    after(function(done) {
        ApiServer.stop(done);
    });

    describe("Hiera failure cases", function() {
        it("Should error retrieving an unknown entry", function(done) {
            ApiServer.get("/api/v1.1/hiera/dne").expect(404, done);
        });
        it("Should error deleting an unknown entry", function(done) {
            ApiServer.del("/api/v1.1/hiera/dne").expect(404, done);
        });
        it("Should fail to add an entry missing 'name'", function(done) {
            ApiServer.post("/api/v1.1/hiera")
                .set("Content-Type", "application/json")
                .send({"hieradata" : {"this" : "should", "not" : "work"}})
                .expect(400, done);
        });
        it("Should fail to add an entry missing 'hieradata'", function(done) {
            ApiServer.post("/api/v1.1/hiera")
                .set("Content-Type", "application/json")
                .send({"name" : "whatever"})
                .expect(400, done);
        });
        it("Should fail to add an entry with null 'hieradata'", function(done) {
            ApiServer.post("/api/v1.1/hiera")
                .set("Content-Type", "application/json")
                .send({"name" : "whatever", hieradata : null })
                .expect(400, done);
        });
        it("Should fail to update an entry that doesn't exist", function(done) {
            ApiServer.put("/api/v1.1/hiera/dne")
                .set("Content-Type", "application/json")
                .send({"name" : "dne", _sis : { "owner" : "foo" }, "hieradata" : {"key1" : "v1"}})
                .expect(404, done);
        });
    });

    describe("Hiera success cases", function() {
        var item = {
            "name" : "host.name.here",
            _sis : { "owner" : "test" },
            "hieradata" : {
                "servers" : ["10.0.0.1", "10.0.0.2"],
                "port" : 80,
                "obj" : {
                    "k" : "k",
                    "j" : "j"
                }
            }
        };

        before(function(done) {
            ApiServer.del("/api/v1.1/hiera/" + item.name)
                .end(done);
        });

        it("Should add the hiera entry", function(done) {
            ApiServer.post("/api/v1.1/hiera")
                .set("Content-Type", "application/json")
                .send(item)
                .expect(201, done);
        });
        it("Should receive only the data portion with key", function(done) {
            ApiServer
                .get("/api/v1.1/hiera/host.name.here")
                .expect(200)
                .end(function(err, res) {
                    should.not.exist(err);
                    should.exist(res.body['host.name.here']);
                    var body = res.body['host.name.here'];
                    should.exist(body.servers);
                    should.exist(body.port);
                    done();
                });
        });
        it("Should remove the port key and add a name key", function(done) {
            ApiServer
                .put("/api/v1.1/hiera/host.name.here")
                .set("Content-Type", "application/json")
                .send({"name" : "host.name.here", _sis : { "owner" : "test" }, "hieradata" : {"port" : null, "name" : "some_name"}})
                .expect(200)
                .end(function(err, res) {
                    should.not.exist(err);
                    var hieradata = res.body.hieradata;
                    should.exist(hieradata);
                    should.exist(hieradata.servers);
                    should.not.exist(hieradata.port);
                    should.exist(hieradata.name);
                    done();
                });
        });
        it("Should remove the k field from obj and add the l field", function(done) {
            ApiServer.put("/api/v1.1/hiera/host.name.here")
                .set("Content-Type", "application/json")
                .send({"name" : "host.name.here", _sis : { "owner" : "test" }, "hieradata" : { "obj" : { "k" : null, "l" : "l"} } })
                .expect(200, function(err, res) {
                    should.not.exist(err);
                    var hieradata = res.body.hieradata;
                    should.exist(hieradata);
                    should.exist(hieradata.servers);
                    should.exist(hieradata.obj.j);
                    should.not.exist(hieradata.obj.k);
                    should.exist(hieradata.obj.l);
                    done(err, hieradata);
                });
        });
        it("Should fail to update an entry with invalid data", function(done) {
            ApiServer.put("/api/v1.1/hiera/host.name.here")
                .set("Content-Type", "application/json")
                .send({"hieradata" : {"key1" : "v1"}})
                .expect(400, done);
        });
        it("Should fail to update entry with mismatched name and path", function(done) {
            ApiServer
                .put("/api/v1.1/hiera/host.name.here")
                .set("Content-Type", "application/json")
                .send({"name" : "does.not.match", _sis : { "owner" : "test" }, "hieradata" : {"should" : "fail"}})
                .expect(400, done);
        });
        it("Should delete the hiera entry", function(done) {
            ApiServer.del("/api/v1.1/hiera/host.name.here")
                .expect(200, done);
        });
    });

    describe("Non object type support", function() {
        var initialValue = { test : "data" };
        var values = [
            100,
            ["this","is",{ name : "a" }, "list", 20],
            "a string",
            { "a" : "non empty hash" },
            [],
            { },
            200
        ];
        var hieraEntry = {
            name : "non_objects",
            _sis : { owner : ["test"] },
            hieradata : initialValue
        };

        function ensureGetEquals(value, done) {
            ApiServer.get("/api/v1.1/hiera/" + hieraEntry.name)
                .expect(200, function(err, res) {
                    if (err) { done(err); return; }
                    var hieraObject = res.body;
                    should.exist(hieraObject[hieraEntry.name]);
                    var hieraData = hieraObject[hieraEntry.name];
                    hieraData.should.eql(value);
                    done();
                });
        }

        function ensureEqual(value, done) {
            return function(err, res) {
                if (err) { done(err); return; }
                var hieradata = res.body.hieradata;
                should.exist(hieradata);
                hieradata.should.eql(value);
                ensureGetEquals(value, done);
            };
        }

        before(function(done) {
             ApiServer.del("/api/v1.1/hiera/" + hieraEntry.name)
             .end(function(err) {
                 if (err) { done(err); return; }
                 ApiServer.post("/api/v1.1/hiera")
                     .set("Content-Type", "application/json")
                     .send(hieraEntry)
                     .expect(201, ensureEqual(initialValue, done));
             });
        });

        values.forEach(function(val) {
            it("Should set hiera to " + JSON.stringify(val), function(done) {
                hieraEntry.hieradata = val;
                ApiServer.put("/api/v1.1/hiera/" + hieraEntry.name)
                    .set("Content-Type", "application/json")
                    .send(hieraEntry)
                    .expect(200, ensureEqual(val, done));
            });
        });
    });
});
