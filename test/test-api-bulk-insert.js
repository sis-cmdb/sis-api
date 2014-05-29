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

describe('@API - Bulk Insert API', function() {
    var should = require('should');
    var SIS = require("../util/constants");
    var config = require('./fixtures/config');
    var TestUtil = require('./fixtures/util');
    var async = require('async');
    var ApiServer = new TestUtil.TestServer();

    var schema = {
        "name":"test_bulk_entity",
        "owner" : ["sistest"],
        "definition": {
            "num":   { type : "Number", unique : true, required : true }
        }
    };

    before(function(done) {
        ApiServer.start(config, function(e) {
            if (e) { return done(e); }
            ApiServer.becomeSuperUser(function(e) {
                if (e) { return done(e); }
                ApiServer.del('/api/v1/schemas/test_bulk_entity')
                .end(function() {
                    ApiServer.post('/api/v1/schemas')
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
        ApiServer.get("/api/v1/entities/" + schema.name)
        .query(query)
        .expect(200, function(err, res) {
            should.not.exist(err);
            res = res.body;
            res.should.be.instanceof(Array);
            res.length.should.eql(num);
            // ensure commits
            async.map(res, function(item, cb) {
                var path = [
                    "/api/v1/entities",
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

    it("should add 150 items", function(done) {
        var start = 0, num = 150;
        var items = createItems(start, num);
        ApiServer.post("/api/v1/entities/" + schema.name)
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

    it("should add 150 more items", function(done) {
        var start = 1000, num = 150;
        var items = createItems(start, num);
        ApiServer.post("/api/v1/entities/" + schema.name)
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
        ApiServer.post("/api/v1/entities/" + schema.name)
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
                ApiServer.get("/api/v1/entities/" + schema.name)
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
        ApiServer.post("/api/v1/entities/" + schema.name)
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
});
