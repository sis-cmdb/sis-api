describe('User Manager', function() {
    "use strict";

    var should = require('should');
    var util = require('util');
    var async = require('async');

    var SIS = require("../util/constants");
    var TestUtil = require('./fixtures/util');
    var LocalTest = new TestUtil.LocalTest();
    var schemaManager = null;

    before(function(done) {
        LocalTest.start(function(err, mongoose) {
            schemaManager = require("../util/schema-manager")(mongoose, { auth : true });
            done(err);
        });
    });

    after(function(done) {
        LocalTest.stop(done);
    });

    var AuthFixture = require("./fixtures/authdata");
    var users = AuthFixture.createUsers();

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
        ["superman", "user_g3", true],
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

    describe("user management add/delete", function() {

        addTests.map(function(test) {
            var usr = test[0];
            var usr2 = test[1];
            var pass = test[2];
            var testName = util.format("%s %s add %s", usr, (pass ? "can" : "cannot"), usr2);
            it(testName, function(done) {
                var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                var u1 = users[usr];
                var u2 = users[usr2];
                userManager.add(u2, { user : u1 }).nodeify(function(err, obj) {
                    if (pass) {
                        // expect pass..
                        should.not.exist(err);
                        should.exist(obj);
                        obj[SIS.FIELD_NAME].should.eql(u2[SIS.FIELD_NAME]);
                        // delete the user
                        userManager.delete(obj[SIS.FIELD_NAME], { user : u1 }).nodeify(done);
                    } else {
                        should.exist(err);
                        done();
                    }
                });
            });
        });

    });

    var validateUpdate = function(err, obj) {
        should.not.exist(err);
        should.exist(obj);
        obj.should.be.instanceof(Array);
        obj = obj[1];
        should.exist(obj);
        return obj;
    };

    describe("user management update fields", function() {
        // add all users in parallel
        before(function(done) {
            async.parallel(superTests.map(function(test) {
                var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                var u1 = users[test[0]];
                var u2 = users[test[1]];
                return function(cb) {
                    userManager.add(u2, { user : u1 }).nodeify(cb);
                };
            }), done);
        });
        // delete all users in parallel
        after(function(done) {
            async.parallel(superTests.map(function(test) {
                var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                var u1 = users[test[0]];
                var u2 = users[test[1]];
                return function(cb) {
                    userManager.delete(u2[SIS.FIELD_NAME], { user : u1 }).nodeify(cb);
                };
            }), done);
        });

        // super users can update fields on anyone
        addTests.map(function(test) {
            var pass = test[2];
            var u1 = users[test[0]];
            var u2 = users[test[1]];
            // non super users can't update fields of another
            if (!u1.super_user && u1.name != u2.name) {
                pass = false;
            }
            var testName = util.format("%s %s update fields for %s", test[0], (test[2] ? "can" : "cannot"), test[1]);
            it(testName, function(done) {
                var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                // copy u2 to prevent tainting the object
                var copy = JSON.parse(JSON.stringify(u2));
                // set the email field
                copy.email = u1.name + "." + copy.name + "@test.com";
                userManager.update(copy.name, copy, { user : u1 }).nodeify(function(err, obj) {
                    if (pass) {
                        // expect pass..
                        obj = validateUpdate(err, obj);
                        obj.email.should.eql(copy.email);
                    } else {
                        should.exist(err);
                    }
                    done();
                });
            });
        });

        // users should be able to update their own fields
        Object.keys(users).map(function(username) {
            // superman wasn't added..
            if (username == "superman") { return; }
            it(username + " can update fields on itself", function(done) {
                var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                var u1 = users[username];
                var copy = JSON.parse(JSON.stringify(u1));
                // set the email field
                copy.email = username + "." + username + "@test.com";
                userManager.update(copy.name, copy, { user : u1 }).nodeify(function(err, obj) {
                    // expect pass..
                    obj = validateUpdate(err, obj);
                    obj.email.should.eql(copy.email);
                    done();
                });
            });
        });

    });

    describe("user management modify roles:", function() {
        // add all users in parallel
        before(function(done) {
            async.parallel(superTests.map(function(test) {
                var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                var u1 = users[test[0]];
                var u2 = users[test[1]];
                return function(cb) {
                    userManager.add(u2, { user : u1 }).nodeify(cb);
                };
            }), done);
        });
        // delete all users in parallel
        after(function(done) {
            async.parallel(superTests.map(function(test) {
                var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                var u1 = users[test[0]];
                var u2 = users[test[1]];
                return function(cb) {
                    userManager.delete(u2[SIS.FIELD_NAME], { user : u1 }).nodeify(cb);
                };
            }), done);
        });


        updateTests.map(function(test) {
            var pass = test[5];
            var action = test[2];
            var u1 = users[test[0]];
            var u2 = users[test[1]];
            var group = test[3];
            var role = test[4];
            var testName = null;
            if (action == 'u') {
                // u1 can/cannot update u2 to group role
                testName = util.format("%s %s update %s to %s %s",
                                          u1.name, (pass ? "can" : "cannot"), u2.name, group, role);
                it(testName, function(done) {
                    var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                    var oldRoleVal = u2.roles[group];
                    var copy = JSON.parse(JSON.stringify(u2));
                    copy.roles = copy.roles || {};
                    copy.roles[group] = role;
                    userManager.update(u2.name, copy, { user : u1 }).nodeify(function(err, obj) {
                        if (pass) {
                            obj = validateUpdate(err, obj);
                            obj.roles[group].should.eql(copy.roles[group]);
                            // revert change
                            copy.roles[group] = oldRoleVal;
                            userManager.update(u2.name, copy, { user : u1 }).nodeify(function(err, reverted) {
                                reverted = validateUpdate(err, reverted);
                                reverted.roles[group].should.eql(u2.roles[group]);
                                done();
                            });
                        } else {
                            should.exist(err);
                            done();
                        }
                    });
                });
            } else {
                // u1 can/canmot add/remove group to u2
                testName = util.format("%s %s %s %s to %s",
                                          u1.name, (pass ? "can" : "cannot"),
                                          (action == 'a' ? 'add' : 'remove'), group, u2.name);
                it(testName, function(done) {
                    var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                    var copy = JSON.parse(JSON.stringify(u2));
                    copy.roles = copy.roles || {};
                    if (action == 'd') {
                        delete copy.roles[group];
                    } else {
                        copy.roles[group] = role;
                    }
                    userManager.getById(u2.name).done(function(o1) {
                        userManager.update(u2.name, copy, { user : u1 }).nodeify(function(err, obj) {
                            if (pass) {
                                obj = validateUpdate(err, obj);
                                if (action == 'd') {
                                    should.not.exist(obj.roles[group]);
                                    // revert
                                    copy.roles[group] = u2.roles[group];
                                    userManager.update(u2.name, copy, { user : u1 }).nodeify(function(err, reverted) {
                                        reverted = validateUpdate(err, reverted);
                                        reverted.roles[group].should.eql(u2.roles[group]);
                                        done();
                                    });
                                } else {
                                    obj.roles[group].should.eql(role);
                                    userManager.getById(obj.name).done(function(o) {
                                        o.toObject().should.eql(obj.toObject());
                                        // revert
                                        delete copy.roles[group];
                                        userManager.update(u2.name, copy, { user : u1 }).nodeify(function(err, reverted) {
                                            reverted = validateUpdate(err, reverted);
                                            should.not.exist(reverted.roles[group]);
                                            done();
                                        });
                                    });
                                }
                            } else {
                                should.exist(err);
                                done();
                            }
                        });
                    });
                });
            }
        });
    });
});
