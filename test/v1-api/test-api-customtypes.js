describe('@API - Custom Types', function() {
    "use strict";

    var should = require('should');

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

    var ip10_1_1_1_24 = {
        "ip_address":"10.1.1.1",
        "version":"v4",
        "cidr":24,
        "network":"10.1.1.0",
        "broadcast":"10.1.1.255",
        "subnet_mask":"255.255.255.0"
    };

    var ip6_1 = {
        "subnet_mask":"ffff:ffff:ffff:ffff:ffff:ffff:f000:0000",
        "broadcast":"2001:0000:ce49:7601:e866:efff:6fff:ffff",
        "network":"2001:0000:ce49:7601:e866:efff:6000:0000",
        "cidr":100,
        "version":"v6",
        "ip_address":"2001:0:ce49:7601:e866:efff:62c3:fffe"
    };

    describe("IpAddress Single", function() {
        var schema = {
            "name" : "test_host",
            "owner" : "ip_test",
            "definition" : {
                "name" : "String",
                "ip" : { "type" : "IpAddress", "required" : true }
            }
        };

        before(function(done) {
            ApiServer.del('/api/v1/schemas/test_host')
                .end(function() {
                ApiServer.post("/api/v1/schemas")
                    .set('content-type', 'application/json')
                    .send(schema)
                    .expect(201, done);
            });
        });

        after(function(done) {
            ApiServer.del("/api/v1/schemas/test_host")
                .expect(200, done);
        });

        it("Should add 10.1.1.1/24", function(done) {
            var entity = {
                name : "v4_test",
                ip : "10.1.1.1/24"
            };
            ApiServer.post("/api/v1/entities/test_host")
                .set('content-type', 'application/json')
                .send(entity)
                .expect(201, function(e, res) {
                    should.not.exist(e);
                    res = res.body;
                    should.exist(res.ip);
                    res.ip.should.eql(ip10_1_1_1_24);
                    done();
                });
        });

        it("Should add 2001:0:ce49:7601:e866:efff:62c3:fffe/100", function(done) {
            var entity = {
                name : "v6_test",
                ip : "2001:0:ce49:7601:e866:efff:62c3:fffe/100"
            };
            ApiServer.post("/api/v1/entities/test_host")
                .set('content-type', 'application/json')
                .send(entity)
                .expect(201, function(e, res) {
                    should.not.exist(e);
                    res = res.body;
                    should.exist(res.ip);
                    res.ip.should.eql(ip6_1);
                    done();
                });
        });

        it("Should fetch 10.1.1.1/24", function(done) {
            var query = {
                q : { "ip.ip_address" : "10.1.1.1" }
            };
            ApiServer.get("/api/v1/entities/test_host")
                .query(query)
                .expect(200, function(err, res) {
                    should.exist(res.body);
                    res = res.body;
                    res.length.should.eql(1);
                    res = res[0];
                    should.exist(res.ip);
                    res.ip.should.eql(ip10_1_1_1_24);
                    done();
                });
        });
    });

    describe("IpAddress Multi", function() {
        var schema = {
            "name" : "test_host",
            "owner" : "ip_test",
            "definition" : {
                "name" : "String",
                "ips" : ["IpAddress"]
            }
        };

        before(function(done) {
            ApiServer.post("/api/v1/schemas")
                .set('content-type', 'application/json')
                .send(schema)
                .expect(201, done);
        });

        after(function(done) {
            ApiServer.del("/api/v1/schemas/test_host")
                .expect(200, done);
        });

        it("Should add multiple ips", function(done) {
            var entity = {
                name : "v4_test",
                ips : ["10.1.1.1/24", "2001:0:ce49:7601:e866:efff:62c3:fffe/100"]
            };
            ApiServer.post("/api/v1/entities/test_host")
                .set('content-type', 'application/json')
                .send(entity)
                .expect(201, function(e, res) {
                    should.not.exist(e);
                    res = res.body;
                    var ips = res.ips;
                    should.exist(ips);
                    ips.length.should.eql(2);
                    ips[0].should.eql(ip10_1_1_1_24);
                    ips[1].should.eql(ip6_1);
                    done();
                });
        });
    });
});
