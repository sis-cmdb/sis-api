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

describe('@API - Entity References', function() {
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

    var addSchema = function(schema, callback) {
        ApiServer.del('/api/v1/schemas/' + schema.name)
            .end(function() {
            ApiServer.post('/api/v1/schemas')
                .send(schema).expect(201, callback);
        });
    };

    var deleteSchema = function(name, callback) {
        ApiServer.del('/api/v1/schemas/' + name)
            .expect(200, callback);
    };

    describe("Array references", function() {

        var schema_1 = {
            "name" : "ref_1",
            "owner" : "entity_test",
            "definition" : {
                "name" : "String"
            }
        };

        var schema_2 = {
            "name" : "ref_2",
            "owner" : "entity_test",
            "definition" : {
                "name" : "String",
                "refs" : [{ type : "ObjectId", ref : "ref_1"}]
            }
        };

        var schema_3 = {
            "name" : "ref_3",
            "owner" : "entity_test",
            "definition" : {
                "name" : "String"
            }
        };

        var schema_4 = {
            "name" : "ref_4",
            "owner" : "entity_test",
            "definition" : {
                "name" : "String",
                "ref" : { type : "ObjectId", ref : "ref_1" },
                "ref_multi" : [{ type : "ObjectId", ref : "ref_1" }]
            }
        };

        var schemas = [schema_1, schema_2, schema_3, schema_4];
        var entities = {
            'ref_1' : [],
            'ref_3' : []
        };

        before(function(done) {
            // setup the schemas
            async.map(schemas, addSchema, function(err, res) {
                if (err) {
                    return done(err, res);
                }
                var req = ApiServer;
                async.map(['foo', 'bar', 'baz'], function(name, callback) {
                    entity = { "name" : name };
                    req.post("/api/v1/entities/ref_1")
                        .set("Content-Type", "application/json")
                        .query("populate=false")
                        .send({
                            "name" : name
                        })
                        .expect(201, function(err, result) {
                            if (err) {
                                return callback(err, result);
                            }
                            result = result.body;
                            entities.ref_1.push(result);

                            req.post("/api/v1/entities/ref_3")
                                .set("Content-Type", "application/json")
                                .query("populate=false")
                                .send({
                                    "name" : name
                                })
                                .expect(201, function(err, result) {
                                    if (err) { return callback(err, result); }
                                    result = result.body;
                                    entities.ref_3.push(result);
                                    return callback(null, true);
                                });
                        });
                }, function(e, r) {
                    done(e, r);
                });
            });
        });

        after(function(done) {
            var names = schemas.map(function(s) { return s.name; });
            async.map(names, deleteSchema, done);
        });


        it("ref_2 should have oid reference paths", function(done) {
            ApiServer.get("/api/v1/schemas/ref_2")
                .expect(200, function(err, res) {
                should.not.exist(err);
                var schema = res.body;
                should.exist(schema[SIS.FIELD_REFERENCES]);
                schema[SIS.FIELD_REFERENCES].length.should.eql(1);
                schema[SIS.FIELD_REFERENCES][0].should.eql('ref_1');
                done();
            });
        });

        it("should fail to add a bad ref_2", function(done) {
            var bad_refs = entities.ref_3;
            var ids = [bad_refs[0]._id, bad_refs[1]._id];
            var entity = {
                'name' : 'bad_ref_2',
                'refs' : ids
            };
            ApiServer.post("/api/v1/entities/ref_2")
                .set("Content-Type", "application/json")
                .query("populate=false")
                .send(entity)
                .expect(400, function(err, result) {
                    result.statusCode.should.eql(400);
                    done();
                });
        });

        it("should add a good ref_2", function(done) {
            var good_refs = entities.ref_1;
            var ids = [good_refs[0]._id, good_refs[1]._id];
            var entity = {
                'name' : 'good_ref_2',
                'refs' : ids
            };
            var req = ApiServer;
            req.post("/api/v1/entities/ref_2")
                .set("Content-Type", "application/json")
                .send(entity)
                .expect(201, function(err, result) {
                    should.not.exist(err);
                    result = result.body;
                    var id = result._id;
                    req.get("/api/v1/entities/ref_2/" + id)
                        .expect(200, function(e, r) {
                            result = r.body;
                            should.exist(result.refs);
                            should.exist(result.refs[0]);
                            should.exist(result.refs[0].name);
                            done();
                        });
                });
        });
    });

});