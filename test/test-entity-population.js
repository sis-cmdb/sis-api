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

describe('@API - Entity Population API', function() {
    var should = require('should');
    var async = require('async');
    var SIS = require("../util/constants");
    var config = require('./fixtures/config');
    var TestUtil = require('./fixtures/util');
    var ApiServer = new TestUtil.TestServer();

    before(function(done) {
        ApiServer.start(config, function(e) {
            if (e) { return done(e); }
            ApiServer.becomeSuperUser(done);
        });
    });

    after(function(done) {
        ApiServer.stop(done);
    });

    describe("Populate entities", function() {
        var schema1 = {
            "name" : "pop_schema_1",
            "owner" : "entity_test",
            "definition" : {
                "ps1_name" : "String",
                "num" : "Number"
            }
        };

        var schema2 = {
            "name" : "pop_schema_2",
            "owner" : "entity_test",
            "definition" : {
                "ps2_name" : "String",
                "type" : "String",
                "ref_field" : { "type" : "ObjectId", ref : "pop_schema_1" }
            }
        };

        var schema3 = {
            "name" : "pop_schema_3",
            "owner" : "entity_test",
            "definition" : {
                "ps3_name" : "String",
                "stuff" : "String",
                "ref_field" : { "type" : "ObjectId", ref : "pop_schema_2" }
            }
        };

        var entities = [
         ["pop_schema_1", {"ps1_name" : "ps1", "num" : 10}],
         ["pop_schema_2", {"ps2_name" : "ps2", "type" : "ps2_type"}],
         ["pop_schema_3", {"ps3_name" : "ps3", "stuff" : "ps3 stuff"}]
        ];

        var schemas = [schema1, schema2, schema3];

        var addSchema = function(schema, callback) {
            ApiServer.post('/api/v1/schemas')
                .send(schema).expect(201, callback);
        };

        var deleteSchema = function(name, callback) {
            ApiServer.del('/api/v1/schemas/' + name)
                .expect(200, callback);
        };

        before(function(done) {
            // setup the schemas
            async.map(schemas, addSchema, function(err, res) {
                if (err) { return done(err, res); }

                var createEntity = function(i) {
                    if (i >= entities.length) {
                        return done();
                    }
                    if (i > 0) {
                        // assign _id of the previous entity
                        entities[i][1]['ref_field'] = entities[i - 1][1]['_id'];
                    }
                    ApiServer.post("/api/v1/entities/" + entities[i][0])
                        .set("Content-Type", "application/json")
                        .query("populate=false")
                        .send(entities[i][1])
                        .expect(201, function(err, result) {
                            if (err) { return done(err, result); }
                            result = result.body;
                            entities[i][1] = result;
                            // chain
                            createEntity(i + 1);
                        });
                }
                createEntity(0);
            });
        });

        after(function(done) {
            var names = schemas.map(function(s) { return s.name; });
            async.map(names, deleteSchema, done);
        });

        it("Should populate pop_schema_2 ref_field", function(done) {
            // test it with the GET /
            ApiServer.get("/api/v1/entities/pop_schema_3")
                .set('Content-Type', 'application/json')
                .expect(200, function(err, res) {
                    if (err) { return done(err, res); }
                    res = res.body[0];
                    should.exist(res);
                    should.exist(res.stuff);
                    res.stuff.should.eql("ps3 stuff");
                    should.exist(res.ref_field)
                    res.ref_field.should.eql(entities[1][1]);
                    done();
                });
        });

        it("Should populate pop_schema_1 ref_field", function(done) {
            ApiServer.get("/api/v1/entities/pop_schema_2/" + entities[1][1]['_id'])
                .set("Content-Type", "application/json")
                .expect(200, function(err, res) {
                    if (err) { return done(err, res) }
                    res = res.body;
                    should.exist(res);
                    should.exist(res.type);
                    res.type.should.eql("ps2_type");
                    should.exist(res.ref_field)
                    res.ref_field.should.eql(entities[0][1]);
                    done();
                });
        });

        it("Should not populate pop_schema_2 ref_field", function(done) {
            // test it with the GET /
            ApiServer.get("/api/v1/entities/pop_schema_3")
                .query("populate=false")
                .set('Content-Type', 'application/json')
                .expect(200, function(err, res) {
                    if (err) { return done(err, res); }
                    res = res.body[0];
                    should.exist(res);
                    res.should.eql(entities[2][1])
                    done();
                });
        });

        it("Should not populate pop_schema_1 ref_field", function(done) {
            ApiServer.get("/api/v1/entities/pop_schema_2/" + entities[1][1]['_id'])
                .query("populate=false")
                .set("Content-Type", "application/json")
                .expect(200, function(err, res) {
                    if (err) { return done(err, res) }
                    res = res.body;
                    should.exist(res);
                    res.should.eql(entities[1][1]);
                    done();
                });
        });

        it("Should not update pop_schema_1 with a bad ref", function(done) {
            var entity = entities[1][1];
            // clone
            entity = JSON.parse(JSON.stringify(entity));
            entity['ref_field'] = entities[2][1]['_id'];
            // try to update
            ApiServer.put("/api/v1/entities/pop_schema_2/" + entity['_id'])
                .set("Content-Type", "application/json")
                .send(entity)
                .expect(400, function(err, res) {
                    res.status.should.eql(400);
                    done();
                });
        });

        it("Should not add pop_schema_1 with a bad ref", function(done) {
            var entity = {"ps2_name" : "ps2.bad", "type" : "ps2_type.bad"}
            entity['ref_field'] = entities[2][1]['_id'];
            ApiServer.post("/api/v1/entities/pop_schema_2")
                        .set("Content-Type", "application/json")
                        .send(entity)
                        .expect(400, function(err, res) {
                            res.status.should.eql(400);
                            done();
                        });
        });
    });
});