var config = require('./test-config');
var mongoose = require('mongoose');
var should = require('should');
var SIS = require("../util/constants");

var config = require('./test-config');
var server = require("../server")
var should = require('should');
var request = require('supertest');
var async = require('async');
var util = require("util");
var mongoose = null;
var schemaManager = null;
var app = null;
var httpServer = null;

describe('Token Manager', function() {
    before(function(done) {
        config.app[SIS.OPT_USE_AUTH] = true;
        server.startServer(config, function(expressApp, httpSrv) {
            mongoose = server.mongoose;
            schemaManager = expressApp.get(SIS.OPT_SCHEMA_MGR);
            should.exist(schemaManager);
            should.exist(schemaManager.auth);
            app = expressApp;
            httpServer = httpSrv;
            done();
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

    var users = require("./data").users;

    if (process.env.SIS_RUN_LONG_TESTS) {
        describe("temp tokens", function() {
            before(function(done) {
                // set the expiration time to 80 seconds (in ms).
                SIS.AUTH_EXPIRATION_TIME = 80000;
                var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                var superUser = users['superman'];
                var admin = users['admin1'];
                userManager.add(admin, superUser, done);
            });
            after(function(done) {
                SIS.AUTH_EXPIRATION_TIME = 1000 * 60 * 60 * 8;
                var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                var superUser = users['superman'];
                userManager.delete('admin1', superUser, done);
            });

            it("should add a temp token", function(done) {
                // mongo ttl thread runs every minute... sort of
                this.timeout(240000);
                console.log("Testing temp token expiration.  This takes a few minutes.");
                var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                var tokenManager = schemaManager.auth[SIS.SCHEMA_TOKENS];
                var user = users['admin1'];
                userManager.createTempToken(user, function(e, token) {
                    should.not.exist(e);
                    should.exist(token);
                    'admin1'.should.eql(token[SIS.FIELD_USERNAME]);
                    setTimeout(function() {
                        tokenManager.getById(token['name'], function(e, token) {
                            should.not.exist(e);
                            should.exist(token);
                            'admin1'.should.eql(token[SIS.FIELD_USERNAME]);
                        });
                    }, 70000);
                    setTimeout(function() {
                        tokenManager.getById(token['name'], function(e, token) {
                            should.exist(e);
                            should.not.exist(token);
                            done();
                        });
                    }, 185000);
                });
            });
        });
    }

    var userData = require("./data");
    var users = userData.users;
    var addTests = userData.addTests;
    var superTests = userData.superTests;
    var updateTests = userData.updateTests;

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
                }
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
                    tokenManager.getAll({username : u[SIS.FIELD_NAME]}, null, null, function(e, res) {
                        should.not.exist(e);
                        res.length.should.eql(0);
                        done();
                    });
                });
            });
        });
    });

});