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

describe('Initialize Tests', function() {
    "use strict";

    var config = require('./fixtures/config');
    var util = require('./fixtures/util');

    var test = null;

    it("Should create the test", function(done) {
        test = new util.LocalTest();
        test.start(config, done);
    });

    it("Should stop the test", function(done) {
        test.stop(done);
    });
});
