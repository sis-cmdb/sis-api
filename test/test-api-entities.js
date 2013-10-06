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
var schemaManager = null;
var app = null;

describe('Entity API', function() {
    before(function(done) {
        server.startServer(config, function(expressApp) {
            mongoose = server.mongoose;
            schemaManager = require('../util/schema-manager')(mongoose);
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

    describe("GET Failure cases", function() {
        // no schemas..
        it("Should fail if type is not specified ", function(done) {
            request(app).get("/v1/api/entities").expect(404, done);
        });
        it("Should fail if type does not exist ", function(done) {
            request(app).get("/v1/api/entities/dne").expect(404, done);
        });
    });

    describe("CRUD Entity", function() {
        var schema = {
            "name":"testEntity",
            "definition": {
                "str":   "String",
                "num":   "Number",
                "date":  "Date",
                "bool":  "Boolean",
                "arr": [],
            }
        };
        before(function(done) {
            schemaManager.addSchema(schema, done);
        });
        after(function(done) {
            schemaManager.deleteSchema(schema.name, done);
        });
        var entityId = null;
        var expectedEntity = {
            "str" : "testing",
            "num" : 123,
            "date" : new Date(2013, 10, 1),
            "bool" : true,
            "arr" : ["sis"]
        };
        var validateWithExpected = function(entity) {
            for (var k in expectedEntity) {
                should.exist(entity[k]);
                JSON.stringify(expectedEntity[k]).should.eql(JSON.stringify(entity[k]));
            }
        }

        var createEndCallback = function(done) {
            return function(err, res) {
                if (err) { done(err); }
                should.exist(res.body);
                should.exist(res.body['_id']);
                if (!entityId) {
                    entityId = res.body['_id'];
                } else {
                    entityId.should.eql(res.body['_id']);
                }
                validateWithExpected(res.body);
                done();
            }
        }

        it("Should add the entity ", function(done) {
            request(app).post("/api/v1/entities/" + schema.name)
                .set('Content-Encoding', 'application/json')
                .send(expectedEntity)
                .expect(201)
                .end(createEndCallback(done));
        });
        it("Should update the str to foobar ", function(done) {
            expectedEntity["str"] = "foobar";
            request(app).put("/api/v1/entities/" + schema.name + "/" + entityId)
                .set('Content-Encoding', 'application/json')
                .send(expectedEntity)
                .expect(200)
                .end(createEndCallback(done));
        });
    });


});
