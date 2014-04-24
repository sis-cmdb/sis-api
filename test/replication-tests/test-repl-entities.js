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

describe('@Replication - Entities', function() {

    var replUtil = require("../fixtures/repl-util");
    var servers = replUtil.loadReplicationServers();
    var should = require('should');
    var async = require('async');

    servers.forEach(function(server, idx) {
        var schema = {
            name : "test_repl_entities",
            owner : ["sistest"],
            track_history : false,
            definition : {
                name : { type : "String", required : true, unique : true },
                test : "Number"
            }
        };

        var SCHEMA_BASE_URL = '/api/v1/schemas';
        var SCHEMA_ITEM_URL = SCHEMA_BASE_URL + '/' + schema.name;
        var BASE_URL = '/api/v1/entities/' + schema.name;

        describe("Replication from " + server.host, function() {
            var entity = {
                name : 'test_repl_entities_0',
                test : 0
            };
            var ITEM_URL = null;
            before(function(done) {
                // auth and delete schema
                server.becomeSuperUser(function(e, r) {
                    if (e) { return done(e); }
                    server.del(SCHEMA_ITEM_URL)
                    .end(function() {
                        server.post(SCHEMA_BASE_URL)
                        .send(schema)
                        .expect(201, done);
                    });
                });
            });

            it("should create/replicate the entities", function(done) {
                server.post(BASE_URL).send(entity)
                    .expect(201, function(err, res) {
                    if (err) { return done(err); }
                    ITEM_URL = BASE_URL + '/' + res.body._id;
                    var opts = {
                        url : ITEM_URL,
                        status : 200,
                        data : res.body
                    };
                    replUtil.verifyExpected(servers, opts, done);
                });
            });

            it("should update/replicate the schema", function(done) {
                entity.test = 1;
                server.put(ITEM_URL).send(entity)
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

            it("should show updated schema changes", function(done) {
                delete schema.definition.test;
                schema.definition.num = { type : "Number", default : 10 };
                server.put(SCHEMA_ITEM_URL).send(schema)
                    .expect(200, function(err, res) {
                    if (err) { return done(err); }
                    var opts = {
                        url : ITEM_URL,
                        status : 200,
                    };
                    replUtil.verifyExpected(servers, opts, function(err, results) {
                        if (err) { return done(err); }
                        results.forEach(function(r) {
                            r.should.not.have.property('test');
                            r.should.have.property('num', 10);
                        });
                        done();
                    });
                });
            });

            it("should delete entities under the schema", function(done) {
                server.del(SCHEMA_ITEM_URL).expect(200)
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
