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
            hookManager = require('../util/hook-manager')(mongoose);
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

    describe("GET failure cases", function() {
        // no hooks.
        it("Should fail if type does not exist ", function(done) {
            request(app).get("/v1/api/hooks/DNE").expect(404, done);
        });
    });

    describe("CRUD hooks", function() {
        var hook = {
            "name" : "test_hook",
            "owner" : "Test",
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
            async.map(hooks, hookManager.addHook.bind(hookManager), done);
        });
        after(function(done) {
            async.map(['test_hook1', 'test_hook2', 'test_hook3'], hookManager.deleteHook.bind(hookManager), done);
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
