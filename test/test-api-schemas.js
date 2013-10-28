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

describe('Schema API', function() {

    before(function(done) {
        server.startServer(config, function(expressApp, httpSrv) {
            mongoose = server.mongoose;
            schemaManager = require('../util/schema-manager')(mongoose);
            hookManager = require("../util/hook-manager")(mongoose);
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

    describe("GET failure cases", function() {
        // no schemas..
        it("Should fail if type is not specified ", function(done) {
            request(app).get("/v1/api/schemas").expect(404, done);
        });
        it("Should fail if type does not exist ", function(done) {
            request(app).get("/v1/api/schemas/dne").expect(404, done);
        });
    });

    describe("CRUD schema", function() {
        var jsData = {
            "name":"network_element",
            "owner" : "ResOps",
            "definition": {
                "ne_type": "String",
                "cid":     "String",
                "ip":      "String",
                "ip6":     "String",
                "bgpip":   "String",
                "bgpip6":  "String"
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
            async.map(schemas, schemaManager.addSchema.bind(schemaManager), done);
        });
        after(function(done) {
            async.map(['s1', 's2', 't1'], schemaManager.deleteSchema.bind(schemaManager), done);
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
                .query({q : JSON.stringify({ "owner" : "ResOps" }) })
                .expect(200)
                .end(function(err, res) {
                    should.exist(res.body);
                    res.body.length.should.eql(2);
                    for (var i = 0; i < 2; ++i) {
                        res.body[i]['owner'].should.eql('ResOps');
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
            hookServer.use(express.bodyParser());
            hookServer.post('/hook', function(req, res) {
                should.exist(req.body);
                req.body.entity_type.should.eql(schemaManager.SIS_SCHEMA_NAME);
                req.body.hook.should.eql(hookName);
                req.body.event.should.eql(hookManager.EVENT_INSERT);
                if (doneCallback) {
                    doneCallback();
                }
            });

            hook = {
                "name" : hookName,
                "owner" : "Test",
                "entity_type" : schemaManager.SIS_SCHEMA_NAME,
                "target" : {
                    "action" : "POST",
                    "url" : "http://localhost:3334/hook"
                },
                "events": [ hookManager.EVENT_INSERT, hookManager.EVENT_UPDATE ]
            };

            hookHttpServer = hookServer.listen(3334, function(err) {
                if (err) {
                    done(err);
                }
                hookManager.addHook(hook, function(err, result) {
                    done();
                });
            });
        });

        after(function(done) {
            hookHttpServer.close();
            hookManager.deleteHook(hookName, function() {
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

