describe('@API @V1.1API - Bulk Insert API', function() {
    "use strict";

    var should = require('should');
    var async = require('async');

    var SIS = require("../../util/constants");

    var TestUtil = require('../fixtures/util');
    var AuthFixture = require("../fixtures/authdata");

    var ApiServer = new TestUtil.TestServer();

    var schema = {
        "name":"test_bulk_entity",
        _sis : { "owner" : ["test_g1"] },
        "definition": {
            "num":   { type : "Number", unique : true, required : true }
        }
    };

    it("Should setup fixtures", function(done) {
        ApiServer.start(function(e) {
            if (e) { return done(e); }
            ApiServer.becomeSuperUser(function(e) {
                if (e) { return done(e); }
                ApiServer.del('/api/v1.1/schemas/test_bulk_entity')
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
            result.push({ "num": i });
        }
        return result;
    };

    var verifyItems = function(start, num, items, done) {
        items = items.sort(function(i1, i2) {
            return i1.num - i2.num;
        });
        for (var i = start; i < (start + num); ++i) {
            items[i - start].num.should.eql(i);
        }
        var query = {
            q : getQuery(start, num)
        };
        var asyncFunc = async.mapSeries.bind(async);
        if (process.env.SIS_REMOTE_URL) {
            asyncFunc = async.map.bind(async);
        }
        ApiServer.get("/api/v1.1/entities/" + schema.name)
        .query(query)
        .expect(200, function(err, res) {
            should.not.exist(err);
            res = res.body;
            res.should.be.instanceof(Array);
            res.length.should.eql(num);
            // ensure commits
            asyncFunc(res, function(item, cb) {
                var path = [
                    "/api/v1.1/entities",
                    schema.name,
                    item._id,
                    "commits"
                ].join("/");
                ApiServer.get(path).expect(200, function(e, r) {
                    should.not.exist(e);
                    r = r.body;
                    r.should.be.instanceof(Array);
                    r.length.should.be.eql(1);
                    var commit = r[0];
                    commit.action.should.eql("insert");
                    cb(e);
                });
            }, function(e) {
                done(e);
            });
        });
    };

    it("should return a 400", function(done) {
        ApiServer.post("/api/v1.1/entities/" + schema.name)
            .send([])
            .expect(400, function(err, res) {
                done(err);
            });
    });

    it("should add 200 items", function(done) {
        var start = 0, num = 200;
        var items = createItems(start, num);
        this.timeout(num * 1000);
        ApiServer.post("/api/v1.1/entities/" + schema.name)
            .send(items)
            .expect(200, function(err, res) {
                should.not.exist(err);
                should.exist(res.body);
                should.exist(res.body.success);
                should.exist(res.body.errors);
                res.body.success.should.be.instanceof(Array);
                res.body.success.length.should.eql(num);
                res.body.errors.should.be.instanceof(Array);
                res.body.errors.length.should.eql(0);
                verifyItems(start, num, res.body.success, done);
            });
    });

    it("should add 200 more items", function(done) {
        var start = 1000, num = 200;
        var items = createItems(start, num);
        this.timeout(num * 1000);
        ApiServer.post("/api/v1.1/entities/" + schema.name)
            .send(items)
            .expect(200, function(err, res) {
                should.not.exist(err);
                should.exist(res.body);
                should.exist(res.body.success);
                should.exist(res.body.errors);
                res.body.success.should.be.instanceof(Array);
                res.body.success.length.should.eql(num);
                res.body.errors.should.be.instanceof(Array);
                res.body.errors.length.should.eql(0);
                verifyItems(start, num, res.body.success, done);
            });
    });

    it("should fail to add any of the items", function(done) {
        var start = 2000, num = 50;
        var items = createItems(start, num);
        items = items.concat(createItems(start, num));
        ApiServer.post("/api/v1.1/entities/" + schema.name)
            .query({ all_or_none : true })
            .send(items)
            .expect(200, function(err, res) {
                should.not.exist(err);
                should.exist(res.body.success);
                should.exist(res.body.errors);
                res.body.success.length.should.eql(0);
                res.body.errors.length.should.eql(num);
                // ensure nothing was added in the DB
                var query = { q : getQuery(start, num) };
                ApiServer.get("/api/v1.1/entities/" + schema.name)
                    .query(query)
                    .expect(200, function(err, res) {
                        should.not.exist(err);
                        res.body.should.be.instanceof(Array);
                        res.body.length.should.eql(0);
                        done();
                    });
            });
    });

    it("should add some of the items", function(done) {
        var start = 3000, num = 50;
        var items = createItems(start, num);
        items = items.concat(createItems(start, num));
        ApiServer.post("/api/v1.1/entities/" + schema.name)
            .query({ all_or_none : false })
            .send(items)
            .expect(200, function(err, res) {
                should.not.exist(err);
                should.exist(res.body.success);
                should.exist(res.body.errors);
                res.body.success.length.should.eql(num);
                res.body.errors.length.should.eql(num);
                verifyItems(start, num, res.body.success, done);
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

        it("should add test_g1 entities, but not test_g2", function(done) {
            var start = 4000, num = 20;
            var items = createItems(start, num);
            var failStart = 5000;
            var failNum = 40;
            var failures = createItems(failStart, failNum);
            failures.forEach(function(f) {
                f._sis = { owner : ['test_g2'] };
            });
            var all = [].concat(items).concat(failures);
            var token = userToTokens.admin1.name;
            ApiServer.post("/api/v1.1/entities/" + schema.name, token)
                .query({ all_or_none : false })
                .send(all)
                .expect(200, function(err, res) {
                    should.not.exist(err);
                    res.body.success.length.should.eql(num);
                    res.body.errors.length.should.eql(failNum);
                    res.body.success.forEach(function(s) {
                        s.num.should.be.above(start - 1);
                        s.num.should.not.be.above(start + num);
                    });
                    res.body.errors.forEach(function(e) {
                        e.value.num.should.be.above(failStart - 1);
                        e.value.num.should.not.be.above(failStart + failNum);
                    });
                    done();
                });
        });
    });
});
