"use strict";

var BPromise = require("bluebird");
var nconf = require('nconf');

function loadConfig() {
    nconf.env('__').argv();
    nconf.file("config.test.json", __dirname + "/config.test.json");
}

function TestServer() {
    var serverData = null;

    this.setupRemote = function(url, username, password) {
        //console.log("Remote URL: "+url);
        serverData = {
            request : require('supertest')(url),
            username : username,
            password : password
        };
        return serverData;
    };

    this.start = function(callback) {
        if (!process.env.SIS_REMOTE_URL) {
            var SIS = require("../../util/constants");
            // start a local server
            if (!serverData) {
                loadConfig();
                var server = require('../../server');
                return server.startServer(function(app, http) {
                    var sd = {
                        server : server,
                        mongoose : server.mongoose,
                        http : http,
                        app : app,
                        request : require('supertest')('http://127.0.0.1:' + nconf.get("server:port")),
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
                    userManager.getById(sisSuper.name).then(function(user) {
                        serverData = sd;
                        serverData.schemaManager = schemaManager;
                        serverData.superUser = localSuper;
                        serverData.username = 'sistest_super';
                        serverData.password = 'sistest';
                        callback(null, serverData);
                    }, function(dne) {
                        userManager.add(sisSuper, { user : localSuper }).nodeify(function(e, user) {
                            if (e) {
                                return callback(e);
                            }
                            serverData = sd;
                            serverData.schemaManager = schemaManager;
                            serverData.superUser = localSuper;
                            serverData.username = 'sistest_super';
                            serverData.password = 'sistest';
                            return callback(null, serverData);
                        });
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
            this.setupRemote(process.env.SIS_REMOTE_URL,
                             process.env.SIS_REMOTE_USERNAME,
                             process.env.SIS_REMOTE_PASSWORD);
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
        if (!creds) {
            callback("not initialized.");
            return;
        }
        var self = this;
        this.getTempToken(creds.username, creds.password, function(e, t) {
            if (e) { return callback(e); }
            self.authToken = t.name;
            return callback(null);
        });
    };

    this.newRequest = function(method, url, token) {
        if (!serverData) {
            return null;
        }
        var result = serverData.request[method](url);
        if (method == 'post' || method == 'put') {
            result.set("Content-Type", "application/json");
        }
        if (token) {
            result.set("x-auth-token", token);
        } else if (this.authToken) {
            result.set("x-auth-token", this.authToken);
        }
        result.set('Accept', 'application/json');
        return BPromise.promisifyAll(result,{ multiArgs: true });
    };

    this.stop = function(callback) {
        if (!serverData) {
            return callback("NOTHING TO STOP");
        }
        if (!serverData.local) {
            return callback();
        }
        serverData.server.stopServer(serverData.http, function() {
            serverData.mongoose.connection.close(function(err) {
                if (err) { callback(err); }
                serverData = null;
                callback();
            });
        });
    };

    ['get', 'post', 'put', 'del'].forEach(function(method) {
        this[method] = function(url, token) {
            var result = this.newRequest(method, url, token);
            if (method == 'del') {
                result.set('Content-Length', 0);
            }
            return result;
        };
    }.bind(this));

    this.getTempToken = function(username, password, callback) {
        if (!serverData) {
            return callback("server not started.");
        }
        //console.log("getTempToken username: "+username);
        //console.log("getTempToken password: "+password);
        // This is a supertest object, promisified
        var req = this.post("/api/v1.1/users/auth_token")
                                    .auth(username, password)
                                    .send("auth");
        req.set('Content-Type', null);
        req.expect(201, function(err, res) {
            //console.log("getTempToken Data: "+JSON.stringify(res));
            if (err) { 
                //console.log('getTempToken failed: '+err);
                return callback(err); 
            }
            return callback(null, res.body);
        });
    };
}

module.exports.TestServer = TestServer;

function LocalTest() {
    var dbData = null;

    this.start = function(callback) {
        if (dbData) {
            callback(null, dbData.mongoose);
            return;
        }
        loadConfig();
        var mongoose = require('mongoose');
        mongoose.Promise = BPromise;
        mongoose.connect(nconf.get('db').url);
        mongoose.connection.once('open', function() {
            dbData = {
                mongoose : mongoose
            };
            callback(null, mongoose);
        });
    };

    this.stop = function(callback) {
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

// utilities
// return full - subset.  both are arrays
module.exports.invert = function(full, subset) {
    return full.filter(function(item) {
        return subset.indexOf(item) == -1;
    });
};

// values
module.exports.objectValues = function(obj) {
    var keys = Object.keys(obj);
    return keys.map(function(k) {
        return obj[k];
    });
};
