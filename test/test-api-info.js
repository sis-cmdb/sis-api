describe('@API - Info API', function() {
    "use strict";

    var should = require('should');
    var SIS = require("../util/constants");
    var config = require('./fixtures/config');
    var TestUtil = require('./fixtures/util');
    var ApiServer = new TestUtil.TestServer();

    it("Should setup fixtures", function(done) {
        ApiServer.start(config, done);
    });

    after(function(done) {
        ApiServer.stop(done);
    });

    it("should receive API info", function(done) {
        ApiServer.get("/api/v1/info")
            .expect(200, function(err, res) {
                should.not.exist(err);
                should.exist(res.body);
                should.not.exist(res.body.err);
                var keys = ['build_num', 'git_hash', 'build_id', 'version'];
                keys.forEach(function(k) { should.exist(res.body[k]); });
                done();
            });
    });

    SIS.SUPPORTED_VERSIONS.forEach(function(v) {
        it("Should work for supported version " + v, function(done) {
            ApiServer.get("/api/" + v + "/info").expect(200, done);
        });
    });

    it("Should error on unsupported versions", function(done) {
        ApiServer.get("/api/unsupported/info")
            .expect(404, done);
    });
});
