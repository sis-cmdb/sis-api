describe('@API @V1.1API - Entity References', function() {
    "use strict";

    var should = require('should');
    var async = require('async');
    var BPromise = require('bluebird');

    var SIS = require("../../util/constants");

    var TestUtil = require('../fixtures/util');

    var ApiServer = new TestUtil.TestServer();

    before(function(done) {
        ApiServer.start(function(e) {
            if (e) { return done(e); }
            ApiServer.becomeSuperUser(done);
        });
    });

    after(function(done) {
        ApiServer.stop(done);
    });

    var addSchema = function(schema, callback) {
        ApiServer.del('/api/v1.1/schemas/' + schema.name)
            .end(function() {
            ApiServer.post('/api/v1.1/schemas')
                .send(schema).expect(201, callback);
        });
    };

    var deleteSchema = function(name, callback) {
        ApiServer.del('/api/v1.1/schemas/' + name)
            .expect(200, callback);
    };

    describe("Array references", function() {

        var schema_1 = {
            "name" : "ref_1",
            _sis : { "owner" : ["entity_test"] },
            "definition" : {
                "name" : "String"
            }
        };

        var schema_2 = {
            "name" : "ref_2",
            _sis : { "owner" : ["entity_test"] },
            "definition" : {
                "name" : "String",
                "refs" : [{ type : "ObjectId", ref : "ref_1"}]
            }
        };

        var schema_3 = {
            "name" : "ref_3",
            _sis : { "owner" : ["entity_test"] },
            "definition" : {
                "name" : "String"
            }
        };

        var schema_4 = {
            "name" : "ref_4",
            _sis : { "owner" : ["entity_test"] },
            "definition" : {
                "name" : "String",
                "ref" : { type : "ObjectId", ref : "ref_1" },
                "ref_multi" : [{ type : "ObjectId", ref : "ref_1" }]
            }
        };

        var schema_5 = {
            name : "ref_5",
            _sis : { "owner" : ["entity_test"] },
            definition : {
                name : "String",
                embedded_docs : [{
                    e_name : "String",
                    refs : [
                        { type : "ObjectId", ref : "ref_1" }
                    ]
                }]
            }
        };

        var schemas = [schema_1, schema_2, schema_3, schema_4, schema_5];
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
                async.map(['foo', 'bar', 'baz', 'qux', 'quux'], function(name, callback) {
                    req.post("/api/v1.1/entities/ref_1")
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

                            req.post("/api/v1.1/entities/ref_3")
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
            ApiServer.get("/api/v1.1/schemas/ref_2")
                .expect(200, function(err, res) {
                should.not.exist(err);
                var schema = res.body;
                should.exist(schema._sis[SIS.FIELD_REFERENCES]);
                schema._sis[SIS.FIELD_REFERENCES].length.should.eql(1);
                schema._sis[SIS.FIELD_REFERENCES][0].should.eql('ref_1');
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
            ApiServer.post("/api/v1.1/entities/ref_2")
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
            req.post("/api/v1.1/entities/ref_2")
                .set("Content-Type", "application/json")
                .send(entity)
                .expect(201, function(err, result) {
                    should.not.exist(err);
                    result = result.body;
                    var id = result._id;
                    req.get("/api/v1.1/entities/ref_2/" + id)
                        .expect(200, function(e, r) {
                            should.not.exist(e);
                            result = r.body;
                            should.exist(result.refs);
                            should.exist(result.refs[0]);
                            should.exist(result.refs[0].name);
                            done();
                        });
                });
        });

        it("should be able to update arrays of refs", function(done) {
            var good_refs = entities.ref_1;
            var ids = [good_refs[0]._id, good_refs[1]._id];
            var entity = {
                'name' : 'good_ref_2_update',
                'refs' : []
            };
            var req = ApiServer;
            req.post("/api/v1.1/entities/ref_2")
                .set("Content-Type", "application/json")
                .send(entity)
                .expect(201, function(err, result) {
                should.not.exist(err);
                // update the doc
                result = result.body;
                result.refs = ids;
                req.put("/api/v1.1/entities/ref_2/" + result._id)
                   .set("Content-Type", "application/json")
                   .send(result)
                   .expect(200, function(e, r) {
                    should.not.exist(e);
                    r = r.body;
                    should.exist(r.refs);
                    should.exist(r.refs[0]);
                    should.exist(r.refs[1]);
                    done();
                });
            });
        });

        it("should be able to update a ref with null", function(done) {
            var good_refs = entities.ref_1;
            var ids = [good_refs[0]._id, good_refs[1]._id];
            var entity = {
                'name' : 'good_ref_2_update',
                'refs' : ids
            };
            var req = ApiServer;
            req.post("/api/v1.1/entities/ref_2")
                .set("Content-Type", "application/json")
                .send(entity)
                .expect(201, function(err, result) {
                should.not.exist(err);
                // update the doc
                result = result.body;
                result.refs = [null, ids[0]];
                req.put("/api/v1.1/entities/ref_2/" + result._id)
                   .set("Content-Type", "application/json")
                   .send(result)
                   .expect(200, function(e, r) {
                    should.not.exist(e);
                    r = r.body;
                    should.exist(r.refs);
                    should.not.exist(r.refs[0]);
                    should.exist(r.refs[1]);
                    done();
                });
            });
        });

        var savedS5 = null;

        it("should add items in an array of embedded docs containing arrays of refs", function(done) {
            var docs = [];
            var good_refs = entities.ref_1;
            entities.ref_1.forEach(function(r, idx) {
                docs.push({
                    e_name : "d" + idx,
                    refs : [r._id]
                });
            });
            var s5Item = {
                name : "s5_test",
                embedded_docs : docs
            };
            ApiServer.post("/api/v1.1/entities/ref_5")
            .send(s5Item).expect(201, function(e, r) {
                if (e) { return done(e); }
                savedS5 = r.body;
                done();
            });
        });

        it("should update items in an array of embedded docs containing arrays of refs", function(done) {
            var good_refs = entities.ref_1;
            savedS5.embedded_docs.forEach(function(ed, idx) {
                var ref_to_push = good_refs[(idx + 1) % good_refs.length];
                ed.refs.push(ref_to_push._id);
                // add a dupe
                ed.refs.push(ed.refs[0]);
            });
            ApiServer.put("/api/v1.1/entities/ref_5/" + savedS5._id)
                .send(savedS5).expect(200, done);
        });
    });

    describe("Non existent schemas", function() {

        var schema1 = {
            name : "test_populate_schema_1",
            _sis : { owner : ["sistest"] },
            definition : {
                name : "String",
                other : { type : "ObjectId", ref : "test_populate_schema_2" }
            }
        };

        var schema2 = {
            name : "test_populate_schema_2",
            _sis : { owner : ["sistest"] },
            definition : {
                name : "String"
            }
        };

        before(function(done) {
            addSchema(schema1, function(err, res) {
                if (err) { return done(err); }
                // add an entity
                ApiServer.post("/api/v1.1/entities/test_populate_schema_1")
                    .send({ name : "test"}).expect(201, done);
            });
        });

        it("should fetch entities without test_populate_schema_2", function(done) {
            ApiServer.get("/api/v1.1/entities/test_populate_schema_1")
                .expect(200, function(err, res) {
                should.not.exist(err);
                res = res.body;
                res.should.be.instanceof(Array);
                res.length.should.eql(1);
                done();
            });
        });

    });

    describe("Subdocs and arrays", function() {

        var mongoose = require('mongoose');
        mongoose.Promise = BPromise;
        // need to test arrays of sub docs, arrays of object ids
        // and arrays of object ids -> sub array field
        var leaf_schema = {
            _sis : { "owner" : ["entity_test"] },
            "name" : "ref_leaf_schema",
            "definition" : {
                "name" : "String",
                "num" : "Number"
            }
        };

        var ancestor_schema = {
            _sis : { "owner" : ["entity_test"] },
            name : "ref_ancestor_schema",
            definition : {
                name : "String",
                num : "Number",
                leaves : [
                    { type : "ObjectId", ref : "ref_leaf_schema" }
                ],
                leaf_docs : [
                    {
                        doc_name : "String",
                        leaf : { type : "ObjectId", ref : "ref_leaf_schema" }
                    }
                ]
            }
        };

        var numLeaves = 200;
        var LEAVES = null;
        // create leaves 0 - numLeaves
        var createLeaves = function() {
            var totalLeaves = numLeaves;
            var items = [];
            for (var i = 0; i < totalLeaves; ++i) {
                items.push({
                    name : "leaf_" + i,
                    num : i
                });
            }
            var d = BPromise.pending();
            ApiServer.post("/api/v1.1/entities/" + leaf_schema.name)
            .send(items).expect(200, function(err, res) {
                if (err) { return d.reject(err); }
                res.body.success.length.should.eql(totalLeaves);
                LEAVES = res.body.success.map(function(l) {
                    return l._id;
                });
                d.resolve(LEAVES);
            });
            return d.promise;
        };

        before(function(done) {
            // delete/create all the schemas
            var promises = [leaf_schema, ancestor_schema].map(function(schema) {
                var d = BPromise.pending();
                var url = "/api/v1.1/schemas";
                ApiServer.del(url + '/' + schema.name).end(function() {
                    ApiServer.post(url).send(schema).expect(201, function(err, res) {
                        if (err) { return d.reject(err); }
                        d.resolve(res);
                    });
                });
                return d.promise;
            });
            BPromise.all(promises).then(function() {
                return createLeaves();
            }).then(function() { done(); }).catch(done);
        });

        var getDneObjectId = function() {
            var dneObjId = mongoose.Types.ObjectId();
            var hasObjId = function(id) {
                return LEAVES.filter(function(l) {
                    return l._id == dneObjId;
                }).length > 0;
            };
            while (hasObjId(dneObjId)) {
                dneObjId = mongoose.Types.ObjectId();
            }
            return dneObjId;
        };

        var getLeaves = function(i, num, dne) {
            var result = [];
            for (var k = i; k < (i + num); ++k) {
                if (dne) {
                    result.push(getDneObjectId());
                } else {
                    var leaf = LEAVES[k % LEAVES.length];
                    result.push(leaf);
                }
            }
            return result;
        };

        var ANC_URL = "/api/v1.1/entities/" + ancestor_schema.name;

        it("Should fail to create the ancestor via leaves", function(done) {
            var oid = getDneObjectId();
            var anc = {
                name : "anc_1",
                leaves : [oid]
            };
            ApiServer.post(ANC_URL).send(anc).expect(400, done);
        });

        it("Should fail to create the ancestor via leaf_docs", function(done) {
            var oid = getDneObjectId();
            var anc = {
                name : "anc_2",
                leaves : [LEAVES[0], LEAVES[1]],
                leaf_docs : [
                    {
                        doc_name : "exists",
                        leaf : LEAVES[2]
                    },
                    {
                        doc_name : "foo",
                        leaf : oid
                    }
                ]
            };
            ApiServer.post(ANC_URL).send(anc).expect(400, done);
        });
    });

    describe("Bulk operations", function() {

        var mongoose = require('mongoose');
        mongoose.Promise = BPromise;
        // need to test arrays of sub docs, arrays of object ids
        // and arrays of object ids -> sub array field
        var leaf_schema = {
            _sis : { "owner" : ["entity_test"] },
            "name" : "ref_leaf_schema",
            "definition" : {
                "name" : "String",
                "num" : "Number"
            }
        };

        var leaf_schema_2 = {
            _sis : { "owner" : ["entity_test"] },
            "name" : "ref_leaf_schema_2",
            "definition" : {
                "name" : "String",
                "num" : "Number"
            }
        };

        var ancestor_schema = {
            _sis : { "owner" : ["entity_test"] },
            name : "ref_ancestor_schema",
            definition : {
                name : "String",
                num : "Number",
                leaves : [
                    { type : "ObjectId", ref : "ref_leaf_schema" }
                ],
                leaf_docs : [
                    {
                        doc_name : "String",
                        leaf : { type : "ObjectId", ref : "ref_leaf_schema_2" }
                    }
                ]
            }
        };

        var numLeaves = 200;
        var LEAVES = null;
        var LEAVES_2 = null;
        // create leaves 0 - numLeaves
        var createLeaves = function(schemaName) {
            var totalLeaves = numLeaves;
            var items = [];
            for (var i = 0; i < totalLeaves; ++i) {
                items.push({
                    name : "leaf_" + i,
                    num : i
                });
            }
            var d = BPromise.pending();
            ApiServer.post("/api/v1.1/entities/" + schemaName)
            .send(items).expect(200, function(err, res) {
                if (err) { return d.reject(err); }
                res.body.success.length.should.eql(totalLeaves);
                var leaves = res.body.success.map(function(l) {
                    return l._id;
                });
                d.resolve(leaves);
            });
            return d.promise;
        };

        before(function(done) {
            // delete/create all the schemas
            var promises = [leaf_schema, leaf_schema_2, ancestor_schema].map(function(schema) {
                var d = BPromise.pending();
                var url = "/api/v1.1/schemas";
                ApiServer.del(url + '/' + schema.name).end(function() {
                    ApiServer.post(url).send(schema).expect(201, function(err, res) {
                        if (err) { return d.reject(err); }
                        d.resolve(res);
                    });
                });
                return d.promise;
            });
            BPromise.all(promises).then(function() {
                return BPromise.all([
                    createLeaves(leaf_schema.name),
                    createLeaves(leaf_schema_2.name)
                ]).then(function(results) {
                    LEAVES = results[0];
                    LEAVES_2 = results[1];
                    return results;
                });
            }).then(function() { done(); }).catch(done);
        });

        var getDneObjectId = function(coll) {
            var dneObjId = mongoose.Types.ObjectId();
            var hasObjId = function(id) {
                return coll.filter(function(l) {
                    return l._id == dneObjId;
                }).length > 0;
            };
            while (hasObjId(dneObjId)) {
                dneObjId = mongoose.Types.ObjectId();
            }
            return dneObjId;
        };

        var getLeaves = function(coll, i, num, dne) {
            var result = [];
            for (var k = i; k < (i + num); ++k) {
                if (dne) {
                    result.push(getDneObjectId(coll));
                } else {
                    var leaf = coll[k % coll.length];
                    result.push(leaf);
                }
            }
            return result;
        };

        var ANC_URL = "/api/v1.1/entities/" + ancestor_schema.name;

        it("Should work with bulks", function(done) {
            var items = [];
            for (var i = 0; i < 1000; ++i) {
                var leaves = getLeaves(LEAVES, i, 2);
                var leaves_2 = getLeaves(LEAVES_2, i, 2);
                var item = {
                    name : "bulk_anc_" + i,
                    leaves : [leaves[0], leaves[1]],
                    leaf_docs : [
                        {
                            doc_name : "doc_" + i,
                            leaf : leaves_2[0]
                        },
                        {
                            doc_name : "doc_" + (i + 1),
                            leaf : leaves_2[1]
                        }
                    ]
                };
                items.push(item);
            }

            ApiServer.post(ANC_URL).send(items).expectAsync(200)
            .then(function(res) {
                var result = JSON.parse(res[0].text);
                should.exist(result.success);
                result.success.length.should.eql(items.length);
                done();
            }).catch(done);
        });

        it("Should return errors with bulks", function(done) {
            var items = [];
            for (var i = 0; i < 1000; ++i) {
                var leaves = getLeaves(LEAVES, i, 2, i % 2 === 0);
                var leaves_2 = getLeaves(LEAVES_2, i, 2);
                var item = {
                    name : "bulk_anc_" + i,
                    leaves : [leaves[0], leaves[1]],
                    leaf_docs : [
                        {
                            doc_name : "doc_" + i,
                            leaf : leaves_2[0]
                        },
                        {
                            doc_name : "doc_" + (i + 1),
                            leaf : leaves_2[1]
                        }
                    ]
                };
                items.push(item);
            }

            ApiServer.post(ANC_URL).send(items).expectAsync(200)
            .then(function(res) {
                var result = JSON.parse(res[0].text);
                should.exist(result.success);
                result.success.length.should.eql(items.length / 2);
                result.errors.length.should.eql(items.length / 2);
                done();
            }).catch(done);
        });


    });

});
