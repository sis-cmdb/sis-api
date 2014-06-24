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

describe('@API - Info API', function() {
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
