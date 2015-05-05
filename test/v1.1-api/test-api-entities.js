describe('@API @V1.1API - Entity API', function() {
    "use strict";

    var should = require('should');
    var async = require('async');

    var SIS = require("../../util/constants");

    var TestUtil = require('../fixtures/util');

    var ApiServer = new TestUtil.TestServer();

    it("Should setup fixtures", function(done) {
        ApiServer.start(function(e) {
            if (e) { return done(e); }
            ApiServer.becomeSuperUser(done);
        });
    });

    after(function(done) {
        ApiServer.stop(done);
    });

    describe("Entity Failure cases", function() {
        // no schemas..
        it("Should fail if type is not specified ", function(done) {
            ApiServer.get("/api/v1.1/entities").expect(404, done);
        });
        it("Should fail if type does not exist ", function(done) {
            ApiServer.get("/api/v1.1/entities/sis_dne").expect(404, done);
        });
        it("Should fail to add an entity for a dne schema", function(done) {
            ApiServer.post("/api/v1.1/entities/sis_dne")
                .set("Content-Type", "application/json")
                .send({"this" : "should", "not" : "work"})
                .expect(404, done);
        });
        it("Should fail to get an entity by id of a particular type that does not exist", function(done) {
            ApiServer.get("/api/v1.1/entities/sis_dne/some_id")
                .expect(404, done);
        });
        it("Should fail to delete an entity for dne schema", function(done) {
            ApiServer.del("/api/v1.1/entities/sis_dne/some_id")
                .expect(404, done);
        });
    });

    describe("CRUD Entity", function() {
        var schema = {
            "name":"test_entity",
            _sis : { "owner" : ["sistest"] },
            "definition": {
                "str":   "String",
                "num":   "Number",
                "date":  "Date",
                "bool":  "Boolean",
                "arr": [],
            }
        };
        before(function(done) {
            ApiServer.del('/api/v1.1/schemas/test_entity')
                .end(function() {
                ApiServer.post('/api/v1.1/schemas')
                    .send(schema).expect(201, done);
            });

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
        };

        var createEndCallback = function(done) {
            return function(err, res) {
                if (err) { return done(err); }
                should.exist(res.body);
                should.exist(res.body._id);
                if (!entityId) {
                    entityId = res.body._id;
                } else {
                    entityId.should.eql(res.body._id);
                }
                validateWithExpected(res.body);
                done();
            };
        };

        it("Should add the entity ", function(done) {
            ApiServer.post("/api/v1.1/entities/" + schema.name)
                .set('Content-Type', 'application/json')
                .send(expectedEntity)
                .expect(201)
                .end(createEndCallback(done));
        });

        it("Should retrieve the added entity ", function(done) {
            ApiServer.get("/api/v1.1/entities/" + schema.name + "/" + entityId)
                .set('Content-Type', 'application/json')
                .expect(200, createEndCallback(done));
        });

        it("Should update the str to foobar ", function(done) {
            expectedEntity.str = "foobar";
            ApiServer.put("/api/v1.1/entities/" + schema.name + "/" + entityId)
                .set('Content-Type', 'application/json')
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
            ApiServer.post("/api/v1.1/entities/" + schema.name)
                .set('Content-Type', 'application/json')
                .send(invalid)
                .expect(400, function(e, r) {
                    done();
                });
        });
        it("Should delete the added entity", function(done) {
            ApiServer.del("/api/v1.1/entities/" + schema.name + "/" + entityId)
                .expect(200, done);
        });
        it("Should fail to add an entity with _id", function(done) {
            expectedEntity._id = 'foobar';
            ApiServer.post("/api/v1.1/entities/" + schema.name)
                .set("Content-Type", "application/json")
                .send(expectedEntity)
                .expect(400, done);
        });
        it("Should fail to update an entity that doesn't exist", function(done) {
            delete expectedEntity._id;
            ApiServer.put("/api/v1.1/entities/" + schema.name + "/foobar")
                .set("Content-Type", "application/json")
                .send(expectedEntity)
                .expect(404, done);
        });
        it("Should fail to delete entity that doesn't exist", function(done) {
            ApiServer.del("/api/v1.1/entities/" + schema.name + "/some_id")
                .expect(404, done);
        });
        it("Should fail to add an empty entity", function(done) {
            ApiServer.post("/api/v1.1/entities/" + schema.name)
                .set("Content-Type", "application/json")
                .send({})
                .expect(400, done);
        });
    });

    describe("Partial entity updates", function() {
        var schema = {
            "name":"test_nested_entity",
            _sis : { "owner" : ["sistest"] },
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
            ApiServer.del("/api/v1.1/schemas/" + schema.name)
                .end(function() {
                ApiServer.post('/api/v1.1/schemas')
                    .send(schema).expect(201, function(err, result) {
                    if (err) { done(err, result); return; }
                    ApiServer.post("/api/v1.1/entities/test_nested_entity")
                        .set("Content-Type", "application/json")
                        .send(entity)
                        .expect(201, function(err, res) {

                        entity = res.body;
                        should.exist(entity);
                        should.exist(entity.nested_obj);
                        should.exist(entity.nested_obj.obj2);
                        should.exist(entity.nested_obj.obj2.name);
                        done(err, result);
                    });
                });
            });
        });
        after(function(done) {
            ApiServer.del("/api/v1.1/schemas/" + schema.name)
                      .expect(200, done);
        });
        it("Should update nested_obj.obj2.name only", function(done) {
            entity.nested_obj.obj2.name = "hello";
            ApiServer.put("/api/v1.1/entities/test_nested_entity/" + entity._id)
                .set("Content-Type", "application/json")
                .send({"nested_obj" : { "obj2" : { "name" : "hello" } } })
                .expect(200, function(err, result) {
                    result = result.body;
                    delete entity._sis;
                    delete result._sis;
                    result.should.eql(entity);
                    done(err, result);
                });
        });
        it("Should update delete 'crazy' from mixed_obj and add 'awesome'", function(done) {
            delete entity.mixed_obj.crazy;
            entity.mixed_obj.awesome = 'here';
            ApiServer.put("/api/v1.1/entities/test_nested_entity/" + entity._id)
                .set("Content-Type", "application/json")
                .send({"mixed_obj" : {"crazy" : null, "awesome" : "here"}})
                .expect(200, function(err, result) {
                    result = result.body;
                    delete entity._sis;
                    delete result._sis;
                    result.should.eql(entity);
                    done(err, result);
                });
        });
        it("Should change the type of mixed_obj to a string", function(done) {
            entity.mixed_obj = "random string";
            ApiServer.put("/api/v1.1/entities/test_nested_entity/" + entity._id)
                .set("Content-Type", "application/json")
                .send({"mixed_obj" : "random string"})
                .expect(200, function(err, result) {
                    result = result.body;
                    delete entity._sis;
                    delete result._sis;
                    result.should.eql(entity);
                    done(err, result);
                });
        });
        it("Should change type of mixed_obj to a dict again", function(done) {
            entity.mixed_obj = { "key" : "value" };
            ApiServer.put("/api/v1.1/entities/test_nested_entity/" + entity._id)
                .set("Content-Type", "application/json")
                .send({"mixed_obj" : entity.mixed_obj })
                .expect(200, function(err, result) {
                    result = result.body;
                    delete entity._sis;
                    delete result._sis;
                    result.should.eql(entity);
                    done(err, result);
                });
        });
    });

    describe("Entity locking", function() {
        var schema = {
            "name":"test_locked_entity",
            _sis : { "owner" : ["sistest"] },
            "definition": {
                "str":   "String",
                "num":   "Number"
            }
        };
        var initial = {
            "str" : "foo",
            "num" : 20
        };
        var entityId = null;
        before(function(done) {
            ApiServer.del("/api/v1.1/schemas/" + schema.name)
                .end(function() {
                ApiServer.post('/api/v1.1/schemas')
                    .send(schema).expect(201, function(err, result) {
                    if (err) { return done(err, result); }
                    ApiServer.post("/api/v1.1/entities/test_locked_entity")
                        .send(initial)
                        .expect(201, function(err, res) {
                        var entity = res.body;
                        entityId = entity._id;
                        should.exist(entity);
                        should.exist(entity.str);
                        should.exist(entity.num);
                        should.exist(entity._sis.locked);
                        done(err, result);
                    });
                });
            });
        });
        it("should lock the entity", function(done) {
            var locked = {
                _sis : { locked : true }
            };
            ApiServer.put("/api/v1.1/entities/test_locked_entity/" + entityId)
                .send(locked).expect(200, function(err, res) {
                should.not.exist(err);
                var entity = res.body;
                should.exist(entity);
                entity.str.should.eql("foo");
                entity.num.should.eql(20);
                /* jshint expr: true */
                entity._sis.locked.should.be.ok;
                done(err, res);
            });
        });
        it("should fail to delete the entity", function(done) {
            ApiServer.del("/api/v1.1/entities/test_locked_entity/" + entityId)
                .expect(401, function(err, res) {
                    done(err, res);
                });
        });
        it("should update the entity", function(done) {
            var data = {
                str : "bar",
                num : 10
            };
            ApiServer.put("/api/v1.1/entities/test_locked_entity/" + entityId)
                .send(data).expect(200, function(err, res) {
                should.not.exist(err);
                var entity = res.body;
                should.exist(entity);
                entity.str.should.eql("bar");
                entity.num.should.eql(10);
                /* jshint expr: true */
                entity._sis.locked.should.be.ok;
                done(err, res);
            });
        });
        it("should unlock the entity", function(done) {
            var data = {
                _sis : { locked : false }
            };
            ApiServer.put("/api/v1.1/entities/test_locked_entity/" + entityId)
                .send(data).expect(200, function(err, res) {
                should.not.exist(err);
                var entity = res.body;
                should.exist(entity);
                entity.str.should.eql("bar");
                entity.num.should.eql(10);
                /* jshint expr: true */
                entity._sis.locked.should.not.be.ok;
                done(err, res);
            });
        });
        it("should delete the entity", function(done) {
            ApiServer.del("/api/v1.1/entities/test_locked_entity/" + entityId)
            .expect(200, function(err, res) {
                done(err, res);
            });
        });
        after(function(done) {
            ApiServer.del("/api/v1.1/schemas/" + schema.name)
                      .expect(200, done);
        });
    });

    describe("remove empty arrays", function() {
        var schema = {
            name : "test_empty_arrays",
            _sis : { owner : ["sistest"] },
            definition : {
                name : "String",
                arr : ["String"],
                nested : {
                    str : "String",
                    arr : ["String"],
                    deeper : [{
                        field : "String",
                        arr : ["String"]
                    }]
                }
            }
        };
        var entityUrl = "/api/v1.1/entities/" + schema.name;
        var fooDoc = { name : "foo" };
        var barDoc = { name : "bar", nested : { str : "baz" } };
        before(function(done) {
            ApiServer.del("/api/v1.1/schemas/" + schema.name)
                .end(function() {
                ApiServer.post('/api/v1.1/schemas')
                    .send(schema).expect(201, done);
            });
        });
        after(function(done) {
            ApiServer.del("/api/v1.1/schemas/" + schema.name)
                      .expect(200, done);
        });

        it("should add foo and not receive empty arrays or objects", function(done) {
            ApiServer.post(entityUrl).query({removeEmpty : true})
            .send(fooDoc).expect(201, function(err, res) {
                fooDoc = res.body;
                should.not.exist(fooDoc.arr);
                should.not.exist(fooDoc.nested);
                done();
            });
        });

        it("should add bar and not receive empty arrays", function(done) {
            ApiServer.post(entityUrl).query({removeEmpty : true})
            .send(barDoc).expect(201, function(err, res) {
                barDoc = res.body;
                should.not.exist(barDoc.arr);
                should.exist(barDoc.nested);
                should.not.exist(barDoc.nested.arr);
                should.not.exist(barDoc.nested.deeper);
                done();
            });
        });

        it("should retrieve foo with empty arrays", function(done) {
            ApiServer.get(entityUrl + "/" + fooDoc._id)
            .expect(200, function(err, res) {
                var doc = res.body;
                should.exist(doc.arr);
                should.exist(doc.nested);
                should.exist(doc.nested.arr);
                should.exist(doc.nested.deeper);
                done();
            });
        });

        it("should update foo and show non empty arrays", function(done) {
            ApiServer.put(entityUrl + "/" + fooDoc._id)
            .query({ removeEmpty : true })
            .send({ arr : ["str"] }).expect(200, function(err, res) {
                var doc = res.body;
                should.exist(doc.arr);
                should.not.exist(doc.nested);
                done();
            });
        });
    });

    describe("CAS operations", function() {

        var schema = {
            name : "test_cas_entity",
            _sis : { owner : ["sistest"] },
            definition : {
                name : "String",
                num : "Number"
            }
        };
        var entityUrl = "/api/v1.1/entities/" + schema.name;
        var doc = { name : "CAStest", num : 0 };
        before(function(done) {
            ApiServer.del("/api/v1.1/schemas/" + schema.name)
                .end(function() {
                ApiServer.post('/api/v1.1/schemas')
                .send(schema).expect(201, function(err, res) {
                    // add the entity
                    ApiServer.post(entityUrl).send(doc)
                    .expect(201, function(err, res) {
                        doc = res.body;
                        done(err);
                    });
                });
            });
        });
        after(function(done) {
            ApiServer.del("/api/v1.1/schemas/" + schema.name)
                      .expect(200, done);
        });

        it("should error on non object cas", function(done) {
            var casOp = 1;
            var update = { num : 1 };
            ApiServer.put(entityUrl + '/' + doc._id)
            .query({ cas : casOp }).send(update)
            .expect(400, done);
        });

        it("should error on array cas", function(done) {
            var casOp = [1,2,3];
            var update = { num : 1 };
            ApiServer.put(entityUrl + '/' + doc._id)
            .query({ cas : casOp }).send(update)
            .expect(400, done);
        });

        it("should error on empty cas", function(done) {
            var update = { num : 1 };
            ApiServer.put(entityUrl + '/' + doc._id)
            .query({ cas : "{}" }).send(update)
            .expect(400, done);
        });

        it("should update with cas object", function(done) {
            var casOp = { num : doc.num };
            var update = { num : 1 };
            ApiServer.put(entityUrl + '/' + doc._id)
            .query({ cas : casOp }).send(update)
            .expect(200, function(err, res) {
                should.not.exist(err);
                should.exist(res.body.num);
                res.body.num.should.eql(1);
                doc = res.body;
                done();
            });
        });

        it("should update with cas string", function(done) {
            var casOp = JSON.stringify({ num : doc.num });
            var update = { num : 2 };
            ApiServer.put(entityUrl + '/' + doc._id)
            .query({ cas : casOp }).send(update)
            .expect(200, function(err, res) {
                should.not.exist(err);
                should.exist(res.body.num);
                res.body.num.should.eql(2);
                doc = res.body;
                done();
            });
        });

        it("should succeed only once", function(done) {
            var casOp = { num : doc.num };
            var aggregate = {
                doc : null,
                success : [],
                error : []
            };
            var createUpdateFunc = function(num) {
                return  function(callback) {
                    ApiServer.put(entityUrl + '/' + doc._id)
                    .query({ cas : casOp }).send({ num : num })
                    .end(function(err, res) {
                        if (res.statusCode == 200) {
                            aggregate.doc = res.body;
                            aggregate.success.push(num);
                        } else {
                            aggregate.error.push(num);
                        }
                        callback(null, aggregate);
                    });
                };
            };
            var NUM_QUERIES = 10;
            var tasks = [];
            for (var i = 0; i < NUM_QUERIES; ++i) {
                // add 100 to ensure no repeats.
                tasks.push(createUpdateFunc(i + 100));
            }
            async.parallel(tasks, function(err, res) {
                should.not.exist(err);
                aggregate.success.length.should.eql(1);
                aggregate.error.length.should.eql(NUM_QUERIES - 1);
                aggregate.success[0].should.eql(aggregate.doc.num);
                doc = aggregate.doc[0];
                done();
            });
        });

    });

});
