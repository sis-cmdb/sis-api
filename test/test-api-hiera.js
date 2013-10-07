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

var mongoose = null;
var app = null;

describe('Hiera API', function() {
    before(function(done) {
        server.startServer(config, function(expressApp) {
            mongoose = server.mongoose;            
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

    describe("Hiera success cases", function() {
        var item = {
            "name" : "host.name.here",
            "hieradata" : {
                "servers" : ["10.0.0.1", "10.0.0.2"],
                "port" : 80
            }
        };
        it("Should add the hiera entry", function(done) {
            request(app).post("/api/v1/hiera")
                .set("Content-Encoding", "application/json")
                .send(item)
                .expect(201, done);
        });
        it("Should receive only the data portion", function(done) {
            request(app)
                .get("/api/v1/hiera/host.name.here")
                .expect(200)
                .end(function(err, res) {
                    should.not.exist(err);
                    should.exist(res.body.servers);
                    should.exist(res.body.port);
                    done();
                });
        });
    });
});

