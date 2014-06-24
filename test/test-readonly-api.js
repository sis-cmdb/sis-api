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

// Note this is not a remote test since it requires spinning up a
// readonly server
describe('API at the Edge ', function() {

    var schema = {
        "name":"test_entity",
        "owner" : "test",
        "definition": {
            "str":   "String",
            "num":   "Number",
            "date":  "Date",
            "bool":  "Boolean",
            "arr": [],
        }
    };

    var SIS = require("../util/constants");
    var config = require('./fixtures/config');
    var should = require('should');
    var TestUtil = require('./fixtures/util');
    var ApiServer = new TestUtil.TestServer();
    var app = null;

    it("Should setup fixtures", function(done) {
        config.app = config.app || { };
        config.app.readonly = true;
        ApiServer.start(config, function(err, sd) {
            if (err) { return done(err); }
            app = sd.app;
            sd.schemaManager.delete(schema.name, sd.superUser, function() {
                sd.schemaManager.add(schema, sd.superUser, done);
            });
        });
    });

    after(function(done) {
        config.app.readonly = false;
        ApiServer.stop(done);
    });

    it("should have readonly set in the app", function() {
        should.exist(app.get("readonly"));
        app.get("readonly").should.eql(true);
    });

    var paths = [
        "/api/v1/schemas",
        "/api/v1/hiera",
        "/api/v1/entities/test_entity"
    ];

    paths.map(function(path) {
        it("should allow GET on " + path, function(done) {
            ApiServer.get(path)
                     .expect(200, done);
        });
    });

    paths.map(function(path) {
        it("should 404 when POSTing to " + path, function(done) {
            ApiServer.post(path)
                .send({"unprocessed" : "entity"})
                .expect(404, done);
        });
    });

});
