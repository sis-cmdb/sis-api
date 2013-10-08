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

// use the edge config
var config = require('./test-edge-config');
var server = require("../server")
var should = require('should');
var request = require('supertest');
var async = require('async');

var mongoose = null;
var schemaManager = null;
var app = null;
var httpServer = null;

describe('API at the Edge ', function() {

    var schema = {
        "name":"testEntity",
        "owner" : "test",
        "definition": {
            "str":   "String",
            "num":   "Number",
            "date":  "Date",
            "bool":  "Boolean",
            "arr": [],
        }
    };

    before(function(done) {        
        server.startServer(config, function(expressApp, httpSrv) {
            mongoose = server.mongoose;
            schemaManager = require('../util/schema-manager')(mongoose);
            app = expressApp;
            httpServer = httpSrv;
            // create a schema
            schemaManager.addSchema(schema, done);
        });
    });

    after(function(done) {
        server.stopServer(httpServer, function() {
            mongoose.connection.db.dropDatabase();
            mongoose.connection.close();
            done();    
        });
    });

    it("should have edgesite set in the app", function() {
        should.exist(app.get("edgesite"));
        app.get("edgesite").should.eql(true);
    });

    var paths = [
        "/api/v1/schemas",
        "/api/v1/hiera",
        "/api/v1/entities/testEntity"
    ];

    paths.map(function(path) {
        it("should allow GET on " + path, function(done) {
            request(app)
                .get(path)
                .expect(200, done);
        });
    });

    paths.map(function(path) {
        it("should 404 when POSTing to " + path, function(done) {
            request(app).post("/api/v1/schemas")
                .set('Content-Encoding', 'application/json')
                .send({"unprocessed" : "entity"})
                .expect(404, done);
        });
    });

});
