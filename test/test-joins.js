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

describe('@API - Entity Join API', function() {
    var SIS = require("../util/constants");
    var config = require('./fixtures/config');
    var should = require('should');
    var TestUtil = require('./fixtures/util');
    var ApiServer = new TestUtil.TestServer();
    var async = require('async');

    before(function(done) {
        ApiServer.start(config, function(e) {
            if (e) { return done(e); }
            ApiServer.becomeSuperUser(done);
        });
    });

    after(function(done) {
        ApiServer.stop(done);
    });

    describe("Get entities with joins", function() {
        var schemas = [];
        var numSchemas = 3;
        var numEnts = 50;

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
                        ApiServer.post("/api/v1/entities/join_schema_" + i)
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
            async.map(names, deleteSchema, done);
        });

        it("should fetch join_ent_1_2", function(done) {
            var query = {
                q : { "ref_0.num" : 102 }
            };
            ApiServer.get("/api/v1/entities/join_schema_1")
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
            ApiServer.get("/api/v1/entities/join_schema_2")
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

        it("should fetch join_ent_2_5", function(done) {
            var query = {
                q : {
                    "num" : { "$gt" : 302 },
                    "ref_1.num" : { "$gt" : 204 },
                    "ref_1.ref_0.num" : { "$lt" : 106 }
                }
            }
            ApiServer.get("/api/v1/entities/join_schema_2")
                .query(query)
                .expect(200, function(err, res) {
                    should.exist(res.body);
                    res.statusCode.should.eql(200);
                    res.body.length.should.eql(1);
                    var id = res.body[0]['_id'];
                    entities[2][5]['_id'].should.eql(id);
                    done();
                });
        });

        it("should fetch nothing 0", function(done) {
            var query = {
                q : {
                    "num" : { "$gt" : 302 },
                    "ref_1.num" : { "$gt" : 204 },
                    "ref_1.ref_1.num" : { "$lt" : 106 }
                }
            }
            ApiServer.get("/api/v1/entities/join_schema_2")
                .query(query)
                .expect(200, function(err, res) {
                    should.exist(res.body);
                    res.statusCode.should.eql(200);
                    res.body.length.should.eql(0);
                    done();
                });
        });

        it("should fetch nothing 1", function(done) {
            var query = {
                q : {
                    "num" : { "$gt" : 302 },
                    "ref_1.num" : { "$gt" : 204 },
                    "ref_1.ref_0." : { "$lt" : 106 }
                }
            }
            ApiServer.get("/api/v1/entities/join_schema_2")
                .query(query)
                .expect(200, function(err, res) {
                    should.exist(res.body);
                    res.statusCode.should.eql(200);
                    res.body.length.should.eql(0);
                    done();
                });
        });

    });
});