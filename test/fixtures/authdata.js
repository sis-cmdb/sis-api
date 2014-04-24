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

// users for tests
(function() {

    var async = require('async');
    var TestUtil = require('./util');

    var genUser = function(name, defaults) {
        defaults.name = name;
        defaults.email = name + '@test.com';
        defaults.pw = name;
        return defaults;
    };

    var createUsers = function() {
        return {
            // superman
            "superman" : genUser("superman", { super_user : true }),
            "superman2" : genUser("superman2", { super_user : true }),
            // admin for test_g1
            "admin1" : genUser("admin1", {
                roles : {
                    "test_g1" : "admin"
                }
            }),
            "admin1_1" : genUser("admin1_1", {
                roles : {
                    "test_g1" : "admin"
                }
            }),
            // admin for test_g2
            "admin2" : genUser("admin2", {
                roles : {
                    "test_g2" : "admin"
                }
            }),
            // admin for one group, user for other
            "admin3" : genUser("admin3", {
               roles : {
                    "test_g1" : "admin",
                    "test_g2" : "user"
                }
            }),
            "admin4" : genUser("admin4", {
                roles : {
                    "test_g1" : "admin",
                    "test_g2" : "admin"
                }
            }),
            "admin5" : genUser("admin5", {
                roles : {
                    "test_g1" : "admin",
                    "test_g2" : "admin",
                    "test_g3" : "admin"
                }
            }),

            // user of test_g1
            "user1" : genUser("user1", {
                roles : {
                    "test_g1" : "user"
                }
            }),
            "user2" : genUser("user2", {
                roles : {
                    "test_g2" : "user"
                }
            }),
            "user3" : genUser("user3", {
                roles : {
                    "test_g1" : "user",
                    "test_g2" : "user"
                }
            }),
            "user4" : genUser("user4", {
                roles : {
                    "test_g1" : "user",
                    "test_g2" : "user",
                    "test_g3" : "user"
                }
            })
        };
    };

    module.exports.createUsers = createUsers;
    // recreate users
    module.exports.initUsers = function(ApiServer, token, users, callback) {
        var names = Object.keys(users);
        async.parallel(names.map(function(name) {
            // delete user
            return function(cb) {
                ApiServer.del('/api/v1/users/' + name, token)
                .end(function(err, res) {
                    if (res.status == 404 || res.status == 200) {
                        var user = users[name];
                        ApiServer.post('/api/v1/users', token)
                            .send(user)
                            .expect(201, cb);
                    } else {
                        return cb("unexpected del status : " + res.status);
                    }
                });
            };
        }), callback);
    };

    module.exports.createTempTokens = function(ApiServer, userToTokens, users, callback) {
        var names = Object.keys(users);
        async.parallel(names.map(function(name) {
            return function(cb) {
                var user = users[name];
                ApiServer.getTempToken(user.name, user.pw, function(err, token) {
                    if (err) { return cb(err); }
                    userToTokens[name] = token;
                    return cb(null, true);
                });
            };
        }), callback);
    };

    module.exports.getAuthSchemas = function() {
        return {
            test_s1 : {
                name : 'test_s1',
                owner : ['test_g1', 'test_g2', 'test_g3'],
                definition : {
                    str : "String",
                    num : "Number"
                },
                track_history : false
            },
            test_s2 : {
                name : 'test_s2',
                owner : ['test_g1', 'test_g2'],
                definition : {
                    str : "String",
                    num : "Number"
                },
                track_history : false
            },
            test_s3 : {
                name : 'test_s3',
                owner : ['test_g2'],
                definition : {
                    str : "String",
                    num : "Number"
                }
            }
        };
    };

    module.exports.deleteSchemas = function(ApiServer, schemas, ensureExists, callback) {
        if (!(schemas instanceof Array)) {
            schemas = TestUtil.objectValues(schemas);
        }
        async.map(schemas, function(schema, cb) {
            var req = ApiServer.del("/api/v1/schemas/" + schema.name);
            if (ensureExists) {
                req = req.expect(200);
            }
            req.end(cb);
        }, callback);
    };

    module.exports.addSchemas = function(ApiServer, schemas, callback) {
        if (!(schemas instanceof Array)) {
            schemas = TestUtil.objectValues(schemas);
        }
        async.map(schemas, function(schema, cb) {
            ApiServer.post("/api/v1/schemas").send(schema)
                .expect(201, cb);
        }, callback);
    };

    module.exports.createAuthEntities = function() {
        return {
            test_s1_e1 : {
                schema : "test_s1",
                entity : {
                    str : "e1",
                    num : 1,
                }
            },
            test_s1_e2 : {
                schema : "test_s1",
                entity : {
                    str : "e2",
                    num : 2,
                    owner : ["test_g1", "test_g2"]
                }
            },
            test_s2_e3 : {
                schema : "test_s2",
                entity : {
                    str : "e3",
                    num : 3,
                    owner : ["test_g3", "test_g4"]
                }
            },
            test_s3_e4 : {
                schema : "test_s3",
                entity : {
                    str : "e4",
                    num : 4
                }
            }
        };
    };

})();
