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

describe('@API - Authorization API Entities', function() {
    var should = require('should');
    var async = require('async');

    var SIS = require("../util/constants");
    var config = require('./fixtures/config');
    var TestUtil = require('./fixtures/util');
    var AuthFixture = require("./fixtures/authdata");

    var ApiServer = new TestUtil.TestServer();

    var users = AuthFixture.createUsers();
    var userNames = Object.keys(users);
    var userToTokens = { };
    var superToken = null;

    it("Should setup fixtures", function(done) {
        ApiServer.start(config, function(err) {
            if (err) { return done(err); }
            // issue create requests
            var creds = ApiServer.getSuperCreds();
            ApiServer.getTempToken(creds.username, creds.password,
            function(e, t) {
                if (e) {
                    return done(e);
                }
                superToken = t.name;
                AuthFixture.initUsers(ApiServer, superToken, users, function(err, res) {
                    if (err) { return done(err); }
                    AuthFixture.createTempTokens(ApiServer, userToTokens, users, done);
                });
            });
        });
    });

    after(function(done) {
        ApiServer.stop(done);
    });

    describe("add entities", function() {

        var schemas = AuthFixture.getAuthSchemas();
        var entities = AuthFixture.createAuthEntities();
        // init
        before(function(done) {
            // nuke existing schemas
            ApiServer.authToken = superToken;
            AuthFixture.deleteSchemas(ApiServer, schemas, false, function(err, res) {
                if (err) { return done(err); }
                AuthFixture.addSchemas(ApiServer, schemas, function(e, r) {
                    ApiServer.authToken = null;
                    done(e);
                });
            });
        });

        // add entities
        var addEntityTests = {
            test_s1_e1 : {
                // any user belonging to g1 g2 or g3
                pass : userNames
            },
            test_s1_e2 : {
                // must belong to g1 and g2
                pass : ['superman', 'superman2', 'admin5',
                        'user4', 'admin3', 'admin4', 'user3']
            },
            test_s2_e3 : {
                // nobody should be able to add this
                pass : [],
                fail_code : 400
            },
            test_s3_e4 : {
                // must be member of g2
                pass : ['superman', 'superman2', 'admin2', 'admin3', 'admin4',
                        'admin5', 'user2', 'user3', 'user4']
            }
        };

        Object.keys(addEntityTests).map(function(entityName) {
            var addTest = addEntityTests[entityName];
            var passes = addTest.pass;
            var failures = TestUtil.invert(userNames, passes);

            var entity = entities[entityName].entity;
            var schemaName = entities[entityName].schema;
            // passes
            passes.map(function(userName) {
                var testName = userName + " should be able to add entity " + entityName;
                it(testName, function(done) {
                    var token = userToTokens[userName].name;
                    ApiServer.post("/api/v1/entities/" + schemaName, token)
                        .send(entity)
                        .expect(201, function(err, res) {
                        // validate add worked
                        should.not.exist(err);
                        res = res.body;
                        should.exist(res);
                        entity.str.should.eql(res.str);
                        res[SIS.FIELD_CREATED_BY].should.eql(userName);
                        var entityId = res._id;
                        // delete
                        ApiServer.del("/api/v1/entities/" + schemaName + "/" + entityId, token)
                            .expect(200, function(e, r) {
                            // delete
                            done(e);
                        });
                    });
                });
            }); // end passes

            // failures
            failures.map(function(userName) {
                var testName = userName + " should NOT be able to add entity " + entityName;
                it(testName, function(done) {
                    var token = userToTokens[userName].name;
                    ApiServer.post("/api/v1/entities/" + schemaName, token)
                        .send(entity)
                        .expect(addTest.fail_code || 401, function(err, res) {
                        // should be done
                        done(err);
                    });
                });
            });
        });
    });

    // update entities
    describe("update entities", function() {
        var schemas = AuthFixture.getAuthSchemas();
        var entities = AuthFixture.createAuthEntities();
        // init
        before(function(done) {
            // nuke existing schemas
            ApiServer.authToken = superToken;
            AuthFixture.deleteSchemas(ApiServer, schemas, false, function(err, res) {
                if (err) { return done(err); }
                AuthFixture.addSchemas(ApiServer, schemas, function(e, r) {
                    ApiServer.authToken = null;
                    done(e);
                });
            });
        });

        var updateEntityTests = {
            test_s1_e2 : [
                {
                    owner : ['test_g4'],
                    pass : [],
                    err_code : 400
                },
                {
                    owner : ['test_g3'],
                    pass : ['superman', 'superman2', 'admin5', 'user4'],
                    err_code : 401
                }
            ]
        };

        Object.keys(updateEntityTests).map(function(entityName) {
            var updateTests = updateEntityTests[entityName];
            var entity = entities[entityName].entity;
            var schemaName = entities[entityName].schema;

            updateTests.map(function(test) {
                var passes = test.pass;
                var failures = TestUtil.invert(userNames, passes);
                var ownerStr = JSON.stringify(test[SIS.FIELD_OWNER]);
                passes.map(function(uname) {
                    var testName = uname + " can update " + entityName + " w/ owners " + ownerStr;
                    it(testName, function(done) {
                        // add the entity
                        ApiServer.post("/api/v1/entities/" + schemaName, superToken)
                            .send(entity)
                            .expect(201, function(e1, r1) {
                            // validate that it was added it
                            should.not.exist(e1);
                            r1.should.have.property('body');
                            r1 = r1.body;
                            r1.should.have.property('owner', entity.owner);
                            r1.should.have.property(SIS.FIELD_CREATED_BY);
                            var created_by = r1[SIS.FIELD_CREATED_BY];
                            var token = userToTokens[uname].name;
                            r1[SIS.FIELD_OWNER] = test[SIS.FIELD_OWNER];
                            ApiServer.put("/api/v1/entities/" + schemaName + "/" + r1._id, token)
                                .send(r1)
                                .expect(200, function(e2, r2) {
                                // validate that it updated
                                should.not.exist(e2);
                                r2 = r2.body;
                                r2[SIS.FIELD_CREATED_BY].should.eql(created_by);
                                r2[SIS.FIELD_UPDATED_BY].should.eql(uname);
                                // delete..
                                ApiServer.del("/api/v1/entities/" + schemaName + "/" + r1._id, superToken)
                                    .expect(200, done);
                            });
                        });
                    });
                });

                var failCode = test.err_code;
                failures.map(function(uname) {
                    var testName = uname + " cannot update " + schemaName + " w/ owners " + ownerStr;
                    it(testName, function(done) {
                        // add the entity
                        ApiServer.post("/api/v1/entities/" + schemaName, superToken)
                            .send(entity)
                            .expect(201, function(e1, r1) {
                            // update it
                            should.not.exist(e1);
                            r1 = r1.body;
                            var token = userToTokens[uname].name;
                            r1[SIS.FIELD_OWNER] = test[SIS.FIELD_OWNER];
                            ApiServer.put("/api/v1/entities/" + schemaName + "/" + r1._id, token)
                                .send(r1)
                                .expect(failCode, function(e2, r2) {
                                should.not.exist(e2);
                                // delete..
                                ApiServer.del("/api/v1/entities/" + schemaName + "/" + r1._id, superToken)
                                    .expect(200, done);
                            });
                        });
                    });
                });

            });
        });
    });
});