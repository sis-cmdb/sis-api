describe('@Replication - Schemas', function() {
    "use strict";

    var replUtil = require("../fixtures/repl-util");
    var servers = replUtil.loadReplicationServers();
    var should = require('should');
    var async = require('async');

    var schema = {
        name : "test_repl_schema",
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
                // auth and delete
                server.becomeSuperUser(function(e, r) {
                    if (e) { return done(e); }
                    server.del(ITEM_URL).end(done);
                });
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
