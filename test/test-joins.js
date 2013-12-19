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

describe('Entity Join API', function() {
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

    describe("Get entities with joins", function() {
        var schemas = [];
        var numSchemas = 3;
        var numEnts = 3;
        var appReq = null;

        // create 3 schemas where join_schema_1 has a ref_0 to join_schema_0
        // and join_schema_2 has a ref_0 to join_schema_0 and ref_1 to join_schema_1
        for (var i = 0; i < numSchemas; ++i) {
            var schema = {
                "owner" : "entity_test",
                "name" : "join_schema_" + i,
                "definition" : {
                    "name" : "String",
                    "num" : "Number"
                }
            };
            var j = i - 1;
            while (j >= 0) {
                schema.definition['ref_' + j] = { type : "ObjectId", ref: "join_schema_" + j }
                --j;
            }
            schemas.push(schema);
        }

        // build entities
        // this becomes an array of array of entities that
        // get filled
        var entities = [];
        for (var i = 0; i < numSchemas; ++i) {
            var schema_ents = [];
            for (var j = 0; j < numEnts; ++j) {
                schema_ents.push({
                    "name" : "join_ent_" + i + "_" + j,
                    "num" : ((i + 1) * 100) + j
                });
            }
            entities.push(schema_ents);
        }

        before(function(done) {
            appReq = request(app);
            // setup the schemas
            async.map(schemas, schemaManager.add.bind(schemaManager), function(err, res) {
                if (err) { return done(err, res); }

                // join_ent_2_2 will have ref_1 = join_ent_1_2 and ref_0 = join_ent_0_2
                var createEntities = function(i) {
                    if (i >= entities.length) {
                        return done();
                    }
                    var entities2Add = entities[i];
                    if (i > 0) {
                        var j = i - 1;
                        while (j >= 0) {
                            var j_ents = entities[j];
                            for (var k = 0; k < j_ents.length; ++k) {
                                var ref_ent = j_ents[k];
                                var ent = entities2Add[k];
                                ent['ref_' + j] = ref_ent['_id'];
                            }
                            j--;
                        }
                    }

                    async.map(entities2Add, function(entity, callback) {
                        appReq.post("/api/v1/entities/join_schema_" + i)
                            .set("Content-Type", "application/json")
                            .query("populate=false")
                            .send(entity)
                            .expect(201, function(e, res) {
                                if (e) { return callback(e, null); }
                                callback(null, res.body)
                            });
                        }, function(err, result) {
                            if (err) {
                                return done(err);
                            }
                            entities[i] = result;
                            createEntities(i + 1);
                        }
                    );
                }
                createEntities(0);
            });
        });

        after(function(done) {
            var names = schemas.map(function(s) { return s.name; });
            async.map(names, schemaManager.delete.bind(schemaManager), done);
        });

        it("should fetch join_ent_1_2", function(done) {
            var query = {
                q : { "ref_0.num" : 102 }
            };
            appReq.get("/api/v1/entities/join_schema_1")
                .query(query)
                .expect(200, function(err, res) {
                    res.statusCode.should.eql(200);
                    should.exist(res.body);
                    res.body.length.should.eql(1);
                    var id = res.body[0]['_id'];
                    entities[1][2]['_id'].should.eql(id);
                    done();
                });
        });

        it("should fetch join_ent_2_1", function(done) {
            var query = {
                q :  { "ref_1.ref_0.num" : 101 }
            };
            appReq.get("/api/v1/entities/join_schema_2")
                .query(query)
                .expect(200, function(err, res) {
                    should.exist(res.body);
                    res.statusCode.should.eql(200);
                    res.body.length.should.eql(1);
                    var id = res.body[0]['_id'];
                    entities[2][1]['_id'].should.eql(id);
                    done();
                });
        });

    });
});