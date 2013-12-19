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

var SIS = require("../util/constants")

describe('Parse single line comments out', function() {
    before(function(done) {
        server.startServer(config, function(expressApp, httpSrv) {
            mongoose = server.mongoose;
            schemaManager = expressApp.get(SIS.OPT_SCHEMA_MGR);
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

    it("Should add the schema in commented-schema.json", function(done) {
        var fs = require('fs');
        var data = fs.readFileSync(__dirname + "/commented-schema.json");
        request(app).post("/api/v1/schemas")
            .set("Content-Type", "application/json")
            .send(data.toString('utf8'))
            .expect(201, done);
    });

});