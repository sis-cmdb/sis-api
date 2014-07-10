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

// API for schemas
(function() {

    'use strict';

    var fs = require('fs');
    var path = require('path');

    // all route controllers expose a setup method
    module.exports.setup = function(app, config) {
        var build = null;
        try {
            var buildPath = path.resolve(__dirname, '../build.json');
            build = fs.readFileSync(buildPath, 'utf8');
            build = JSON.parse(build);
        } catch (ex) {
            build = { 'err' : 'no info present' };
        }
        app.get("/api/v1/info", function(req, res) {
            res.jsonp(200, build);
        });
    };

})();
