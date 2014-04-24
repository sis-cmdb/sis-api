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

describe('@Replication - Schemas', function() {

    var replUtil = require("../fixtures/repl-util");
    var servers = replUtil.loadReplicationServers();
    var should = require('should');
    var async = require('async');

    var schema = {
        name : "test_repl_s0",
        owner : ["sistest"],
        track_history : false,
        definition : {
            name : { type : "String", required : true, unique : true },
            test : "Number"
        }
    };

    var BASE_URL = '/api/v1/schemas';
    var ITEM_URL = BASE_URL + '/' + schema.name;

    servers.forEach(function(server, idx) {
        describe("Replication from " + server.host, function() {
            before(function(done) {
                // delete
                server.del(ITEM_URL).end(done);
            });

            it("should create/replicate the schema", function(done) {
                server.post(BASE_URL).send(schema)
                    .expect(201, function(err, res) {
                    if (err) { return done(err); }
                    var opts = {
                        url : ITEM_URL,
                        status : 200,
                        data : res.body
                    };
                    replUtil.verifyExpected(servers, opts, done);
                });
            });

            it("should update/replicate the schema", function(done) {
                schema.definition.foo = "String";
                delete schema.definition.test;
                server.put(ITEM_URL).send(schema)
                    .expect(200, function(err, res) {
                    if (err) { return done(err); }
                    var opts = {
                        url : ITEM_URL,
                        status : 200,
                        data : res.body
                    };
                    replUtil.verifyExpected(servers, opts, done);
                });
            });

            it("should delete/replicate the schema", function(done) {
                server.del(ITEM_URL).expect(200)
                    .end(function(err, res) {
                    if (err) { return done(err); }
                    var opts = {
                        url : ITEM_URL,
                        status : 404
                    };
                    replUtil.verifyExpected(servers, opts, done);
                });
            });
        });
    });

});
