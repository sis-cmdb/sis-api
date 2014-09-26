describe('@API @V1.1API - Bulk Delete API', function() {
    "use strict";

    var should = require('should');
    var async = require('async');

    var SIS = require("../../util/constants");
    var config = require('../fixtures/config');
    var TestUtil = require('../fixtures/util');
    var AuthFixture = require("../fixtures/authdata");

    var ApiServer = new TestUtil.TestServer();

    var schema = {
        "name":"test_bulk_del_entity",
        _sis : { "owner" : ["test_g1", "test_g2"] },
        "definition": {
            "num":   { type : "Number", unique : true, required : true }
        }
    };

    it("Should setup fixtures", function(done) {
        ApiServer.start(config, function(e) {
            if (e) { return done(e); }
            ApiServer.becomeSuperUser(function(e) {
                if (e) { return done(e); }
                ApiServer.del('/api/v1.1/schemas/test_bulk_del_entity')
                .end(function() {
                    ApiServer.post('/api/v1.1/schemas')
                        .send(schema).expect(201, done);
                });
            });
        });
    });

    after(function(done) {
        ApiServer.stop(done);
    });

    var getQuery = function(start, num) {
        return {
            num : {
                $gte : start,
                $lt : (start + num)
            }
        };
    };

    var createItems = function(start, num) {
        var result = [];
        for (var i = start; i < (start + num); ++i) {
            result.push({ num: i });
        }
        return result;
    };

    var verifyDeletedItems = function(items, done) {
        async.mapSeries(items, function(item, cb) {
            var parts = [
                "/api/v1.1/entities",
                schema.name,
                item._id
            ];
            ApiServer.get(parts.join("/"))
            .expect(404, function(err, res) {
                should.not.exist(err);
                // commits
                parts.push("commits");
                ApiServer.get(parts.join("/"))
                .expect(200, function(e, r) {
                    should.not.exist(e);
                    r = r.body;
                    r.should.be.instanceof(Array);
                    r.length.should.be.eql(2);
                    r[1].action.should.eql("insert");
                    r[0].action.should.eql("delete");
                    cb(e, r.body);
                });
            });
        }, done);
    };

    it("should return a 400", function(done) {
        var start = 0, num = 50;
        var items = createItems(start, num);
        ApiServer.post("/api/v1.1/entities/" + schema.name)
            .send(items)
            .expect(200, function(err, res) {
                should.not.exist(err);
                res.body.success.length.should.eql(num);
                ApiServer.del("/api/v1.1/entities/" + schema.name)
                .expect(400, function(err, res) {
                    done(err);
                });
            });
    });

    it("should delete 150 items", function(done) {
        var start = 1000, num = 150;
        var items = createItems(start, num);
        this.timeout(num * 1000);
        ApiServer.post("/api/v1.1/entities/" + schema.name)
            .send(items)
            .expect(200, function(err, res) {
                should.not.exist(err);
                var success = res.body.success;
                success.length.should.eql(num);
                // delete all of them
                var query = { q : getQuery(start, num) };
                ApiServer.del("/api/v1.1/entities/" + schema.name)
                    .query(query)
                    .expect(200, function(err, res) {
                        should.not.exist(err);
                        should.exist(res.body.success);
                        should.exist(res.body.errors);
                        res.body.success.should.be.instanceof(Array);
                        res.body.success.length.should.be.eql(num);
                        verifyDeletedItems(res.body.success, done);
                    });
            });
    });

    it("should delete even items", function(done) {
        var start = 2000, num = 150;
        var items = createItems(start, num);
        this.timeout(num * 1000);
        ApiServer.post("/api/v1.1/entities/" + schema.name)
            .send(items)
            .expect(200, function(err, res) {
                should.not.exist(err);
                var success = res.body.success;
                success.length.should.eql(num);
                // delete all of them
                var query = {
                    q : {
                        num : { $mod : [2, 0],
                                $gte : start,
                                $lt : (start + num)
                              }
                    }
                };
                ApiServer.del("/api/v1.1/entities/" + schema.name)
                    .query(query)
                    .expect(200, function(err, res) {
                        should.not.exist(err);
                        res.body.success.should.be.instanceof(Array);
                        res.body.success.length.should.be.eql(num / 2);
                        verifyDeletedItems(res.body.success, done);
                    });
            });
    });

    describe("with Auth failures", function() {
        var users = AuthFixture.createUsers();
        var userToTokens = { };

        before(function(done) {
            AuthFixture.initUsers(ApiServer, ApiServer.authToken, users, function(err, res) {
                if (err) { return done(err); }
                AuthFixture.createTempTokens(ApiServer, userToTokens, users, done);
            });
        });

        it("should delete test_g1 entities, but not test_g2", function(done) {
            var start = 4000, num = 20;
            var items = createItems(start, num);
            var failStart = 5000;
            var failNum = 40;
            var failures = createItems(failStart, failNum);
            failures.forEach(function(f) {
                f._sis = { owner : ['test_g2'] };
            });
            var all = [].concat(items).concat(failures);
            // add as super
            this.timeout(num * 1000);
            ApiServer.post("/api/v1.1/entities/" + schema.name)
                .send(all)
                .expect(200, function(err, res) {
                    should.not.exist(err);
                    res.body.success.length.should.eql(all.length);
                    // delete all as admin1
                    var query = {
                        q : { num : { $gte : start } }
                    };
                    var token = userToTokens.admin1.name;
                    ApiServer.del("/api/v1.1/entities/" + schema.name, token)
                    .query(query)
                    .expect(200, function(err, res) {
                        should.not.exist(err);
                        res.body.success.length.should.eql(num);
                        res.body.errors.length.should.eql(failNum);
                        verifyDeletedItems(res.body.success, done);
                    });
                });
        });
    });
});
