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

describe('User Manager', function() {
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

    var userData = require("./fixtures/authdata");
    var users = userData.users;
    var addTests = userData.addTests;
    var superTests = userData.superTests;
    var updateTests = userData.updateTests;


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
                userManager.add(u2, u1, function(err, obj) {
                    if (pass) {
                        // expect pass..
                        should.not.exist(err);
                        should.exist(obj);
                        obj[SIS.FIELD_NAME].should.eql(u2[SIS.FIELD_NAME]);
                        // delete the user
                        userManager.delete(obj[SIS.FIELD_NAME], u1, done);
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
    }

    describe("user management update fields", function() {
        // add all users in parallel
        before(function(done) {
            async.parallel(superTests.map(function(test) {
                var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                var u1 = users[test[0]];
                var u2 = users[test[1]];
                return function(cb) {
                    userManager.add(u2, u1, cb);
                }
            }), done);
        });
        // delete all users in parallel
        after(function(done) {
            async.parallel(superTests.map(function(test) {
                var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                var u1 = users[test[0]];
                var u2 = users[test[1]];
                return function(cb) {
                    userManager.delete(u2[SIS.FIELD_NAME], u1, cb);
                }
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
                userManager.update(copy.name, copy, u1, function(err, obj) {
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
                userManager.update(copy.name, copy, u1, function(err, obj) {
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
                    userManager.add(u2, u1, cb);
                }
            }), done);
        });
        // delete all users in parallel
        after(function(done) {
            async.parallel(superTests.map(function(test) {
                var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                var u1 = users[test[0]];
                var u2 = users[test[1]];
                return function(cb) {
                    userManager.delete(u2[SIS.FIELD_NAME], u1, cb);
                }
            }), done);
        });


        updateTests.map(function(test) {
            var pass = test[5];
            var action = test[2];
            var u1 = users[test[0]];
            var u2 = users[test[1]];
            var group = test[3];
            var role = test[4];
            if (action == 'u') {
                // u1 can/cannot update u2 to group role
                var testName = util.format("%s %s update %s to %s %s",
                                          u1.name, (pass ? "can" : "cannot"), u2.name, group, role);
                it(testName, function(done) {
                    var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                    var oldRoleVal = u2.roles[group];
                    var copy = JSON.parse(JSON.stringify(u2));
                    copy.roles = copy.roles || {};
                    copy.roles[group] = role;
                    userManager.update(u2.name, copy, u1, function(err, obj) {
                        if (pass) {
                            obj = validateUpdate(err, obj);
                            obj.roles[group].should.eql(copy.roles[group]);
                            // revert change
                            copy.roles[group] = oldRoleVal;
                            userManager.update(u2.name, copy, u1, function(err, reverted) {
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
                var testName = util.format("%s %s %s %s to %s",
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
                    userManager.getById(u2.name, function(e1, o1) {
                        userManager.update(u2.name, copy, u1, function(err, obj) {
                            if (pass) {
                                obj = validateUpdate(err, obj);
                                if (action == 'd') {
                                    should.not.exist(obj.roles[group]);
                                    // revert
                                    copy.roles[group] = u2.roles[group];
                                    userManager.update(u2.name, copy, u1, function(err, reverted) {
                                        reverted = validateUpdate(err, reverted);
                                        reverted.roles[group].should.eql(u2.roles[group]);
                                        done();
                                    });
                                } else {
                                    obj.roles[group].should.eql(role);
                                    userManager.getById(obj.name, function(e, o) {
                                        o.toObject().should.eql(obj.toObject());
                                        // revert
                                        delete copy.roles[group];
                                        userManager.update(u2.name, copy, u1, function(err, reverted) {
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