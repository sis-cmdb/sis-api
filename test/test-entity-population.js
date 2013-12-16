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
var SIS = require("../util/constants");

var mongoose = null;
var schemaManager = null;
var app = null;
var httpServer = null;

describe('Entity Population API', function() {
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

        before(function(done) {
            // setup the schemas
            async.map(schemas, schemaManager.add.bind(schemaManager), function(err, res) {
                if (err) { return done(err, res); }

                var createEntity = function(i) {
                    if (i >= entities.length) {
                        return done();
                    }
                    if (i > 0) {
                        // assign _id of the previous entity
                        entities[i][1]['ref_field'] = entities[i - 1][1]['_id'];
                    }
                    request(app).post("/api/v1/entities/" + entities[i][0])
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
            async.map(names, schemaManager.delete.bind(schemaManager), done);
        });

        it("Should populate pop_schema_2 ref_field", function(done) {
            // test it with the GET /
            request(app).get("/api/v1/entities/pop_schema_3")
                .set('Content-Type', 'application/json')
                .expect(200, function(err, res) {
                    if (err) { return done(err, res); }
                    res = res.body[0];
                    should.exist(res);
                    "ps3 stuff".should.eql(res.stuff);
                    should.exist(res.ref_field)
                    res.ref_field.should.eql(entities[1][1]);
                    done();
                });
        });

        it("Should populate pop_schema_1 ref_field", function(done) {
            request(app).get("/api/v1/entities/pop_schema_2/" + entities[1][1]['_id'])
                .set("Content-Type", "application/json")
                .expect(200, function(err, res) {
                    if (err) { return done(err, res) }
                    res = res.body;
                    should.exist(res);
                    "ps2_type".should.eql(res.type);
                    should.exist(res.ref_field)
                    res.ref_field.should.eql(entities[0][1]);
                    done();
                });
        });

        it("Should not populate pop_schema_2 ref_field", function(done) {
            // test it with the GET /
            request(app).get("/api/v1/entities/pop_schema_3")
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
            request(app).get("/api/v1/entities/pop_schema_2/" + entities[1][1]['_id'])
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

    });
});