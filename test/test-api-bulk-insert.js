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

    var createItems = function(start, num) {
        var result = [];
        for (var i = start; i < (start + num); ++i) {
            result.push({ num: i });
        }
        return result;
    };

    var verifyItems = function(start, num, items) {
        items = items.sort(function(i1, i2) {
            return i1.num - i2.num;
        });
        for (var i = start; i < (start + num); ++i) {
            items[i - start].num.should.eql(i);
        }
    };

    it("should add 500 items", function(done) {
        var start = 0, num = 500;
        var items = createItems(start, num);
        ApiServer.post("/api/v1/entities/" + schema.name)
            .send(items)
            .expect(200, function(err, res) {
                should.not.exist(err);
                should.exist(res.body);
                should.not.exist(res.body.err);
                should.exist(res.body.success);
                res.body.success.should.be.instanceof(Array);
                res.body.success.length.should.eql(num);
                res.body.errors.should.be.instanceof(Array);
                res.body.errors.length.should.eql(0);
                verifyItems(start, num, res.body.success);
                done();
            });
    });

    it("should add 500 more items", function(done) {
        var start = 1000, num = 500;
        var items = createItems(start, num);
        ApiServer.post("/api/v1/entities/" + schema.name)
            .send(items)
            .expect(200, function(err, res) {
                should.not.exist(err);
                should.exist(res.body);
                should.not.exist(res.body.err);
                should.exist(res.body.success);
                res.body.success.should.be.instanceof(Array);
                res.body.success.length.should.eql(num);
                res.body.errors.should.be.instanceof(Array);
                res.body.errors.length.should.eql(0);
                verifyItems(start, num, res.body.success);
                done();
            });
    });
});
