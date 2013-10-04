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

var config = require('./test-config');
var server = require("../server")
var should = require('should');
var request = require('supertest');
var mongoose = null;
var schemaManager = null;
var app = null;

describe('Schema API', function() {
    before(function(done) {
        server.startServer(config, function(expressApp) {
            mongoose = server.mongoose;
            schemaManager = require('../util/schema-manager')(mongoose);
            app = expressApp;
            done();
        });
    });

    after(function(done) {
        server.stopServer();
        mongoose.connection.db.dropDatabase();
        mongoose.connection.close();
        done();
    });

    describe("GET failure cases", function() {
        // no schemas..
        it("Should fail if type is not specified ", function(done) {
            request(app).get("/v1/api/schemas").expect(404, done);
        });
        it("Should fail if type does not exist ", function(done) {
            request(app).get("/v1/api/schemas/dne").expect(404, done);
        });
    });

    describe("POST schema", function() {
        it("Should create new schemas", function(done) {
            var jsData = JSON.parse("{        \
                \"name\":\"network_element\", \
                \"definition\": {             \
                    \"ne_type\": \"String\",  \
                    \"cid\":     \"String\",  \
                    \"ip\":      \"String\",  \
                    \"ip6\":     \"String\",  \
                    \"bgpip\":   \"String\",  \
                    \"bgpip6\":  \"String\",  \
                }.                            \
            }");
            request(app).post("/v1/api/schemas")
                .set('Content-Encoding', 'application/json')
                .write(jsData)
                .expect(200);
        });
    });
});
