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
var async = require('async');
var SIS = require("../util/constants");
var mongoose = null;
var schemaManager = null;
var app = null;
var httpServer = null;
var superTest = null;

describe('Authorization API', function() {
    var data = require("./data");
    var users = data.users;
    var userNames = Object.keys(users);

    var userToTokens = {};

    before(function(done) {
        config.app[SIS.OPT_USE_AUTH] = true;
        server.startServer(config, function(expressApp, httpSrv) {
            mongoose = server.mongoose;
            schemaManager = expressApp.get("schemaManager");
            var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
            app = expressApp;
            superTest = request(app);
            httpServer = httpSrv;
            // create the users
            var superUser = users['superman'];
            async.parallel(userNames.map(function(name) {
                var user = users[name];
                return function(cb) {
                    userManager.add(user, superUser, cb);
                }
            }), done)
        });
    });

    after(function(done) {
        config.app[SIS.OPT_USE_AUTH] = false;
        server.stopServer(httpServer, function() {
            mongoose.connection.db.dropDatabase();
            mongoose.connection.close();
            done();
        });
    });

    describe("get tokens", function() {
        userNames.map(function(name) {
            var testName = "should get tokens for " + name;
            it(testName, function(done) {
                // first token is a temp token
                var user = users[name];
                superTest.post("/api/v1/users/auth_token")
                    .auth(name, name)
                    .expect(201, function(err, res) {
                        should.not.exist(err);
                        var token = res.body;
                        should.exist(token);
                        name.should.eql(token.username);
                        // now use the token to create a persistent token
                        var data = {
                            'username' : name,
                            'desc' : 'persistent token baby'
                        };
                        var req = superTest.post("/api/v1/users/" + name + "/tokens")
                            .set("x-auth-token", token.name)
                            .set("Content-Type", "application/json")
                            .send(data);
                        if (user.super_user) {
                            req.expect(400, function(err, res) {
                                userToTokens[name] = [token];
                                done();
                            });
                        } else {
                            req.expect(201, function(err, res) {
                                should.not.exist(err);
                                var ptoken = res.body;
                                should.exist(ptoken);
                                name.should.eql(ptoken.username);
                                // store the tokens
                                userToTokens[name] = [token, ptoken];
                                done();
                            })
                        }
                    });
            });
        });
    });

    // test auth stuff..
    // cases
    // - schema - must be admin of all groups
    // - hiera/hooks - must be user of all groups
    // - entities - must be user of all groups of schema OR of entity if specified

    describe("add schemas", function() {
        var schemas = data.schemas;
        var addSchemaTests = data.addSchemaTests;

        Object.keys(addSchemaTests).map(function(schemaName) {
            var test = addSchemaTests[schemaName];
            var passes = test['pass'];
            var schema = schemas[schemaName];
            // passes
            passes.map(function(userName) {
                var testName = userName + " should be able to add " + schemaName;
                it(testName, function(done) {
                    var tokens = userToTokens[userName];
                    var token = tokens[0][SIS.FIELD_NAME];
                    superTest.post("/api/v1/schemas")
                        .set("x-auth-token", token)
                        .set("Content-Encoding", "application/json")
                        .send(schema)
                        .expect(201, function(err, res) {
                            should.not.exist(err);
                            res = res.body;
                            should.exist(res);
                            schemaName.should.eql(res[SIS.FIELD_NAME]);
                            if (tokens.length > 1) {
                                token = tokens[1][SIS.FIELD_NAME];
                            }
                            // delete
                            superTest.del("/api/v1/schemas/" + schemaName)
                                .set("x-auth-token", token)
                                .expect(200, function(e, r) {
                                    should.not.exist(e);
                                    done();
                                });
                        });
                });
            }); // end passes

            // failures
            var failures = test['fail'];
            failures.map(function(userName) {
                var testName = userName + " should NOT be able to add " + schemaName;
                it(testName, function(done) {
                    var tokens = userToTokens[userName];
                    var token = tokens[0];
                    superTest.post("/api/v1/schemas")
                        .set("x-auth-token", token)
                        .set("Content-Type", "application/json")
                        .send(schema)
                        .expect(401, function(err, res) {
                            done();
                        });
                });
            });
        });
    });

    describe("add entities", function() {
        var schemas = data.schemas;

        before(function(done) {
            // add schemas in parallel
            var schemaNames = Object.keys(schemas);
            var tokens = userToTokens['superman'];
            var token = tokens[0][SIS.FIELD_NAME];
            async.parallel(schemaNames.map(function(schemaName) {
                var schema = schemas[schemaName];
                return function(cb) {
                    superTest.post("/api/v1/schemas")
                        .set("x-auth-token", token)
                        .set("Content-Encoding", "application/json")
                        .send(schema)
                        .expect(201, cb);
                }
            }), done);
        });
        after(function(done) {
            // del schemas in parallel
            var schemaNames = Object.keys(schemas);
            var tokens = userToTokens['superman'];
            var token = tokens[0][SIS.FIELD_NAME];
            async.parallel(schemaNames.map(function(schemaName) {
                var schema = schemas[schemaName];
                return function(cb) {
                    superTest.del("/api/v1/schemas/" + schemaName)
                        .set("x-auth-token", token)
                        .send(schema)
                        .expect(200, cb);
                }
            }), done);
        });

        // add entities
        var entities = data.entities;
        var addEntityTests = data.addEntityTests;

        Object.keys(addEntityTests).map(function(entityName) {
            var test = addEntityTests[entityName];
            var passes = test['pass'];
            var entity = entities[entityName]['entity'];
            var schemaName = entities[entityName]['schema'];
            // passes
            passes.map(function(userName) {
                var testName = userName + " should be able to add entity " + entityName;
                it(testName, function(done) {
                    var tokens = userToTokens[userName];
                    var token = tokens[0][SIS.FIELD_NAME];
                    superTest.post("/api/v1/entities/" + schemaName)
                        .set("x-auth-token", token)
                        .set("Content-Encoding", "application/json")
                        .send(entity)
                        .expect(201, function(err, res) {
                            should.not.exist(err);
                            res = res.body;
                            should.exist(res);
                            entity.str.should.eql(res.str);
                            if (tokens.length > 1) {
                                token = tokens[1][SIS.FIELD_NAME];
                            }
                            var entityId = res['_id'];
                            // delete
                            superTest.del("/api/v1/entities/" + schemaName + "/" + entityId)
                                .set("x-auth-token", token)
                                .expect(200, function(e, r) {
                                    should.not.exist(e);
                                    done();
                                });
                        });
                });
            }); // end passes

            // failures
            var failures = test['fail'];
            failures.map(function(userName) {
                var testName = userName + " should NOT be able to add entity " + entityName;
                it(testName, function(done) {
                    var tokens = userToTokens[userName];
                    var token = tokens[0];
                    superTest.post("/api/v1/entities/" + schemaName)
                        .set("x-auth-token", token)
                        .set("Content-Type", "application/json")
                        .send(entity)
                        .expect(401, function(err, res) {
                            done();
                        });
                });
            });
        });

        // nobody should be able to add the bad entities
        var badEntities = data.badEntities;
        Object.keys(badEntities).map(function(entityName) {
            var entity = badEntities[entityName]['entity'];
            var schemaName = badEntities[entityName]['schema'];
            var failures = Object.keys(users);
            failures.map(function(userName) {
                var testName = userName + " should NOT be able to add entity " + entityName;
                it(testName, function(done) {
                    var tokens = userToTokens[userName];
                    var token = tokens[0];
                    superTest.post("/api/v1/entities/" + schemaName)
                        .set("x-auth-token", token)
                        .set("Content-Type", "application/json")
                        .send(entity)
                        .expect(400, function(err, res) {
                            done();
                        });
                });
            });
        });
    });

    // update schemas
    describe("update schemas", function() {
        // add / delete as superman
        // update as the user
        var schemas = data.schemas;
        var updateSchemaTests = data.updateSchemaTests;

        Object.keys(updateSchemaTests).map(function(schemaName) {
            var tests = updateSchemaTests[schemaName];
            var schema = schemas[schemaName];

            tests.map(function(test) {
                var passes = test['pass'];
                var ownerStr = JSON.stringify(test[SIS.FIELD_OWNER]);
                passes.map(function(uname) {
                    var testName = uname + " can update " + schemaName + " w/ owners " + ownerStr;
                    it(testName, function(done) {
                        var superToken = userToTokens['superman'][0][SIS.FIELD_NAME];
                        // add the schema
                        superTest.post("/api/v1/schemas")
                            .set("x-auth-token", superToken)
                            .set("Content-Type", "application/json")
                            .send(schema)
                            .expect(201, function(e1, r1) {
                                // update it
                                should.not.exist(e1);
                                r1 = r1.body;
                                var token = userToTokens[uname][0];
                                r1[SIS.FIELD_OWNER] = test[SIS.FIELD_OWNER];
                                superTest.put("/api/v1/schemas/" + schemaName)
                                    .set("x-auth-token", superToken)
                                    .set("Content-Type", "application/json")
                                    .send(r1)
                                    .expect(200, function(e2, r2) {
                                        should.not.exist(e2);
                                        // delete..
                                        superTest.del("/api/v1/schemas/" + schemaName)
                                            .set("x-auth-token", superToken)
                                            .expect(200, done);
                                    });
                            });
                    });
                });

                var fails = test['fail'];
                fails.map(function(uname) {
                    var testName = uname + " cannot update " + schemaName + " w/ owners " + ownerStr;
                    it(testName, function(done) {
                        var superToken = userToTokens['superman'][0][SIS.FIELD_NAME];
                        // add the schema
                        superTest.post("/api/v1/schemas")
                            .set("x-auth-token", superToken)
                            .set("Content-Type", "application/json")
                            .send(schema)
                            .expect(201, function(e1, r1) {
                                // update it
                                should.not.exist(e1);
                                r1 = r1.body;
                                var token = userToTokens[uname][0];
                                r1[SIS.FIELD_OWNER] = test[SIS.FIELD_OWNER];
                                superTest.put("/api/v1/schemas/" + schemaName)
                                    .set("x-auth-token", superToken)
                                    .set("Content-Type", "application/json")
                                    .send(r1)
                                    .expect(401, function(e2, r2) {
                                        // delete..
                                        superTest.del("/api/v1/schemas/" + schemaName)
                                            .set("x-auth-token", superToken)
                                            .expect(200, done);
                                    });
                            });
                    });
                });

            });
        });
    });

    // update entities
    describe("update entities", function() {
        var schemas = data.schemas;
        before(function(done) {
            // add schemas in parallel
            var schemaNames = Object.keys(schemas);
            var tokens = userToTokens['superman'];
            var token = tokens[0][SIS.FIELD_NAME];
            async.parallel(schemaNames.map(function(schemaName) {
                var schema = schemas[schemaName];
                return function(cb) {
                    superTest.post("/api/v1/schemas")
                        .set("x-auth-token", token)
                        .set("Content-Encoding", "application/json")
                        .send(schema)
                        .expect(201, cb);
                }
            }), done);
        });
        after(function(done) {
            // del schemas in parallel
            var schemaNames = Object.keys(schemas);
            var tokens = userToTokens['superman'];
            var token = tokens[0][SIS.FIELD_NAME];
            async.parallel(schemaNames.map(function(schemaName) {
                var schema = schemas[schemaName];
                return function(cb) {
                    superTest.del("/api/v1/schemas/" + schemaName)
                        .set("x-auth-token", token)
                        .send(schema)
                        .expect(200, cb);
                }
            }), done);
        });

        var updateEntityTests = data.updateEntityTests;
        var entities = data.entities;

        Object.keys(updateEntityTests).map(function(entityName) {
            var tests = updateEntityTests[entityName];
            var entity = entities[entityName]['entity'];
            var schemaName = entities[entityName]['schema'];

            tests.map(function(test) {
                var passes = test['pass'];
                var ownerStr = JSON.stringify(test[SIS.FIELD_OWNER]);
                passes.map(function(uname) {
                    var testName = uname + " can update " + entityName + " w/ owners " + ownerStr;
                    it(testName, function(done) {
                        var superToken = userToTokens['superman'][0][SIS.FIELD_NAME];
                        // add the entity
                        superTest.post("/api/v1/entities/" + schemaName)
                            .set("x-auth-token", superToken)
                            .set("Content-Type", "application/json")
                            .send(entity)
                            .expect(201, function(e1, r1) {
                                // update it
                                should.not.exist(e1);
                                r1 = r1.body;
                                var token = userToTokens[uname][0];
                                r1[SIS.FIELD_OWNER] = test[SIS.FIELD_OWNER];
                                superTest.put("/api/v1/entities/" + schemaName + "/" + r1['_id'])
                                    .set("x-auth-token", superToken)
                                    .set("Content-Type", "application/json")
                                    .send(r1)
                                    .expect(200, function(e2, r2) {
                                        should.not.exist(e2);
                                        // delete..
                                        superTest.del("/api/v1/entities/" + schemaName + "/" + r1['_id'])
                                            .set("x-auth-token", superToken)
                                            .expect(200, done);
                                    });
                            });
                    });
                });

                var fails = test['fail'];
                var failCode = test['err_code'];
                fails.map(function(uname) {
                    var testName = uname + " cannot update " + schemaName + " w/ owners " + ownerStr;
                    it(testName, function(done) {
                        var superToken = userToTokens['superman'][0][SIS.FIELD_NAME];
                        // add the entity
                        superTest.post("/api/v1/entities/" + schemaName)
                            .set("x-auth-token", superToken)
                            .set("Content-Type", "application/json")
                            .send(entity)
                            .expect(201, function(e1, r1) {
                                // update it
                                should.not.exist(e1);
                                r1 = r1.body;
                                var token = userToTokens[uname][0];
                                r1[SIS.FIELD_OWNER] = test[SIS.FIELD_OWNER];
                                superTest.put("/api/v1/entities/" + schemaName + "/" + r1['_id'])
                                    .set("x-auth-token", superToken)
                                    .set("Content-Type", "application/json")
                                    .send(r1)
                                    .expect(failCode, function(e2, r2) {
                                        // delete..
                                        superTest.del("/api/v1/entities/" + schemaName + "/" + r1['_id'])
                                            .set("x-auth-token", superToken)
                                            .expect(200, done);
                                    });
                            });
                    });
                });

            });
        });

    });
});