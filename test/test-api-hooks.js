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
var hookManager = null;
var app = null;
var httpServer = null;

describe('Hook API', function() {
    before(function(done) {
        server.startServer(config, function(expressApp, httpSrv) {
            mongoose = server.mongoose;
            var schemaManager = expressApp.get("schemaManager");
            hookManager = require('../util/hook-manager')(schemaManager);
            app = expressApp;
            httpServer = httpSrv;
            done();
        });
    });

    after(function(done) {
        server.stopServer(httpServer);
        mongoose.connection.db.dropDatabase();
        mongoose.connection.close();
        done();
    });

    describe("Hooks failure cases", function() {
        // no hooks.
        it("Should fail if name does not exist ", function(done) {
            request(app).get("/api/v1/hooks/DNE").expect(404, done);
        });
        it("Should fail to delete non existent hook", function(done) {
            request(app).del("/api/v1/hooks/DNE")
                .expect(404, done);
        });
        it("Should fail to create an invalid hook", function(done) {
            request(app).post("/api/v1/hooks")
                .set("Content-Type", "application/json")
                .send({"invalid" : "hook"})
                .expect(400, done);
        });
        it("Should fail to update a hook that doens't exist", function(done) {
            var hook = {
                "name" : "DNE",
                "owner" : [ "Test" ],
                "entity_type" : "Schema",
                "target" : {
                    "action" : "POST",
                    "url" : "http://foo.bar.com/foo"
                },
                "events": ['insert','update']
            };
            request(app).put("/api/v1/hooks/DNE")
                .set("Content-Type", "application/json")
                .send(hook)
                .expect(404, done);
        });
    });

    describe("CRUD hooks", function() {
        var hook = {
            "name" : "test_hook",
            "owner" : [ "Test" ],
            "entity_type" : "Schema",
            "target" : {
                "action" : "POST",
                "url" : "http://foo.bar.com/foo"
            },
            "events": ['insert','update']
        };
        it("Should create new hook", function(done) {
            request(app).post("/api/v1/hooks")
                .set('Content-Encoding', 'application/json')
                .send(hook)
                .expect(201, done);
        });
        it("Should retrieve the hook", function(done) {
            request(app).get("/api/v1/hooks/test_hook")
                .expect(200, function(err, res) {
                    should.not.exist(err);
                    should.exist(res.body);
                    for (var k in hook) {
                        hook[k].should.eql(res.body[k]);
                    }
                    done();
                });
        });
        it("Should update the hook", function(done) {
            hook['events'] = ['insert'];
            request(app).put("/api/v1/hooks/test_hook")
                .set("Content-Type", "application/json")
                .send(hook)
                .expect(200)
                .end(function(err, result) {
                    should.not.exist(err);
                    should.exist(result);
                    should.exist(result.body);
                    should.exist(result.body.events);
                    result.body.events.length.should.eql(1);
                    done();
                });
        });
        it("Should fail to update the hook w/ invalid data", function(done) {
            delete hook['events'];
            request(app).put("/api/v1/hooks/test_hook")
                .set("Content-Type", "application/json")
                .send(hook)
                .expect(400, done);
        });
        it ("Should delete the hook", function(done) {
            request(app).del("/api/v1/hooks/test_hook")
                .expect(200, done);
        });
    });

    describe("Hook search", function() {
        before(function(done) {
            // insert three hooks
            var hooks = [
                {
                    "name" : "test_hook1",
                    "owner" : "Test",
                    "entity_type" : "Schema",
                    "target" : {
                        "action" : "POST",
                        "url" : "http://foo.bar.com/foo"
                    },
                    "events": ['insert','update']
                },
                {
                    "name" : "test_hook2",
                    "owner" : "Test",
                    "entity_type" : "Schema",
                    "target" : {
                        "action" : "POST",
                        "url" : "http://foo.bar.com/foo"
                    },
                    "events": ['insert','update']
                },
                {
                    "name" : "test_hook3",
                    "owner" : "Test",
                    "entity_type" : "Schema",
                    "target" : {
                        "action" : "POST",
                        "url" : "http://foo.bar.com/foo"
                    },
                    "events": ['insert','update']
                }
            ];
            // async magic - https://github.com/caolan/async
            async.map(hooks, hookManager.add.bind(hookManager), done);
        });
        after(function(done) {
            async.map(['test_hook1', 'test_hook2', 'test_hook3'], hookManager.delete.bind(hookManager), done);
        });
        it("Should return 2 results", function(done) {
            request(app).get("/api/v1/hooks")
                .query({ offset : 1, limit : 2})
                .expect(200)
                .end(function(err, res) {
                    should.exist(res.body);
                    res.body.length.should.eql(2);
                    done();
                });
        });
        it("Should return 1 results", function(done) {
            request(app).get("/api/v1/hooks")
                .query({ q: JSON.stringify({"name" : "test_hook1"}) })
                .expect(200)
                .end(function(err, res) {
                    should.exist(res.body);
                    res.body.length.should.eql(1);
                    done();
                });
        });
    });

});
