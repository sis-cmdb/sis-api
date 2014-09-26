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

describe('@API - Upsert', function() {

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

    describe("Upsert schemas", function() {
        var schema = {
            name : "test_upsert_1",
            id_field : "name",
            owner : ["sistest"],
            definition : {
                name : { type : "String", required : true, unique : true },
                short_name : { type : "String", required : true, unique : true },
                other : "String"
            }
        };

        before(function(done) {
            ApiServer.del("/api/v1/schemas/test_upsert_1").end(done);
        });

        it("Should insert the schema", function(done) {
            ApiServer.put("/api/v1/schemas/test_upsert_1")
                .query({ upsert : true }).send(schema)
                .expect(201, done);
        });

        it("Should update the schema", function(done) {
            schema.id_field = 'short_name';
            ApiServer.put("/api/v1/schemas/test_upsert_1")
                .query({ upsert : true }).send(schema)
                .expect(200, function(err, res) {
                    if (err) { return done(err); }
                    res.body.id_field.should.eql('short_name');
                    done();
                });
        });

        it("Should not insert with mismatched IDs", function(done) {
            ApiServer.put("/api/v1/schemas/test_upsert_bad")
                .query({ upsert : true }).send(schema)
                .expect(400, done);
        });

    });

    describe("Upsert entities", function() {
        var schema = {
            name : "test_upsert_2",
            owner : ["sistest"],
            definition : {
                name : { type : "String", required : true, unique : true },
                short_name : { type : "String", required : true, unique : true },
                other : "String"
            }
        };

        before(function(done) {
            ApiServer.del("/api/v1/schemas/test_upsert_2")
            .end(function(err, res) {
                ApiServer.post("/api/v1/schemas").send(schema)
                .expect(201, done);
            });
        });

        it("Should fail to upsert with no id field", function(done) {
            var entity = {
                name : "foobar",
                short_name : "foobar_short",
                other : "foobar"
            };
            ApiServer.put("/api/v1/entities/test_upsert_2/foobar")
            .query({ upsert : true }).send(entity).expect(400, done);
        });

        it("Should upsert with an id field", function(done) {
            schema.id_field = 'name';
            var entity = {
                name : "foobar",
                short_name : "foobar_short",
                other : "foobar"
            };
            ApiServer.put("/api/v1/schemas/test_upsert_2").send(schema)
            .expect(200, function(err, res) {
                should.not.exist(err);
                ApiServer.put("/api/v1/entities/test_upsert_2/foobar")
                .query({ upsert : true }).send(entity).expect(201, done);
            });
        });

        it("Should not upsert with mismatched ids", function(done) {
            var entity = {
                name : "foobar",
                short_name : "foobar_short",
                other : "foobar"
            };
            ApiServer.put("/api/v1/entities/test_upsert_2/bar")
            .query({ upsert : true }).send(entity).expect(400, done);
        });

    });

});
