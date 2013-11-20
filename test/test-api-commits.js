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
var server = require("../server")
var should = require('should');
var request = require('supertest');
var async = require('async');
var mongoose = null;
var schemaManager = null;
var app = null;
var httpServer = null;

describe('History API', function() {
    before(function(done) {
        server.startServer(config, function(expressApp, httpSrv) {
            mongoose = server.mongoose;
            mongoose.set('debug', true);
            schemaManager = expressApp.get("schemaManager");
            app = expressApp;
            httpServer = httpSrv;
            done();
        });
    });

    after(function(done) {
        server.stopServer(httpServer, function() {
            mongoose.connection.db.dropDatabase();
            mongoose.connection.close();
            done();
        });
    });

    // test on sample entity, hooks, schemas, and hiera
    var data = [
        // schemas
        { "prefix" : "/api/v1/schemas",
          "entries" : [
            { "name" : "history_test",
              "owner" : "test",
              "definition" : {
                "name" : "String",
                "data" : "Number"
              }
            },
            { "name" : "history_test",
              "owner" : "test",
              "definition" : {
                "name" : "String",
                "data" : "String",
                "count" : "Number"
              }
            },
            { "name" : "history_test",
              "owner" : "test",
              "definition" : {
                "name" : "String",
                "ip" : "Number",
                "desc" : "String"
              }
            }
          ]
        },

        // hooks
        { "prefix" : "/api/v1/hooks",
          "entries" : [
            { "name" : "hist_hook",
              "owner" : "test",
              "entity_type" : "some_entity",
              "target" : {
                "url" : "http://www.url.com",
                "action" : "POST"
              },
              "events" : ["insert"]
            },
            { "name" : "hist_hook",
              "owner" : "test",
              "entity_type" : "some_entity",
              "target" : {
                "url" : "http://www.url.com/get",
                "action" : "GET"
              },
              "events" : ["insert"]
            },
            { "name" : "hist_hook",
              "owner" : "test",
              "entity_type" : "some_entity",
              "target" : {
                "url" : "http://www.url.com/post",
                "action" : "POST"
              },
              "events" : ["insert", "update"]
            }
          ]
        },

        // hiera
        { "prefix" : "/api/v1/hiera",
          "entries" : [
            { "name" : "hist_hiera",
              "owner" : "test",
              "hieradata" : {
                "field" : "v1",
                "field_n" : 0
              }
            },
            { "name" : "hist_hiera",
              "owner" : "test",
              "hieradata" : {
                "field" : null,
                "new_field" : "new",
                "field_n" : 0
              }
            },
            { "name" : "hist_hiera",
              "owner" : "test",
              "hieradata" : {
                "field" : "v3",
                "field_n" : 20
              }
            }
          ]
        },

        // entities
        { "prefix" : "/api/v1/entities/history_test",
          "id_field" : "_id",
          "entries" : [
            { "name" : "entity_1",
              "ip" : 10001,
              "desc" : "Awesome thing"
            },
            { "name" : "entity_10",
              "ip" : 10005,
              "desc" : "A really Awesome thing"
            },
            { "name" : "entity_10",
              "ip" : 10001,
              "desc" : null
            },
          ]
        }
    ];

    data.map(function(test) {
        var prefix = test['prefix'];
        var idField = test['id_field'] || 'name';
        var entries = test['entries'];
        var items = [];
        describe("Testing commits for " + test['prefix'], function() {
            // insert the entries
            before(function(done) {
                var insertItem = function(idx) {
                    var req = request(app);
                    var status = 201;
                    if (idx >= entries.length) {
                        return done();
                    }
                    if (idx == 0) {
                        req = req.post(prefix);
                    } else {
                        req = req.put(prefix + "/" + items[idx - 1][idField]);
                        status = 200;
                    }
                    req.set('Content-Encoding', 'application/json')
                        .send(entries[idx])
                        .end(function(err, res) {
                            if (err) {
                                return done(err, res)
                            }
                            if (res.status != status) {
                                return done(JSON.stringify(res.body), null);
                            }
                            should.exist(res.body);
                            should.exist(res.body[idField]);
                            should.exist(res.body['_updated_at']);
                            items.push(res.body);
                            setTimeout(function() {
                                insertItem(idx + 1);
                            }, 500);
                        });
                }
                insertItem(0);
            });

            var middleIdx = parseInt(entries.length / 2);
            var middleItemHid = null;

            it("should retrieve " + entries.length + " commit records", function(done) {
                request(app).get(prefix + "/" + items[0][idField] + "/commits")
                    .expect(200, function(err, res) {
                        should.not.exist(err);
                        should.exist(res);
                        should.exist(res.body);
                        items.length.should.eql(res.body.length);
                        middleItemHid = res.body[middleIdx]['_id']
                        done();
                    });
            });

            it("should retrieve the middle item by commit id", function(done) {
                var path = [prefix, items[middleIdx][idField], 'commits', middleItemHid];
                request(app).get(path.join("/"))
                    .expect(200, function(err, res) {
                        should.not.exist(err);
                        should.exist(res.body);
                        should.exist(res.body.value_at);
                        'update'.should.eql(res.body.action);
                        res.body.value_at.should.eql(items[middleIdx]);
                        done();
                    });
            });

            for (var i = 0; i < entries.length; ++i) {

                var createTest = function(i) {
                    return function(done) {
                        var idx = i;
                        var utc = items[idx]['_updated_at'];
                        var path = [prefix, items[idx][idField], 'revision', utc];
                        request(app).get(path.join("/"))
                            .expect(200, function(err, res) {
                                should.not.exist(err);
                                should.exist(res.body);
                                res.body.should.eql(items[idx]);
                                done();
                            });
                    };
                }

                it("should retrieve item " + i + " by updated_at", createTest(i));
            }

            it("should retrieve the middle item by time", function(done) {
                // calculate a time between the middle item and the next item
                var time = (items[middleIdx + 1]['_updated_at'] - items[middleIdx]['_updated_at']) / 2;
                time += items[middleIdx]['_updated_at'];
                var path = [prefix, items[0][idField], 'revision', time];
                request(app).get(path.join("/"))
                    .expect(200, function(err, res) {
                        should.not.exist(err);
                        should.exist(res.body);
                        res.body.should.eql(items[middleIdx]);
                        done();
                    });
            });

        });
    });
});
