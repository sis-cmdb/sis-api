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

describe('Authentication', function() {
    before(function(done) {
        config.app[SIS.OPT_USE_AUTH] = true;
        server.startServer(config, function(expressApp, httpSrv) {
            mongoose = server.mongoose;
            schemaManager = expressApp.get("schemaManager");
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

    describe("user management", function() {

        var users = require("./data").users;

        var addTests = [
            // array defining test
            // firstuser can add seconduser pass/fail
            // superman can add everyone
            ["superman", "admin1", true],
            ["superman", "superman2", true],
            ["superman", "admin2", true],
            ["superman", "admin3", true],
            ["superman", "admin4", true],
            ["superman", "user1", true],
            ["superman", "user2", true],
            ["superman", "user3", true],
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

});