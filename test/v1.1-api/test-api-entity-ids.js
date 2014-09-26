describe('@API @V1.1API - Entity ID fields', function() {
    "use strict";

    var should = require('should');
    var Promise = require('bluebird');

    var SIS = require("../../util/constants");
    var config = require('../fixtures/config');
    var TestUtil = require('../fixtures/util');

    var ApiServer = new TestUtil.TestServer();

    it("Should setup fixtures", function(done) {
        ApiServer.start(config, function(e) {
            if (e) { return done(e); }
            ApiServer.becomeSuperUser(done);
        });
    });

    after(function(done) {
        ApiServer.stop(done);
    });

    describe("Schemas with ID fields", function() {
        var schema = {
            name : "test_schema_id_field",
            id_field : "name",
            _sis : { owner : ["sistest"] },
            definition : {
                name : { type : "String", required : true, unique : true },
                short_name : { type : "String", required : true, unique : true },
                other : "String"
            }
        };

        var entities = [];

        before(function(done) {
            ApiServer.del('/api/v1.1/schemas/test_schema_id_field')
                .end(done);
        });

        after(function(done) {
            ApiServer.del('/api/v1.1/schemas/test_schema_id_field')
                .end(done);
        });

        it("Should add the schema", function(done) {
            ApiServer.post("/api/v1.1/schemas")
                .set("Content-type", "application/json")
                .send(schema)
                .expect(201, done);
        });

        var createEntities = function(cb) {
            var names = ['test', 'test2', 'test3'];
            var data = names.map(function(n) {
                return {
                    name : n,
                    short_name : n + '_short',
                    other : 'test'
                };
            });
            var d = Promise.pending();
            ApiServer.post('/api/v1.1/entities/test_schema_id_field')
            .send(data)
            .expect(200, function(err, res) {
                if (err) {
                    return d.reject(err);
                }
                try {
                    should.exist(res.body);
                    should.exist(res.body.success);
                    should.exist(res.body.errors);
                    res.body.success.should.be.instanceof(Array);
                    res.body.success.length.should.eql(data.length);
                    res.body.errors.should.be.instanceof(Array);
                    res.body.errors.length.should.eql(0);
                    d.resolve(res.body.success);
                } catch (e) {
                    d.reject(e);
                }
            });
            return d.promise;
        };

        var fetchUpdateAndDelete = function(e, field) {
            var url = '/api/v1.1/entities/test_schema_id_field/' + e[field];
            var d = Promise.pending();
            ApiServer.get(url).expect(200, function(err, res) {
                if (err) { return d.reject(err); }
                if (res.body._id != e._id) {
                    return d.reject('ID mismatch');
                }
                // fetch by _id should always work
                var idUrl = '/api/v1.1/entities/test_schema_id_field/' + e._id;
                ApiServer.get(idUrl).expect(200, function(err, res) {
                    if (err) { return d.reject(err); }
                    if (res.body._id != e._id) {
                        return d.reject('ID mismatch');
                    }
                    // update
                    var updateObj = res.body;
                    updateObj.other = 'update';
                    ApiServer.put(url).send(updateObj)
                    .expect(200, function(err, res) {
                        if (err) { return d.reject(err); }
                        if (res.body._id != e._id ||
                            res.body.other != 'update') {
                            return d.reject("ID Mismatch or field not updated.");
                        }
                        // issue a cas update
                        updateObj = res.body;
                        updateObj.other = 'cas_update';
                        var casOp = { other : 'update' };
                        ApiServer.put(url).send(updateObj).query({ cas : casOp })
                        .expect(200, function(err, res) {
                            if (err) { return d.reject(err); }
                            if (res.body._id != e._id ||
                                res.body.other != 'cas_update') {
                                return d.reject("ID Mismatch or field not updated.");
                            }
                            // delete
                            ApiServer.del(url).expect(200, function(err, res) {
                                if (err) {
                                    return d.reject(err);
                                }
                                d.resolve(true);
                            });
                        });
                    });
                });
            });
            return d.promise;
        };

        var createAndVerify = function(field, done) {
            createEntities().then(function(entities) {
                return Promise.map(entities, function(e) {
                    return fetchUpdateAndDelete(e, field);
                }).then(function(res) {
                    done();
                });
            }).catch(function(err) {
                done(err);
            });

        };

        it("Should fetch entities by name", function(done) {
            createAndVerify('name', done);
        });

        it("Should 404 on a non existent entity", function(done) {
            ApiServer.get("/api/v1.1/entities/test_schema_id_field/foobar")
            .expect(404, done);
        });

        it("Should fail to update to a bad ID field", function(done) {
            var update = JSON.parse(JSON.stringify(schema));
            update.id_field = 'other';
            ApiServer.put("/api/v1.1/schemas/test_schema_id_field")
                .send(update)
                .expect(400, done);

        });

        it("Should fail to change attributes on name", function(done) {
            var update = JSON.parse(JSON.stringify(schema));
            update.definition.name = "String";
            ApiServer.put("/api/v1.1/schemas/test_schema_id_field")
                .send(update)
                .expect(400, done);
        });

        it("Should update to a valid id field", function(done) {
            var update = JSON.parse(JSON.stringify(schema));
            update.id_field = 'short_name';
            ApiServer.put("/api/v1.1/schemas/test_schema_id_field")
                .send(update)
                .expect(200, function(err, res) {
                    should.not.exist(err);
                    res.body.id_field.should.eql('short_name');
                    done();
                });
        });

        it("Should fetch by short_name", function(done) {
            createAndVerify('short_name', done);
        });

        it("Should 404 on a non existent entity again", function(done) {
            ApiServer.get("/api/v1.1/entities/test_schema_id_field/foobar_short")
            .expect(404, done);
        });

        it("Should reset the id field to _id", function(done) {
            var update = JSON.parse(JSON.stringify(schema));
            update.id_field = null;
            ApiServer.put("/api/v1.1/schemas/test_schema_id_field")
                .send(update)
                .expect(200, function(err, res) {
                    should.not.exist(err);
                    res.body.id_field.should.eql('_id');
                    done();
                });
        });

        it("Should fetch entities by _id", function(done) {
            createAndVerify('_id', done);
        });

    });

});
