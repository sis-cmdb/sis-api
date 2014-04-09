/***********************************************************

 The information in this document is proprietary
 to VeriSign and the VeriSign Product Development.
 It may not be used, reproduced or disclosed without
 the written approval of the General Manager of
 VeriSign Product Development.

 PRIVILEGED AND CONFIDENTIAL
 VERISIGN PROPRIETARY INFORMATION
 REGISTRY SENSITIVE INFORMATION

 Copyright (c) 2014 VeriSign, Inc.  All rights reserved.

 ***********************************************************/

// Helpers for tests
(function() {

    var clearCache = function() {
        // Object.keys(require.cache).forEach(function (key) {
        //     delete require.cache[key];
        // });
    };

    function TestServer() {
        var serverData = null;

        this.start = function(config, callback) {
            if (!process.env.SIS_REMOTE_URL) {
                var SIS = require("../../util/constants");
                // start a local server
                if (!serverData) {
                    var server = require('../../server');
                    server.startServer(config, function(app, http) {
                        var sd = {
                            server : server,
                            mongoose : server.mongoose,
                            http : http,
                            app : app,
                            request : require('supertest')(app),
                            local : true
                        };

                        var schemaManager = app.get('schema_manager');
                        var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
                        // add a sistest_super user
                        var localSuper = {
                            name : 'sistest_local',
                            super_user : true
                        };
                        var sisSuper = {
                            name : 'sistest_super',
                            pw : 'sistest',
                            super_user : true,
                            email : 'sistest@sis.test'
                        };
                        userManager.add(sisSuper, localSuper, function(e, user) {
                            if (e) {
                                return callback(e);
                            }
                            serverData = sd;
                            serverData.schemaManager = schemaManager;
                            serverData.superUser = localSuper;
                            serverData.username = 'sistest_super';
                            serverData.password = 'sistest';
                            callback(null, serverData);
                        });
                    });
                } else {
                    return callback(null, serverData);
                }
            } else {
                if (!process.env.SIS_REMOTE_USERNAME ||
                    !process.env.SIS_REMOTE_PASSWORD) {
                    return callback("super credentials not set.", null);
                }
                serverData = {
                    request : require('supertest')(process.env.SIS_REMOTE_URL),
                    username : process.env.SIS_REMOTE_USERNAME,
                    password : process.env.SIS_REMOTE_PASSWORD
                };
                return callback(null, serverData);
            }
        };

        this.getSuperCreds = function() {
            if (!serverData) {
                return null;
            }
            return {
                username : serverData.username,
                password : serverData.password
            };
        };

        this.authToken = null;

        this.becomeSuperUser = function(callback) {
            var creds = this.getSuperCreds();
            if (!creds) { return callback("not initialized."); }
            var self = this;
            this.getTempToken(creds.username, creds.password, function(e, t) {
                if (e) { return callback(e); }
                self.authToken = t.name;
                callback(null);
            });
        };

        this.newRequest = function(method, url, token) {
            if (!serverData) {
                return null;
            }
            var result = serverData.request[method](url);
            if (method == 'post' || method == 'put') {
                result = result.set("Content-Type", "application/json");
            }
            if (token) {
                result = result.set("x-auth-token", token);
            } else if (this.authToken) {
                result = result.set("x-auth-token", this.authToken);
            }
            return result;
        };

        this.stop = function(callback) {
            clearCache();
            if (!serverData || !serverData.local) {
                return callback();
            }
            serverData.server.stopServer(serverData.http, function() {
                serverData.mongoose.connection.db.dropDatabase(function() {
                    serverData.mongoose.connection.close(callback);
                });
            });
        };

        ['get', 'post', 'put', 'del'].forEach(function(method) {
            this[method] = function(url) {
                return this.newRequest(method, url);
            };
        }.bind(this));

        this.getTempToken = function(username, password, callback) {
            if (!serverData) {
                return callback("server not started.");
            }
            var req = serverData.request.post("/api/v1/users/auth_token")
                                        .auth(username, password);
            req.expect(201, function(err, res) {
                if (err) { return callback(err); }
                return callback(null, res.body);
            });
        };
    }

    module.exports.TestServer = TestServer;

    function LocalTest() {
        var dbData = null;

        this.start = function(config, callback) {
            if (dbData) {
                return callback(null, dbData.mongoose);
            }
            var nconf = require('nconf');
            nconf.env('__').argv();
            nconf.defaults(config);

            var mongoose = require('mongoose');
            mongoose.connect(nconf.get('db').url);
            mongoose.connection.once('open', function() {
                dbData = {
                    mongoose : mongoose
                };
                callback(null, mongoose);
            });
        };

        this.stop = function(callback) {
            clearCache();
            if (!dbData) {
                return callback();
            }
            var mongoose = dbData.mongoose;
            mongoose.connection.db.dropDatabase(function() {
                mongoose.connection.close(callback);
            });
        };

        this.superUser = { name : 'sistest', super_user : true };
    }

    module.exports.LocalTest = LocalTest;

})();
