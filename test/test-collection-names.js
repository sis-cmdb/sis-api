describe("Mongo Collection Naming", function() {
    "use strict";

    var should = require('should');
    var util = require('util');
    var async = require('async');

    var SIS = require("../util/constants");
    var config = require('./fixtures/config');
    var TestUtil = require('./fixtures/util');
    var LocalTest = new TestUtil.LocalTest();
    var schemaManager = null;

    before(function(done) {
        LocalTest.start(config, function(err, mongoose) {
            schemaManager = require("../util/schema-manager")(mongoose, { auth : true });
            done(err);
        });
    });

    after(function(done) {
        LocalTest.stop(done);
    });

    describe("Schemas with plural and non plural", function() {

        var schemas = [
            {
                name : "name_test_site",
                owner : ["sistest"],
                definition : {
                    name : "String",
                    short_name : "String"
                }
            },
            {
                name : "name_test_sites",
                owner : ["sistest"],
                definition : {
                    name : "String",
                    short_name : "String"
                }
            }
        ];

        var entityManagers = { };


        before(function() {
            var opts = { };
            opts[SIS.OPT_SCHEMA_MGR] = schemaManager;
            opts[SIS.OPT_ID_FIELD] = '_id';
            opts[SIS.OPT_USE_AUTH] = false;
            schemas.forEach(function(schema) {
                var model = schemaManager.getEntityModel(schema);
                should.exist(model);
                entityManagers[schema.name] = require('../util/entity-manager')(model, schema, opts);
            });
        });

        it("should add 5 entities to each", function(done) {
            var items = [1, 2, 3, 4, 5];
            var tasks = schemas.map(function(s) {
                var em = entityManagers[s.name];
                var objs = items.map(function(num) {
                    return {
                        name : s.name + "_" + num,
                        short_name : s.name + "_short_" + num
                    };
                });
                return function(cb) {
                    async.map(objs, function(obj, ocb) {
                        em.add(obj).nodeify(ocb);
                    }, cb);
                };
            });
            async.parallel(tasks, done);
        });

        it("should only have 5 entities in each", function(done) {
            var tasks = schemas.map(function(s) {
                var em = entityManagers[s.name];
                return function(cb) {
                    em.model.find({}, function(err, res) {
                        should.not.exist(err);
                        res.length.should.eql(5);
                        cb(null, res);
                    });
                };
            });
            async.parallel(tasks, done);
        });

        it("should have 2 different mongo collections with 5 items each", function(done) {
            var mongoose = schemaManager.mongoose;
            var db = mongoose.connection.db;
            var tasks = schemas.map(function(s) {
                return function(cb) {
                    db.collectionNames(s.name, function(err, items) {
                        should.not.exist(err);
                        items.length.should.eql(1);
                        db.collection(s.name).find().toArray(function(err, res) {
                            should.not.exist(err);
                            res.length.should.eql(5);
                            cb(null);
                        });
                    });
                };
            });
            async.series(tasks, done);
        });

    });

});
