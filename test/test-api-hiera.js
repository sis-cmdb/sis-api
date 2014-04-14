/***********************************************************

 The information in this document is proprietary
 to VeriSign and the VeriSign Product Development.
 It may not be used, reproduced or disclosed without
 the written approval of the General Manager of
 VeriSign Product Development.

 PRIVILEGED AND CONFIDENTIAL
 VERISIGN PROPRIETARY INFORMATION
 REGISTRY SENSITIVE INFORMATION

 Copyright (c) 2013 VeriSign, Inc.  All rights reserved.

 ***********************************************************/

describe('@API - Hiera API', function() {
    var SIS = require("../util/constants");
    var config = require('./fixtures/config');
    var should = require('should');
    var TestUtil = require('./fixtures/util');
    var ApiServer = new TestUtil.TestServer();

    before(function(done) {
        ApiServer.start(config, function(e) {
            if (e) { return done(e); }
            ApiServer.becomeSuperUser(done);
        });
    });

    after(function(done) {
        ApiServer.stop(done);
    });

    describe("Hiera failure cases", function() {
        it("Should error retrieving an unknown entry", function(done) {
            ApiServer.get("/api/v1/hiera/dne").expect(404, done);
        });
        it("Should error deleting an unknown entry", function(done) {
            ApiServer.del("/api/v1/hiera/dne").expect(404, done);
        });
        it("Should fail to add an entry missing 'name'", function(done) {
            ApiServer.post("/api/v1/hiera")
                .set("Content-Type", "application/json")
                .send({"hieradata" : {"this" : "should", "not" : "work"}})
                .expect(400, done);
        });
        it("Should fail to add an entry missing 'hieradata'", function(done) {
            ApiServer.post("/api/v1/hiera")
                .set("Content-Type", "application/json")
                .send({"name" : "whatever"})
                .expect(400, done);
        });
        it("Should fail to add a non object hieradata", function(done) {
            ApiServer.post("/api/v1/hiera")
                .set("Content-Type", "application/json")
                .send({"name" : "name", "hieradata" : "string"})
                .expect(400, done);
        });
        it("Should fail to update an entry that doesn't exist", function(done) {
            ApiServer.put("/api/v1/hiera/dne")
                .set("Content-Type", "application/json")
                .send({"name" : "dne", "owner" : "foo", "hieradata" : {"key1" : "v1"}})
                .expect(404, done);
        });
        it("Should fail to add an empty entry", function(done) {
            ApiServer.post("/api/v1/hiera")
                .set("Content-Type", "application/json")
                .send({"name": "entry", "owner" : "foo", "hieradata" : {}})
                .expect(400, done);
        });
    });

    describe("Hiera success cases", function() {
        var item = {
            "name" : "host.name.here",
            "owner" : "test",
            "hieradata" : {
                "servers" : ["10.0.0.1", "10.0.0.2"],
                "port" : 80,
                "obj" : {
                    "k" : "k",
                    "j" : "j"
                }
            }
        };
        it("Should add the hiera entry", function(done) {
            ApiServer.post("/api/v1/hiera")
                .set("Content-Encoding", "application/json")
                .send(item)
                .expect(201, done);
        });
        it("Should receive only the data portion", function(done) {
            ApiServer
                .get("/api/v1/hiera/host.name.here")
                .expect(200)
                .end(function(err, res) {
                    should.not.exist(err);
                    should.exist(res.body.servers);
                    should.exist(res.body.port);
                    done();
                });
        });
        it("Should remove the port key and add a name key", function(done) {
            ApiServer
                .put("/api/v1/hiera/host.name.here")
                .set("Content-Type", "application/json")
                .send({"name" : "host.name.here", "owner" : "test", "hieradata" : {"port" : null, "name" : "some_name"}})
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
            ApiServer.put("/api/v1/hiera/host.name.here")
                .set("Content-Type", "application/json")
                .send({"name" : "host.name.here", "owner" : "test", "hieradata" : { "obj" : { "k" : null, "l" : "l"} } })
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
            ApiServer.put("/api/v1/hiera/host.name.here")
                .set("Content-Type", "application/json")
                .send({"hieradata" : {"key1" : "v1"}})
                .expect(400, done);
        });
        it("Should fail to update entry with mismatched name and path", function(done) {
            ApiServer
                .put("/api/v1/hiera/host.name.here")
                .set("Content-Type", "application/json")
                .send({"name" : "does.not.match", "owner" : "test", "hieradata" : {"should" : "fail"}})
                .expect(400, done);
        });
        it("Should delete the hiera entry", function(done) {
            ApiServer.del("/api/v1/hiera/host.name.here")
                .expect(200, done);
        });
    });
});

