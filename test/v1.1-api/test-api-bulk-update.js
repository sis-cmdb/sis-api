describe('@API @V1.1API - Bulk Update API', function() {
    "use strict";

    var should = require('should');
    var async = require('async');

    var SIS = require("../../util/constants");

    var TestUtil = require('../fixtures/util');
    var AuthFixture = require("../fixtures/authdata");

    var ApiServer = new TestUtil.TestServer();

    var schema = {
        "name":"test_bulk_update_entity",
        _sis : { "owner" : ["test_g1"] },
        "definition": {
            "str" : "String",
            "num":   { type : "Number", unique : true, required : true }
        }
    };

    var createItems = function(start, num) {
        var result = [];
        for (var i = start; i < (start + num); ++i) {
            result.push({ num: i, str : "s_" + i });
        }
        return result;
    };


    it("Should setup fixtures", function(done) {
        ApiServer.start(function(e) {
            if (e) { done(e); return; }
            ApiServer.becomeSuperUser(function(e) {
                if (e) { done(e); return; }
                ApiServer.del('/api/v1.1/schemas/test_bulk_update_entity')
                .end(function() {
                    ApiServer.post('/api/v1.1/schemas')
                        .send(schema).expect(201, done);
                });
            });
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
                done();
            });
    });


    after(function(done) {
        ApiServer.stop(done);
    });

    var verifyItems = function(start, num, items, q, done) {
        items = items.sort(function(i1, i2) {
            return i1.num - i2.num;
        });
        for (var i = start; i < (start + num); ++i) {
            items[i - start].num.should.eql(i);
        }
        var query = {
            q : q
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
                    r.length.should.eql(2);
                    var commit = r[0];
                    commit.action.should.eql("update");
                    cb(e);
                });
            }, function(e) {
                done(e);
            });
        });
    };

    it("should return a 400 with empty array", function(done) {
        ApiServer.put("/api/v1.1/entities/" + schema.name)
            .send([])
            .expect(400, function(err, res) {
                done(err);
            });
    });

    it("should return a 400 with empty body", function(done) {
        ApiServer.put("/api/v1.1/entities/" + schema.name)
            .query({ q : { num : 1 }})
            .send({})
            .expect(400, function(err, res) {
                done(err);
            });
    });

    it("should return a 400 with non array or body", function(done) {
        ApiServer.put("/api/v1.1/entities/" + schema.name)
            .query({ q : { num : 1 }})
            .send("bad")
            .expect(400, function(err, res) {
                done(err);
            });
    });

    it("should return a 400 with empty query", function(done) {
        ApiServer.put("/api/v1.1/entities/" + schema.name)
            .send({ str : "should fail" })
            .expect(400, function(err, res) {
                done(err);
            });
    });

    var getQuery = function(start, num) {
        return {
            num : {
                $gte : start,
                $lt : (start + num)
            }
        };
    };

    it("should update items 0-99", function(done) {
        var start = 0, num = 100;
        var query = getQuery(start, num);
        this.timeout(num * 1000);
        ApiServer.put("/api/v1.1/entities/" + schema.name)
            .send({ str : "bulk_update" })
            .query({ q : query })
            .expect(200, function(err, res) {
                should.not.exist(err);
                should.exist(res.body);
                should.exist(res.body.success);
                should.exist(res.body.errors);
                res.body.success.should.be.instanceof(Array);
                res.body.success.length.should.eql(num);
                res.body.errors.should.be.instanceof(Array);
                res.body.errors.length.should.eql(0);
                res.body.success.forEach(function(item) {
                    should.exist(item.str);
                    item.str.should.eql("bulk_update");
                });
                verifyItems(start, num, res.body.success, query, done);
            });
    });

    it("should update items 100-149", function(done) {
        var start = 100, num = 50;
        var query = getQuery(start, num);
        this.timeout(num * 1000);
        // fetch them
        ApiServer.get("/api/v1.1/entities/" + schema.name)
            .query({q : query })
            .expect(200, function(err, res) {
                should.not.exist(err);
                res.body.should.be.instanceof(Array);
                res.body.length.should.eql(num);
                var updateItems = res.body.map(function(i) {
                    return {
                        _id : i._id,
                        str : "bu_" + (i.num * 2)
                    };
                });
                // send it up
                ApiServer.put("/api/v1.1/entities/" + schema.name)
                    .send(updateItems)
                    .expect(200, function(err, res) {
                        should.not.exist(err);
                        should.exist(res.body);
                        should.exist(res.body.success);
                        should.exist(res.body.errors);
                        res.body.success.should.be.instanceof(Array);
                        res.body.success.length.should.eql(num);
                        res.body.errors.should.be.instanceof(Array);
                        res.body.errors.length.should.eql(0);
                        res.body.success.forEach(function(item) {
                            should.exist(item.str);
                            var expected = "bu_" + (item.num * 2);
                            item.str.should.eql(expected);
                        });
                        verifyItems(start, num, res.body.success, query, done);
                    });
            });
    });

});
