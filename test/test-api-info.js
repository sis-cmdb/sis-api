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
});
