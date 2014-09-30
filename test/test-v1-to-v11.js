describe('Convert from v1 to v1.1', function() {
    "use strict";

    var should = require('should');
    var Promise = require('bluebird');

    var SIS = require("../util/constants");
    var config = require('./fixtures/config');
    var TestUtil = require('./fixtures/util');

    describe("Utility methods", function() {
        var ApiServer = new TestUtil.TestServer();
        var mongoose = null;
        var sm = null;

        it("Should setup fixtures", function(done) {
            ApiServer.start(config, function(e, serverData) {
                if (e) { return done(e); }
                mongoose = serverData.mongoose;
                sm = serverData.schemaManager;
                ApiServer.becomeSuperUser(done);
            });
        });

        after(function(done) {
            ApiServer.stop(done);
        });

        it("Should remove sis fields and put then in _sis", function() {
            var item = {
                sis_tags : ["foo"],
                sis_locked : true,
                sis_immutable : false,
                owner : ['sistest'],
                name : "Foobar",
                other : "Hello",
                __v : "werd",
                _id : "some_id"
            };

            var converted = SIS.UTIL_FROM_V1(item);
            var keys = Object.keys(converted);
            keys.length.should.eql(5);
            var meta = converted[SIS.FIELD_SIS_META];
            should.exist(meta);
            meta.tags.should.eql(item.sis_tags);
            meta.locked.should.eql(item.sis_locked);
            meta.immutable.should.eql(item.sis_immutable);
            meta.owner.should.eql(item.owner);
            converted._v.should.eql(item.__v);
            for (var k in SIS.V1_TO_SIS_META) {
                should.not.exist(converted[k]);
            }
        });

        describe("Update values from V1 to V11", function() {
            var schema = {
                name : "test_upgrade_to_v11",
                _sis : { "owner" : ["sistest"] },
                definition : {
                    str :   "String"
                }
            };
            var now = Date.now();
            var item = {
                sis_tags : ["foo"],
                sis_locked : false,
                sis_immutable : false,
                owner : ['sistest'],
                str : "Foobar",
                __v : "werd",
                _created_by : "test",
                _updated_at : now,
                _created_at : now
            };

            before(function(done) {
                ApiServer.del('/api/v1.1/schemas/test_upgrade_to_v11').endAsync()
                .then(function() {
                    return ApiServer.post('/api/v1.1/schemas')
                        .send(schema).expectAsync(201);
                }).then(function(res) {
                    item._updated_by = ApiServer.getSuperCreds().username;
                    // get the entity model
                    sm.getEntityModel(res.body);
                    // add a manual entry that looks like v1
                    // insert raw document
                    var model = mongoose.models[schema.name];
                    var collection = Promise.promisifyAll(model.collection);
                    return collection.insertAsync(item);
                }).nodeify(done);

            });

            it("Should convert the RAW object to v1.1", function(done) {
                var model = mongoose.models[schema.name];
                var collection = Promise.promisifyAll(model.collection);
                collection.findOneAsync({})
                .then(function(found) {
                    if (!found) {
                        return Promise.reject("No item in collection.");
                    }
                    // found it
                    // ensure it has the raw fields
                    for (var k in item) {
                        should.exist(found[k]);
                        found[k].should.eql(item[k]);
                    }
                    should.exist(found._id);
                    // issue the update
                    var id = found._id;
                    var apiPath = "/api/v1.1/entities/" + schema.name + "/" + id;
                    var updateObj = {
                        _id : id,
                        str : "Updated"
                    };
                    return ApiServer.put(apiPath).send(updateObj).expectAsync(200)
                    .then(function(res) {
                        return res.body;
                    });
                }).then(function(updated) {
                    var keys = Object.keys(SIS.V1_TO_SIS_META);
                    keys.forEach(function(k) {
                        should.not.exist(updated[k]);
                    });
                    should.exist(updated._sis);
                    for (var k in SIS.V1_TO_SIS_META) {
                        if (k in item) {
                            if (k === SIS.FIELD_UPDATED_AT) {
                                continue;
                            }
                            var metaField = SIS.V1_TO_SIS_META[k];
                            item[k].should.eql(updated._sis[metaField]);
                        }
                    }
                    updated.str.should.eql("Updated");
                    // ensure it was converted in the DB
                    return collection.findOneAsync({});
                }).then(function(updated) {
                    var keys = Object.keys(SIS.V1_TO_SIS_META);
                    keys.forEach(function(k) {
                        should.not.exist(updated[k]);
                    });
                    should.exist(updated._sis);
                    for (var k in SIS.V1_TO_SIS_META) {
                        if (k in item) {
                            if (k === SIS.FIELD_UPDATED_AT) {
                                continue;
                            }
                            var metaField = SIS.V1_TO_SIS_META[k];
                            item[k].should.eql(updated._sis[metaField]);
                        }
                    }
                    updated.str.should.eql("Updated");
                    return Promise.resolve("Success");
                }).nodeify(done);
            });
        });
    });

    describe("Update schemas from v1 to v1.1", function(done) {
        var schemaObj = {
            "_updated_at" : 1407387816231,
            "definition" : {
                "owner" : [  "String" ],
                "model" : "String",
                "serial_number" : "String",
                "groups" : [  "String" ],
                "hostname" : "String",
                "ip" : { "type" : "String", "required" : true, "unique" : true },
                "vendor" : "String"
            },
            "name" : "netops_host",
            "_created_by" : "agavrik",
            "_updated_by" : "agavrik",
            "_created_at" : 1406204089580,
            "_references" : [ ],
            "id_field" : "ip",
             "is_open" : false,
             "track_history" : true,
             "locked_fields" : [ ],
             "owner" : [  "edgeops" ],
             "sis_locked" : true,
             "__v" : 0
        };
        var entity = {
            "_updated_at" : 1406204109121,
            "vendor" : "cisco",
            "ip" : "172.26.1.3",
            "hostname" : "r2.core-fo.brn1",
            "serial_number" : "smg1245n9hg",
            "model" : "ws-c6509-e (s72033_rp series)",
            "_created_by" : "agavrik",
            "_updated_by" : "agavrik",
            "sis_locked" : false,
            "_created_at" : 1406204109120,
            "groups" : [
                "core-net"
            ],
            "owner" : [
                "edgeops"
            ],
            "__v" : 0
        };

        // set up
        var ApiServer = new TestUtil.TestServer();

        before(function(done) {
            ApiServer.start(config, function(err, serverData) {
                var mongoose = serverData.mongoose;
                var schemasColl = Promise.promisifyAll(mongoose.connection.collection('sis_schemas'));
                var entityColl = Promise.promisifyAll(mongoose.connection.collection(schemaObj.name));
                var p1 = schemasColl.insertAsync(schemaObj);
                var p2 = entityColl.insertAsync(entity).then(function() {
                    return entityColl.findOneAsync({ ip : entity.ip }).then(function(ob) {
                        entity._id = ob._id.toString();
                        return entity;
                    });
                });
                Promise.all([p1, p2]).nodeify(function(err, res) {
                    if (err) { return done(err); }
                    ApiServer.stop(done);
                });
            });
        });

        after(function(done) {
            ApiServer.stop(done);
        });

        it("Should setup fixtures", function(done) {
            ApiServer.start(config, function(e, serverData) {
                if (e) { return done(e); }
                ApiServer.becomeSuperUser(done);
            });
        });

        it("Should update the schema", function(done) {
            var update = {
                "definition" : {
                    "owner" : [  "String" ],
                    "model" : "String",
                    "serial_number" : "String",
                    "groups" : [  "String" ],
                    "hostname" : "String",
                    "ip" : { "type" : "String", "required" : true, "unique" : true },
                    "vendor" : "String",
                    "new_field" : "String"
                },
                "name" : "netops_host",
                "owner" : ['edgeops']
            };
            ApiServer.put("/api/v1/schemas/" + update.name)
                .send(update).expect(200, function(err, res) {
                if (err) {
                    console.log(res.body);
                    return done(err);
                }
                var updated = res.body;
                should.exist(updated.definition);
                should.exist(updated.definition.new_field);
                done();
            });
        });

        it("Should update the schema again", function(done) {
            var update = {
                "definition" : {
                    "owner" : [  "String" ],
                    "model" : "String",
                    "serial_number" : "String",
                    "groups" : [  "String" ],
                    "hostname" : "String",
                    "ip" : { "type" : "String", "required" : true, "unique" : true },
                    "vendor" : "String",
                    "new_field" : "String",
                    "another_field" : "String"
                },
                "name" : "netops_host",
                "owner" : ['edgeops']
            };
            ApiServer.put("/api/v1/schemas/" + update.name)
                .send(update).expect(200, function(err, res) {
                if (err) {
                    console.log(res.body);
                    return done(err);
                }
                var updated = res.body;
                should.exist(updated.definition);
                should.exist(updated.definition.new_field);
                should.exist(updated.definition.another_field);
                done();
            });
        });

        it("Should update an entity", function(done) {
            entity.new_field = "test.";
            var id = entity._id;
            ApiServer.put("/api/v1/entities/" + schemaObj.name + '/' + id)
            .send(entity).expectAsync(200).then(function(res) {
                var updated = res.body;
                should.exist(updated.new_field);
                updated.new_field.should.eql(entity.new_field);
                return updated;
            }).nodeify(done);
        });

        it("Should upate the entity again.", function(done) {
            entity.new_field = "again";
            var id = entity._id;
            ApiServer.put("/api/v1/entities/" + schemaObj.name + '/' + id)
            .send(entity).expectAsync(200).then(function(res) {
                var updated = res.body;
                should.exist(updated.new_field);
                updated.new_field.should.eql(entity.new_field);
                return updated;
            }).nodeify(done);
        });
    });
});
