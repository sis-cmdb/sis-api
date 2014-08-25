describe('Token Manager', function() {
    "use strict";

    var should = require('should');
    var util = require('util');
    var async = require('async');

    var SIS = require("../util/constants");
    var config = require('./fixtures/config');
    var TestUtil = require('./fixtures/util');
    var LocalTest = new TestUtil.LocalTest();
    var schemaManager = null;

    before(function(done) {
        LocalTest.start(config, function(err, mongoose) {
            schemaManager = require("../util/schema-manager")(mongoose, { auth : true });
            done(err);
        });
    });

    after(function(done) {
        LocalTest.stop(done);
    });

    if (process.env.SIS_RUN_LONG_TESTS) {
        describe("temp tokens", function() {
            var users = require("./fixtures/authdata").createUsers();
            before(function(done) {
                // set the expiration time to 80 seconds (in ms).
                SIS.AUTH_EXPIRATION_TIME = 80000;
                var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                var superUser = users.superman;
                var admin = users.admin1;
                var tokenManager = schemaManager.auth[SIS.SCHEMA_TOKENS];
                tokenManager.model.ensureIndexes(function(e) {
                    if (e) { return done(e); }
                    userManager.add(admin, superUser, done);
                });
            });
            after(function(done) {
                SIS.AUTH_EXPIRATION_TIME = 1000 * 60 * 60 * 8;
                var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                var superUser = users.superman;
                userManager.delete('admin1', superUser, done);
            });

            it("should add a temp token", function(done) {
                // mongo ttl thread runs every minute... sort of
                console.log("Testing temp token expiration - please wait");
                this.timeout(240000);
                var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                var tokenManager = schemaManager.auth[SIS.SCHEMA_TOKENS];
                var user = users.admin1;
                userManager.createTempToken(user, function(e, token) {
                    should.not.exist(e);
                    should.exist(token);
                    'admin1'.should.eql(token[SIS.FIELD_USERNAME]);
                    setTimeout(function() {
                        tokenManager.getById(token.name).done(function(token) {
                            should.exist(token);
                            'admin1'.should.eql(token[SIS.FIELD_USERNAME]);
                        }, done);
                    }, 70000);
                    setTimeout(function() {
                        tokenManager.getById(token.name).then(function(token) {
                            done(token);
                        }).catch(function(e) {
                            if (e[0] == 404)
                                done();
                            else
                                done(e);
                        });
                    }, 185000);
                });
            });
        });
    }

    var users = require("./fixtures/authdata").createUsers();
    var addTests = [
        // array defining test
        // firstuser can add seconduser pass/fail
        // superman can add everyone
        ["superman", "admin1", true],
        ["superman", "admin1_1", true],
        ["superman", "superman2", true],
        ["superman", "admin2", true],
        ["superman", "admin3", true],
        ["superman", "admin4", true],
        ["superman", "admin5", true],
        ["superman", "user1", true],
        ["superman", "user2", true],
        ["superman", "user3", true],
        ["superman", "user4", true],
        // admin1 - similar as admin2
        ["admin1", "superman", false],
        ["admin1", "admin1_1", true],
        ["admin1", "admin2", false],
        ["admin1", "admin3", false],
        ["admin1", "admin4", false],
        ["admin1", "user1", true],
        ["admin1", "user2", false],
        ["admin1", "user3", false],
        // admin3
        ["admin3", "admin2", false],
        ["admin3", "admin4", false],
        ["admin3", "user1", true],
        ["admin3", "user2", false],
        ["admin3", "user3", false],
        // users
        ["user3", "superman", false],
        ["user3", "admin1", false],
        ["user3", "admin2", false],
        ["user3", "admin3", false],
        ["user3", "user1", false],
        ["user3", "user2", false]
    ];

    var superTests = addTests.filter(function(test) {
        return test[0] == 'superman';
    });


    var updateTests = [
        // test is:
        // [userDoingTheAction, userBeingManaged, action(add, delete, update), group modified, role, pass/fail]

        // adds and updates
        // admin1 can do whatever he wants on test_g1
        ["admin1", "admin2", 'a', 'test_g1', 'user', true],
        ["admin1", "admin3", 'd', 'test_g1', null, true],
        ["admin1", "user3", 'u', 'test_g1', 'admin', true],

        // superman does it all
        ["superman", "admin1", 'a', 'test_g2', 'user', true],
        ["superman", "admin1", 'a', 'test_g2', 'admin', true],
        ["superman", "user1", 'u', 'test_g1', 'user', true],

        // admin1 only administers test_g1
        ["admin1", "admin1_1", 'a', 'test_g2', 'user', false],
        // can't modify a super user
        ["admin1", "superman2", 'a', 'test_g1', 'user', false],

        // user3 isn't an admin of anything
        ["user3", "admin1", 'a', "test_g2", 'user', false]
    ];

    describe("persistent tokens", function() {
        // add all users and a token in parallel
        before(function(done) {
            async.parallel(superTests.map(function(test) {
                var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                var tokenManager = schemaManager.auth[SIS.SCHEMA_TOKENS];
                var u1 = users[test[0]];
                var u2 = users[test[1]];
                return function(cb) {
                    userManager.add(u2, u1, cb);
                };
            }), done);
        });

        // add tests should map to who can create a token for a user
        addTests.map(function(test) {
            var usr = test[0];
            var usr2 = test[1];
            var pass = test[2];
            var u1 = users[usr];
            var u2 = users[usr2];
            if (u2.super_user) {
                // can't create persistent tokens for super users..
                pass = false;
            }
            var testName = util.format("%s %s create token for %s", usr, (pass ? "can" : "cannot"), usr2);
            it(testName, function(done) {
                var tokenManager = schemaManager.auth[SIS.SCHEMA_TOKENS];
                var token = {
                    username : u2[SIS.FIELD_NAME],
                    desc : "token added by " + u1[SIS.FIELD_NAME]
                };
                tokenManager.add(token, u1, function(err, obj) {
                    if (pass) {
                        // expect pass..
                        should.not.exist(err);
                        should.exist(obj);
                        obj[SIS.FIELD_USERNAME].should.eql(u2[SIS.FIELD_NAME]);
                        done();
                    } else {
                        should.exist(err);
                        done();
                    }
                });
            });
        });

        // delete all users in parallel
        // and ensure the tokens are gone
        superTests.map(function(test) {
            it("Should delete user and all tokens for " + test[1], function(done) {
                var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                var tokenManager = schemaManager.auth[SIS.SCHEMA_TOKENS];
                var u1 = users[test[0]];
                var u2 = users[test[1]];
                userManager.delete(u2[SIS.FIELD_NAME], u1, function(e, u) {
                    should.not.exist(e);
                    should.exist(u);
                    tokenManager.getAll({username : u[SIS.FIELD_NAME]}, null, null)
                    .done(function(res) {
                        res.length.should.eql(0);
                        done();
                    }, done);
                });
            });
        });
    });

});
