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

describe('Entity API', function() {
    before(function(done) {
        server.startServer(config, function(expressApp, httpSrv) {
            mongoose = server.mongoose;
            schemaManager = expressApp.get("schemaManager");
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

    describe("Entity Failure cases", function() {
        // no schemas..
        it("Should fail if type is not specified ", function(done) {
            request(app).get("/api/v1/entities").expect(404, done);
        });
        it("Should fail if type does not exist ", function(done) {
            request(app).get("/api/v1/entities/dne").expect(404, done);
        });
        it("Should fail to add an entity for a dne schema", function(done) {
            request(app).post("/api/v1/entities/dne")
                .set("Content-Type", "application/json")
                .send({"this" : "should", "not" : "work"})
                .expect(404, done);
        });
        it("Should fail to get an entity by id of a particular type that does not exist", function(done) {
            request(app).get("/api/v1/entities/dne/some_id")
                .expect(404, done);
        });
        it("Should fail to delete an entity for dne schema", function(done) {
            request(app).del("/api/v1/entities/dne/some_id")
                .expect(404, done);
        });
    });

    describe("CRUD Entity", function() {
        var schema = {
            "name":"test_entity",
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

        it("Should retrieve the added entity ", function(done) {
            request(app).get("/api/v1/entities/" + schema.name + "/" + entityId)
                .set('Content-Encoding', 'application/json')
                .expect(200, createEndCallback(done))
        });

        it("Should update the str to foobar ", function(done) {
            expectedEntity["str"] = "foobar";
            request(app).put("/api/v1/entities/" + schema.name + "/" + entityId)
                .set('Content-Encoding', 'application/json')
                .send(expectedEntity)
                .expect(200)
                .end(createEndCallback(done));
        });
        it("Should not add an invalid entity ", function(done) {
            var invalid = {
                "str" : "testing",
                "num" : 123,
                "date" : new Date(2013, 10, 1),
                "bool" : "bogus",
                "arr" : "not an array"
            };
            request(app).post("/api/v1/entities/" + schema.name)
                .set('Content-Encoding', 'application/json')
                .send(invalid)
                .expect(400);
                done();
        });
        it("Should delete the added entity", function(done) {
            request(app).del("/api/v1/entities/" + schema.name + "/" + entityId)
                .expect(200, done);
        });
        it("Should fail to add an entity with _id", function(done) {
            expectedEntity['_id'] = 'foobar';
            request(app).post("/api/v1/entities/" + schema.name)
                .set("Content-Type", "application/json")
                .send(expectedEntity)
                .expect(400, done);
        });
        it("Should fail to update an entity that doesn't exist", function(done) {
            delete expectedEntity['_id'];
            request(app).put("/api/v1/entities/" + schema.name + "/foobar")
                .set("Content-Type", "application/json")
                .send(expectedEntity)
                .expect(404, done);
        });
        it("Should fail to delete entity that doesn't exist", function(done) {
            request(app).del("/api/v1/entities/" + schema.name + "/some_id")
                .expect(404, done);
        });
        it("Should fail to add an empty entity", function(done) {
            request(app).post("/api/v1/entities/" + schema.name)
                .set("Content-Type", "application/json")
                .send({})
                .expect(400, done);
        });
    });

    describe("Partial entity updates", function() {
        var schema = {
            "name":"test_nested_entity",
            "owner" : "test",
            "definition": {
                "str":   "String",
                "num":   "Number",
                "nested_obj" : {
                    "str" : "String",
                    "obj2" : {
                        "name" : "String",
                        "other_field" : "String"
                    }
                },
                "mixed_obj" : "Mixed"
            }
        };
        var entity = {
            "str" : "foo",
            "num" : 20,
            "nested_obj" : {
                "str" : "bar",
                "obj2" : {
                    "name" : "baz",
                    "other_field" : "werd"
                }
            },
            "mixed_obj" : {
                "crazy" : "stuff",
                "goes" : "here"
            }
        };
        before(function(done) {
            schemaManager.addSchema(schema, function(err, result) {
                if (err) { return done(err, result) }
                request(app).post("/api/v1/entities/test_nested_entity")
                    .set("Content-Type", "application/json")
                    .send(entity)
                    .expect(201, function(err, res) {
                        entity = res.body;
                        should.exist(entity);
                        should.exist(entity.nested_obj);
                        should.exist(entity.nested_obj.obj2);
                        should.exist(entity.nested_obj.obj2.name);
                        done(err, result);
                    })
            });
        });
        after(function(done) {
            schemaManager.deleteSchema(schema.name, done);
        });
        it("Should update nested_obj.obj2.name only", function(done) {
            entity['nested_obj']['obj2']['name'] == "hello";
            delete entity['__v'];
            request(app).put("/api/v1/entities/test_nested_entity/" + entity['_id'])
                .set("Content-Type", "application/json")
                .send({"nested_obj" : { "obj2" : { "name" : "hello" } } })
                .expect(200, function(err, result) {
                    result = result.body;
                    delete result['__v'];
                    result.should.eql(entity);
                    done(err, result);
                });
        });
        it("Should update delete 'crazy' from mixed_obj and add 'awesome'", function(done) {
            delete entity['mixed_obj']['crazy'];
            entity['mixed_obj']['awesome'] = 'here';
            request(app).put("/api/v1/entities/test_nested_entity/" + entity['_id'])
                .set("Content-Type", "application/json")
                .send({"mixed_obj" : {"crazy" : null, "awesome" : "here"}})
                .expect(200, function(err, result) {
                    result = result.body;
                    delete result['__v'];
                    result.should.eql(entity);
                    done(err, result);
                });
        });
    });

});
