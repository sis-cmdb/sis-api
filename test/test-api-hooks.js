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

describe('Hook API', function() {
    before(function(done) {
        server.startServer(config, function(expressApp) {
            mongoose = server.mongoose;
            hookManager = require('../util/hook-manager')(mongoose);
            app = expressApp;
            done();
        });
    });

    after(function(done) {
        server.stopServer();
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

    describe("POST hooks", function() {
        it("Should create new hook", function(done) {
            var hook = { 
                "name" : "TestHook", 
                "owner" : "Test",
                "entity_type" : "Schema",
                "target" : {
                    "action" : "POST",
                    "url" : "http://foo.bar.com/foo"
                },
                on: ['insert','update']
            };
            request(app).post("/api/v1/hooks")
                .set('Content-Encoding', 'application/json')
                .send(hook)
                .expect(201, done);
        });
        after(function(done) {
            hookManager.deleteHook("TestHook", done);
        });
    });

    describe("Hook search", function() {
        before(function(done) {
            // insert three hooks
            var hooks = [
                { 
                    "name" : "TestHook-1",
                    "owner" : "Test",
                    "entity_type" : "Schema",
                    "target" : {
                        "action" : "POST",
                        "url" : "http://foo.bar.com/foo"
                    },
                    on: ['insert','update']
                },
                { 
                    "name" : "TestHook-2",
                    "owner" : "Test",
                    "entity_type" : "Schema",
                    "target" : {
                        "action" : "POST",
                        "url" : "http://foo.bar.com/foo"
                    },
                    on: ['insert','update']
                },
                { 
                    "name" : "TestHook-3",
                    "owner" : "Test",
                    "entity_type" : "Schema",
                    "target" : {
                        "action" : "POST",
                        "url" : "http://foo.bar.com/foo"
                    },
                    on: ['insert','update']
                }
            ];
            // async magic - https://github.com/caolan/async
            async.map(hooks, hookManager.addHook.bind(hookManager), done);
        });
        after(function(done) {
            async.map(['TestHook-1', 'TestHook-2', 'TestHook-3'], hookManager.deleteHook.bind(hookManager), done);
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
                .query({ q: JSON.encode({"name","TestHook-1"}) })
                .expect(200)
                .end(function(err, res) {
                    should.exist(res.body);
                    res.body.length.should.eql(1);
                    done();
                });
        });
    });

});
