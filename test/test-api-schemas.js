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

describe('@API - Schema API', function() {

    var SIS = require("../util/constants");
    var config = require('./fixtures/config');
    var should = require('should');
    var TestUtil = require('./fixtures/util');
    var ApiServer = new TestUtil.TestServer();
    var async = require('async');

    before(function(done) {
        ApiServer.start(config, function(e) {
            if (e) { return done(e); }
            ApiServer.becomeSuperUser(done);
        });
    });

    after(function(done) {
        ApiServer.stop(done);
    });


    describe("Schema failure cases", function() {
        it("Should fail if type does not exist ", function(done) {
            ApiServer.get("/api/v1/schemas/dne").expect(404, done);
        });
        it("Should fail to delete type if it doesn't exist", function(done) {
            ApiServer.del("/api/v1/schemas/dne").expect(404, done);
        });
        it("Should fail to add an invalid schema", function(done) {
            ApiServer.post("/api/v1/schemas")
                .set("Content-type", "application/json")
                .send({"name" : "no_owner_or_def"})
                .expect(400, done);
        });
        it("Should fail to update a schema that DNE", function(done) {
            ApiServer.put("/api/v1/schemas/DNE")
                .set("Content-type", "application/json")
                .send({"name" : "DNE", "owner" : "DNE", "definition" : {"k" : "String"}})
                .expect(404, done);
        });
        it("Should fail to add a schema with a bad name", function(done) {
            var schema = {
                "name" : "@#(*^! !(@#*$!",
                "owner" : "test",
                "definition" : {
                    "name" : "String"
                }
            }
            ApiServer.post("/api/v1/schemas")
                .set("Content-type", "application/json")
                .send(schema)
                .expect(400, done);
        });
    });

    describe("CRUD schema", function() {
        var jsData = {
            "name":"network_element",
            "owner" : ["ResOps"],
            "definition": {
                "ne_type": "String",
                "cid":     "String",
                "ip":      "String",
                "ip6":     "String",
                "bgpip":   "String",
                "bgpip6":  "String",
                "owner" : ["String"]
            }
        };
        it("Should create new schemas", function(done) {

            ApiServer.post("/api/v1/schemas")
                .set('Content-Encoding', 'application/json')
                .send(jsData)
                .expect(201, done);
        });
        it("Should get the schema", function(done) {
            ApiServer.get("/api/v1/schemas/network_element")
                .expect(200)
                .end(function(err, res) {
                    var data = res.body;
                    should.not.exist(err);
                    should.exist(data);
                    for (var k in jsData) {
                        jsData[k].should.eql(data[k]);
                    }
                    done();
                });
        });
        it("Should update the schema", function(done) {
            // update jsdata
            jsData["definition"]['cid'] = "Number";
            ApiServer.put("/api/v1/schemas/network_element")
                .set("Content-type", "application/json")
                .send(jsData)
                .expect(200)
                .end(function(err, res) {
                    var data = res.body;
                    should.not.exist(err);
                    should.exist(data);
                    for (var k in jsData) {
                        jsData[k].should.eql(data[k]);
                    }
                    done();
                });
        });
        it("Should fail to change the schema name", function(done) {
            jsData['name'] = "whatever";
            ApiServer.put("/api/v1/schemas/network_element")
                .set("Content-type", "application/json")
                .send(jsData)
                .expect(400, done);
        });
        it("Should fail to update the schema with an invalid body", function(done) {
            delete jsData['owner'];
            jsData['name'] = 'network_element';
            ApiServer.put("/api/v1/schemas/network_element")
                .set("Content-type", "application/json")
                .send(jsData)
                .expect(400, done);
        });
        it("Should delete the schema", function(done) {
            ApiServer.del("/api/v1/schemas/network_element")
                .expect(200, done);
        });
    });

    describe("Schema search", function() {
        before(function(done) {
            // insert three schemas
            var schemas = [{ "name":"s1", "definition": { "field" : "String" }, "owner" : "ResOps" },
                           { "name":"s2", "definition": { "field" : "String" }, "owner" : "ResOps" },
                           { "name":"t1", "definition": { "field" : "String" }, "owner" : "ProvOps" }];
            // async magic - https://github.com/caolan/async
            async.map(schemas, function(schema, callback) {
                ApiServer.post('/api/v1/schemas')
                    .send(schema).expect(201, callback);
            }, done);
        });
        after(function(done) {
            async.map(['s1', 's2', 't1'], function(schema, callback) {
                ApiServer.del('/api/v1/schemas/' + schema)
                    .expect(200, callback);
            }, done);
        });
        it("Should return 2 results", function(done) {
            ApiServer.get("/api/v1/schemas")
                .query({ offset : 1, limit : 2})
                .expect(200)
                .end(function(err, res) {
                    should.exist(res.body);
                    res.body.length.should.eql(2);
                    done();
                });
        });
        it("Should return s1 and s2 ", function(done) {
            ApiServer.get("/api/v1/schemas")
                .query({q : JSON.stringify({ "owner" : ["ResOps"] }) })
                .expect(200)
                .end(function(err, res) {
                    should.exist(res.body);
                    res.body.length.should.eql(2);
                    for (var i = 0; i < 2; ++i) {
                        res.body[i]['owner'].should.eql(['ResOps']);
                    }
                    done();
                });
        });
    });
});

