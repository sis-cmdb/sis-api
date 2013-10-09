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

describe('Schema API', function() {
    before(function(done) {
        server.startServer(config, function(expressApp, httpSrv) {
            mongoose = server.mongoose;
            schemaManager = require('../util/schema-manager')(mongoose);
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

    describe("POST schema", function() {
        it("Should create new schemas", function(done) {
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
            request(app).post("/api/v1/schemas")
                .set('Content-Encoding', 'application/json')
                .send(jsData)
                .expect(201, done);
        });
        after(function(done) {
            schemaManager.deleteSchema("network_element", done);
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

});
