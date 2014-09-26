describe('Convert from v1 to v1.1', function() {
    "use strict";

    var should = require('should');
    var Promise = require('bluebird');

    var SIS = require("../util/constants");
    var config = require('./fixtures/config');
    var TestUtil = require('./fixtures/util');

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

    describe("Utility methods", function() {
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
