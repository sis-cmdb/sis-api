describe('@API - Authorization API Schemas', function() {
    "use strict";

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
                    AuthFixture.createTempTokens(ApiServer, userToTokens, users, function(err, res) {
                        if (err) { return done(err); }
                        userNames.length.should.eql(Object.keys(userToTokens).length);
                        userNames.forEach(function(uname) {
                            userToTokens.should.have.property(uname);
                            userToTokens[uname].should.have.property('username', uname);
                        });
                        done();
                    });
                });
            });
        });
    });

    after(function(done) {
        ApiServer.stop(done);
    });

    // test adding schemas
    describe("adding schemas", function() {
        var schemas = AuthFixture.getAuthSchemas();
        // init
        before(function(done) {
            // nuke existing schemas
            ApiServer.authToken = superToken;
            AuthFixture.deleteSchemas(ApiServer, schemas, false, function(err, res) {
                if (err) { return done(err); }
                ApiServer.authToken = null;
                done();
            });
        });

        var addSchemaTests = {
            test_s1 : {
                pass : ['superman', 'superman2', 'admin5']
            },
            test_s2 : {
                pass : ['superman', 'superman2', 'admin5', 'admin4']
            }
        };

        Object.keys(addSchemaTests).forEach(function(schemaName) {
            var addTest = addSchemaTests[schemaName];
            var passes = addTest.pass;
            // figure out failures
            var failures = TestUtil.invert(userNames, passes);
            var schema = schemas[schemaName];
            // passes
            passes.forEach(function(userName) {
                var testName = userName + " should be able to add/delete " + schemaName;
                it(testName, function(done) {
                    var token = userToTokens[userName];
                    token = token.name;
                    ApiServer.post("/api/v1/schemas", token)
                        .send(schema)
                        .expect(201, function(err, res) {
                        // validate
                        should.not.exist(err);
                        should.exist(res);
                        res.body.should.have.property(SIS.FIELD_NAME, schemaName);
                        // delete
                        ApiServer.del("/api/v1/schemas/" + schemaName, token)
                            .expect(200, function(e, r) {
                            should.not.exist(e);
                            done();
                        });
                    });
                });
            }); // end passes

            // failures
            failures.forEach(function(userName) {
                var testName = userName + " should NOT be able to add " + schemaName;
                it(testName, function(done) {
                    var token = userToTokens[userName];
                    userName.should.eql(token.username);
                    token = token.name;
                    ApiServer.post("/api/v1/schemas", token)
                        .send(schema)
                        .expect(401, function(err, res) {
                            should.not.exist(err);
                            done();
                        });
                });
            }); // end failures
        });
    });


    // update schemas
    describe("update schema owners", function() {
        // add / delete as superman
        // update as the user
        var schemas = AuthFixture.getAuthSchemas();

        // init
        before(function(done) {
            // nuke existing schemas
            ApiServer.authToken = superToken;
            AuthFixture.deleteSchemas(ApiServer, schemas, false, function(err, res) {
                if (err) { return done(err); }
                ApiServer.authToken = null;
                done();
            });
        });

        var updateTests = {
            test_s2 : [
                {
                    // tests that test_g3 can be added
                    owner : ['test_g1', 'test_g2', 'test_g3'],
                    pass : ['superman', 'superman2', 'admin5']
                },
                {
                    // tests that test_g1 can be removed by the users
                    owner : ['test_g2'],
                    pass : ['superman', 'superman2', 'admin4', 'admin5']
                },
                {
                    // tests that test_g4 is added
                    owner : ['test_g4'],
                    pass : ['superman', 'superman2']
                }
            ]
        };

        Object.keys(updateTests).forEach(function(schemaName) {
            var tests = updateTests[schemaName];
            var schema = schemas[schemaName];

            tests.forEach(function(updateTest) {
                var passes = updateTest.pass;
                var failures = TestUtil.invert(userNames, passes);
                var ownerStr = JSON.stringify(updateTest[SIS.FIELD_OWNER]);
                passes.map(function(uname) {
                    var testName = uname + " can update " + schemaName + " w/ owners " + ownerStr;
                    it(testName, function(done) {
                        // delete..
                        ApiServer.del("/api/v1/schemas/" + schemaName, superToken)
                        .end(function() {
                            // add the schema
                            ApiServer.post("/api/v1/schemas", superToken)
                                .send(schema)
                                .expect(201, function(e1, r1) {
                                // validate + update
                                should.not.exist(e1);
                                r1.should.have.property('body');
                                r1 = r1.body;
                                var token = userToTokens[uname].name;
                                r1[SIS.FIELD_OWNER] = updateTest[SIS.FIELD_OWNER];
                                ApiServer.put("/api/v1/schemas/" + schemaName, token)
                                    .send(r1)
                                    .expect(200, done);
                            });
                        });
                    });
                });

                failures.forEach(function(uname) {
                    var testName = uname + " cannot update " + schemaName + " w/ owners " + ownerStr;
                    it(testName, function(done) {
                        // add the schema
                        ApiServer.del("/api/v1/schemas/" + schemaName, superToken)
                        .end(function() {
                            ApiServer.post("/api/v1/schemas", superToken)
                                .send(schema)
                                .expect(201, function(e1, r1) {
                                // update it
                                should.not.exist(e1);
                                r1 = r1.body;
                                var token = userToTokens[uname].name;
                                r1[SIS.FIELD_OWNER] = updateTest[SIS.FIELD_OWNER];
                                ApiServer.put("/api/v1/schemas/" + schemaName, token)
                                    .send(r1)
                                    .expect(401, done);
                            });
                        });
                    });
                });

            });
        });
    });

    describe("Open schemas", function() {

        var schema = {
            name : "test_very_open_schema",
            owner : ["does_not_exist"],
            is_open : true,
            definition : {
                name : "String"
            }
        };

        before(function(done) {
            // nuke existing schemas
            ApiServer.authToken = superToken;
            AuthFixture.deleteSchemas(ApiServer, [schema], false, function(err, res) {
                if (err) { return done(err); }
                ApiServer.authToken = null;
                done();
            });
        });

        it("Should be created by admin1", function(done) {
            var token = userToTokens.admin1.name;
            ApiServer.post("/api/v1/schemas", token)
                .send(schema).expect(201, done);
        });

        it("Should be updated by user4", function(done) {
            var token = userToTokens.user4.name;
            schema.definition.num = "Number";
            ApiServer.put("/api/v1/schemas/" + schema.name, token)
                .send(schema).expect(200, done);
        });

        it("Should not be updated by admin_2 changing is_open", function(done) {
            var token = userToTokens.admin2.name;
            schema.is_open = false;
            ApiServer.put("/api/v1/schemas/" + schema.name, token)
                .send(schema).expect(401, done);
        });

        it("Should be deleted by user2", function(done) {
            var token = userToTokens.user2.name;
            ApiServer.del("/api/v1/schemas/" + schema.name, token)
                .expect(200, done);
        });
    });

    describe("any_owner_can_modify schemas", function() {
        var schema = {
            name : "test_any_owner_schema",
            owner : ["test_g1", "test_g2"],
            any_owner_can_modify : true,
            definition : {
                name : "String"
            }
        };

        before(function(done) {
            // nuke existing schema and create
            ApiServer.authToken = superToken;
            AuthFixture.deleteSchemas(ApiServer, [schema], false, function(err, res) {
                if (err) { return done(err); }
                ApiServer.authToken = null;
                ApiServer.post("/api/v1/schemas", superToken)
                    .send(schema).expect(201, done);
            });
        });

        it("Should be updated by admin1", function(done) {
            var token = userToTokens.admin1.name;
            schema.definition.num = "Number";
            ApiServer.put("/api/v1/schemas/" + schema.name, token)
                .send(schema).expect(200, done);
        });

        it("Should be updated by admin2", function(done) {
            var token = userToTokens.admin2.name;
            schema.definition.other_num = "Number";
            ApiServer.put("/api/v1/schemas/" + schema.name, token)
                .send(schema).expect(200, done);
        });

        it("Should be deleted by admin1_1", function(done) {
            var token = userToTokens.admin1_1.name;
            ApiServer.del("/api/v1/schemas/" + schema.name, token)
                .expect(200, done);
        });
    });

});
