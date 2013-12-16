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

var config = require('./test-config');
var server = require("../server")
var should = require('should');
var request = require('supertest');
var async = require('async');

var mongoose = null;
var schemaManager = null;
var app = null;
var httpServer = null;
var hookManager = null;

var SIS = require("../util/constants")

describe('Schema API', function() {

    before(function(done) {
        server.startServer(config, function(expressApp, httpSrv) {
            mongoose = server.mongoose;
            schemaManager = expressApp.get(SIS.OPT_SCHEMA_MGR);
            hookManager = require("../util/hook-manager")(schemaManager);
            app = expressApp;
            httpServer = httpSrv;
            done();
        });
    });

    after(function(done) {
        server.stopServer(httpServer, function() {
            mongoose.connection.db.dropDatabase();
            mongoose.connection.close();
            done();
        });
    });

    describe("Schema failure cases", function() {
        it("Should fail if type does not exist ", function(done) {
            request(app).get("/api/v1/schemas/dne").expect(404, done);
        });
        it("Should fail to delete type if it doesn't exist", function(done) {
            request(app).del("/api/v1/schemas/dne").expect(404, done);
        });
        it("Should fail to add an invalid schema", function(done) {
            request(app).post("/api/v1/schemas")
                .set("Content-type", "application/json")
                .send({"name" : "no_owner_or_def"})
                .expect(400, done);
        });
        it("Should fail to update a schema that DNE", function(done) {
            request(app).put("/api/v1/schemas/DNE")
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
            request(app).post("/api/v1/schemas")
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

            request(app).post("/api/v1/schemas")
                .set('Content-Encoding', 'application/json')
                .send(jsData)
                .expect(201, done);
        });
        it("Should get the schema", function(done) {
            request(app).get("/api/v1/schemas/network_element")
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
            request(app).put("/api/v1/schemas/network_element")
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
            request(app).put("/api/v1/schemas/network_element")
                .set("Content-type", "application/json")
                .send(jsData)
                .expect(400, done);
        });
        it("Should fail to update the schema with an invalid body", function(done) {
            delete jsData['owner'];
            jsData['name'] = 'network_element';
            request(app).put("/api/v1/schemas/network_element")
                .set("Content-type", "application/json")
                .send(jsData)
                .expect(400, done);
        });
        it("Should delete the schema", function(done) {
            request(app).del("/api/v1/schemas/network_element")
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
            async.map(schemas, schemaManager.add.bind(schemaManager), done);
        });
        after(function(done) {
            async.map(['s1', 's2', 't1'], schemaManager.delete.bind(schemaManager), done);
        });
        it("Should return 2 results", function(done) {
            request(app).get("/api/v1/schemas")
                .query({ offset : 1, limit : 2})
                .expect(200)
                .end(function(err, res) {
                    should.exist(res.body);
                    res.body.length.should.eql(2);
                    done();
                });
        });
        it("Should return s1 and s2 ", function(done) {
            request(app).get("/api/v1/schemas")
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

    describe("test-hook-dispatch", function() {
        // the done callback that our listening server will callback on
        var doneCallback = null;
        // hook server - receives the hook events
        var hookServer = null;
        var hookHttpServer = null;
        var hookName = "test_hook";
        var hook = null;

        before(function(done) {
            var express = require('express');
            hookServer = express();
            hookServer.use(express.json());
            hookServer.post('/hook', function(req, res) {
                should.exist(req.body);
                req.body.entity_type.should.eql(SIS.SCHEMA_SCHEMAS);
                req.body.hook.should.eql(hookName);
                req.body.event.should.eql(SIS.EVENT_INSERT);
                if (doneCallback) {
                    doneCallback();
                }
            });

            hook = {
                "name" : hookName,
                "owner" : [ "Test" ],
                "entity_type" : SIS.SCHEMA_SCHEMAS,
                "target" : {
                    "action" : "POST",
                    "url" : "http://localhost:3334/hook"
                },
                "events": [ SIS.EVENT_INSERT, SIS.EVENT_UPDATE ]
            };

            hookHttpServer = hookServer.listen(3334, function(err) {
                if (err) {
                    done(err);
                }
                hookManager.add(hook, function(err, result) {
                    done();
                });
            });
        });

        after(function(done) {
            hookHttpServer.close();
            hookManager.delete(hookName, function() {
                done();
            });
        });

        var hookSchema = {
            "name" : "test",
            "owner" : "test",
            "definition" : {
                "field" : "String",
                "field2" : "Number"
            }
        };

        it("Should dispatch the schema hook", function(doneCb) {
            doneCallback = doneCb;
            request(app).post("/api/v1/schemas")
                .set('Content-Encoding', 'application/json')
                .send(hookSchema)
                .end(function(err, res) { });
        });
    });
});

