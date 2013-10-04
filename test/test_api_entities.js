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
var TestUtil = require('./test-util');
var mongoose = null;
var schemaManager = null;

describe('Entity API', function() {
    before(function(done) {
        server.startServer(config);
        mongoose = server.mongoose;
        schemaManager = require('../util/schema-manager')(mongoose);
        done();
    });

    after(function(done) {
        server.stopServer();
        mongoose.connection.db.dropDatabase();
        mongoose.connection.close();
        done();
    });

    describe("Get failures", function() {
        // no schemas..
        it("Should fail if type is not specified ", function(done) {
            var req = TestUtil.createRequest(config, "/api/v1/entities", "GET");
            req.sendRequest(function(res, body) {
                res.statusCode.should.eql(404);
                done();
            });
        });
        it("Should fail if type does not exist ", function(done) {
           var req = TestUtil.createRequest(config, "/api/v1/entities/dne", "GET");
            req.sendRequest(function(res, body) {
                res.statusCode.should.eql(404);
                done();
            }); 
        });
    });


});
