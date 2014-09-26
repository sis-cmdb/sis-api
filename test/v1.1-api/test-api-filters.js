describe('@API @V1.1API - Filtering API', function() {
    "use strict";

    var should = require('should');
    var async = require('async');

    var SIS = require("../../util/constants");
    var config = require('../fixtures/config');
    var TestUtil = require('../fixtures/util');

    var ApiServer = new TestUtil.TestServer();

    var schema = {
        "name":"test_api_filters",
        _sis : { "owner" : ["test_g1"] },
        "definition": {
            "str" : "String",
            "num": "Number",
            "b" : "Boolean"
        }
    };

    var NUM_ITEMS = 15;

    var createItems = function(start, num) {
        var result = [];
        for (var i = start; i < (start + num); ++i) {
            result.push({ num: i, str : "foo_" + i, b : i % 3 > 0 });
        }
        return result;
    };

    after(function(done) {
        ApiServer.stop(done);
    });

    it("Should setup fixtures", function(done) {
        ApiServer.start(config, function(e) {
            if (e) { return done(e); }
            ApiServer.becomeSuperUser(function(e) {
                if (e) { return done(e); }
                ApiServer.del('/api/v1.1/schemas/' + schema.name)
                .end(function() {
                    ApiServer.post('/api/v1.1/schemas')
                    .send(schema).expect(201, function(e) {
                        if (e) { return done(e); }
                        var items = createItems(0, NUM_ITEMS);
                        ApiServer.post("/api/v1.1/entities/" + schema.name)
                        .send(items)
                        .expect(200, function(err, res) {
                            should.not.exist(err);
                            res.body.success.length.should.eql(NUM_ITEMS);
                            res.body.success.forEach(function(i) {
                                should.exist(i._id);
                            });
                            done();
                        });
                    });
                });
            });
        });
    });

    var runQuery = function(queryObj, numExpected, done) {
        ApiServer.get("/api/v1.1/entities/" + schema.name)
        .query({ q : JSON.stringify(queryObj) }).expect(200, function(err, res) {
            should.not.exist(err);
            res = res.body;
            res.length.should.eql(numExpected);
            done();
        });
    };

    it("Should fetch all objects with $gte", function(done) {
        var query = { num : { $gte : 0 }};
        runQuery(query, NUM_ITEMS, done);
    });

    it("Should fetch all objects where b is false", function(done) {
        var query = { b : false };
        runQuery(query, NUM_ITEMS / 3, done);
    });

    it("Should fetch all objects with $exists", function(done) {
        var queryObj = { 'str' : { '$exists' : true }};
        runQuery(queryObj, NUM_ITEMS, done);
    });


});
