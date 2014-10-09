"use strict";

var async = require('async');

var NUM_SCHEMAS = 2;
var ENTITIES_PER_SCHEMA = 5;
var HOOKS_PER_SCHEMA = 1;
var NUM_HIERA = 5;

var createSchemas = function() {
    var result = [];
    for (var i = 0; i < NUM_SCHEMAS; ++i) {
        result.push({
            name : 'seedtest_schema_' + i,
            owner : ['sis_seed'],
            definition : {
                name : { type : "String", required : true, unique : true },
                number : "Number"
            }
        });
    }
    return result;
};

var createEntities = function(schemas) {
    var result = { };
    schemas.forEach(function(s, idx) {
        var entities = [];
        for (var i = 0; i < ENTITIES_PER_SCHEMA; ++i) {
            entities.push({
                owner : ['sis_seed'],
                name : 'seedtest_s' + idx + '_e' + i,
                number : i
            });
        }
        result[s.name] = entities;
    });
    return result;
};

var createHooks = function(schemas) {
    var result = [];
    schemas.forEach(function(schema, idx) {
        for (var i = 0; i < HOOKS_PER_SCHEMA; ++i) {
            result.push({
                name : 'seedtest_hook_s' + idx + '_h' + i,
                target : {
                    url : 'http://sishook.somedomain.com/',
                    action : 'POST'
                },
                events : ['update'],
                owner : ['sis_seed'],
                entity_type : schema.name
            });
        }
    });
    return result;
};

var createHiera = function() {
    var result = [];
    for (var i = 0; i < NUM_HIERA; ++i) {
        result.push({
            name : 'seedtest_hiera_' + i,
            owner : ['sis_seed'],
            hieradata : {
                num : i,
                num_str : i + ''
            }
        });
    }
    return result;
};

var getUpsertFunc = function(ApiServer, items, endpointUrl) {
    function upsert(item ,callback) {
        ApiServer.get(endpointUrl)
            .query({ q : { name : item.name } })
            .expect(200, function(err, res) {
            if (err) { return callback(err); }
            if (res.body.length == 1) {
                // done
                return callback(null, res[0]);
            } else {
                ApiServer.post(endpointUrl)
                    .send(item)
                    .expect(201, function(e, r) {
                        if (e) {
                            console.log("error posting " + item.name + ' to ' + endpointUrl);
                        }
                        callback(e, r);
                    });
            }
        });
    }
    return function(callback) {
        async.map(items, upsert, callback);
    };
};

var getVerifyFunc = function(ApiServer, items, endpointUrl) {
    function verify(item, callback) {
        ApiServer.get(endpointUrl)
            .query({ q : { name : item.name }})
            .expect(200, function(err, res) {
            if (err) { return callback(err); }
            if (res.body.length != 1) {
                return callback(item.name + " not found");
            } else {
                return callback(null, res.body[0]);
            }
        });
    }
    return function(callback) {
        async.map(items, verify, callback);
    };
};

// data
var schemas = createSchemas();
var entities = createEntities(schemas);
var hooks = createHooks(schemas);
var hiera = createHiera();

// seed the data - expects ApiServer to be authenticated
// and started
// data is created all under sis_seed owner
// and schema/hook/hiera names start with seedtest_
module.exports.seedData = function(ApiServer, callback) {
    var funcs = [
        getUpsertFunc(ApiServer, schemas, '/api/v1/schemas'),
        getUpsertFunc(ApiServer, hooks, '/api/v1/hooks'),
        getUpsertFunc(ApiServer, hiera, '/api/v1/hiera')
    ];
    Object.keys(entities).forEach(function(schemaName) {
        var items = entities[schemaName];
        funcs.push(getUpsertFunc(ApiServer, items, '/api/v1/entities/' + schemaName));
    });
    // run them
    async.series(funcs, callback);
};

module.exports.verifySeedData = function(ApiServer, callback) {
    var funcs = [
        getVerifyFunc(ApiServer, schemas, '/api/v1/schemas'),
        getVerifyFunc(ApiServer, hooks, '/api/v1/hooks'),
        getVerifyFunc(ApiServer, hiera, '/api/v1/hiera')
    ];
    Object.keys(entities).forEach(function(schemaName) {
        var items = entities[schemaName];
        funcs.push(getVerifyFunc(ApiServer, items, '/api/v1/entities/' + schemaName));
    });
    // run them
    async.series(funcs, callback);
};

var TestUtil = require('./util');

module.exports.loadReplicationServers = function() {
    if (!process.env.SIS_REMOTE_USERNAME ||
        !process.env.SIS_REMOTE_PASSWORD) {
        throw "SIS remote credentials not set.";
    }
    var username = process.env.SIS_REMOTE_USERNAME;
    var password = process.env.SIS_REMOTE_PASSWORD;
    if (!process.env.SIS_REPL_DATA) {
        throw "No REPL data set.";
    }
    try {
        var parsed = JSON.parse(process.env.SIS_REPL_DATA);
        if (!parsed instanceof Array || !parsed.length) {
            throw "replication data is invalid.";
        }
        var servers = parsed.map(function(serverObj) {
            var server = new TestUtil.TestServer();
            var url = serverObj.url;
            server.setupRemote(url, username, password);
            server.host = serverObj.host;
            return server;
        });
        return servers;
    } catch (ex) {
        throw "error loading servers " + ex;
    }
};

var should = require('should');
module.exports.verifyExpected = function(servers, opts, callback) {
    var url = opts.url;
    var status = opts.status;
    async.map(servers, function(server, cb) {
        server.get(url).expect(status, function(err, res) {
            if (err) { return cb(err); }
            if (opts.data) {
                res.body.should.eql(opts.data);
            }
            cb(null, res.body);
        });
    }, callback);
};
