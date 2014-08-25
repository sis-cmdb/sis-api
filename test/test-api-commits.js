describe('@API - History API', function() {
    "use strict";

    var should = require('should');
    var SIS = require("../util/constants");
    var config = require('./fixtures/config');
    var TestUtil = require('./fixtures/util');
    var ApiServer = new TestUtil.TestServer();
    var async = require('async');

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
          ],
          del_url : "/api/v1/schemas/history_test"
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
          ],
          del_url : "/api/v1/hooks/hist_hook"
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
          ],
          "type" : "hiera",
          del_url : "/api/v1/hiera/hist_hiera"
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

    it("Should setup fixtures", function(done) {
        ApiServer.start(config, function(e) {
            if (e) { return done(e); }
            ApiServer.becomeSuperUser(function(err) {
                if (err) { return done(err); }
                // delete
                async.map(data, function(d, cb) {
                    if (!d.del_url) { return cb(null); }
                    ApiServer.del(d.del_url).end(cb);
                }, done);
            });
        });
    });

    after(function(done) {
        ApiServer.stop(done);
    });

    data.map(function(test) {
        var prefix = test.prefix;
        var idField = test.id_field || 'name';
        var entries = test.entries;
        var items = [];
        describe("Testing commits for " + test.prefix, function() {
            // insert the entries
            before(function(done) {
                var insertItem = function(idx) {
                    if (idx >= entries.length) {
                        return done();
                    }
                    var url = prefix;
                    var method = 'post';
                    var status = 201;
                    if (idx > 0) {
                        method = 'put';
                        url = prefix + "/" + items[idx - 1][idField];
                        status = 200;
                    }
                    ApiServer.newRequest(method, url)
                        .send(entries[idx])
                        .end(function(err, res) {
                            if (err) {
                                return done(err, res);
                            }
                            if (res.status != status) {
                                return done(JSON.stringify(res.body), null);
                            }
                            should.exist(res.body);
                            should.exist(res.body[idField]);
                            should.exist(res.body._updated_at);
                            items.push(res.body);
                            var item = res.body;
                            // ensure get matches
                            ApiServer.get(prefix + "/" + res.body[idField])
                                .expect(200, function(err, res) {
                                if (test.type !== "hiera") {
                                    item.should.eql(res.body);
                                } else {
                                    item.hieradata.should.eql(res.body);
                                }
                                setTimeout(function() {
                                    insertItem(idx + 1);
                                }, 500);
                            });
                        });
                };
                insertItem(0);
            });

            var middleIdx = parseInt(entries.length / 2, 10);
            var middleItemHid = null;

            it("should retrieve " + entries.length + " commit records", function(done) {
                ApiServer.newRequest('get', prefix + "/" + items[0][idField] + "/commits")
                    .query({ q : { date_modified : { $gte : items[0]._created_at } }})
                    .expect(200, function(err, res) {
                        should.not.exist(err);
                        should.exist(res);
                        should.exist(res.body);
                        res.body.length.should.eql(items.length);
                        middleItemHid = res.body[middleIdx]._id;
                        done();
                    });
            });

            it("should retrieve the middle item by commit id", function(done) {
                var path = [prefix, items[middleIdx][idField], 'commits', middleItemHid];
                ApiServer.newRequest('get', path.join("/"))
                    .expect(200, function(err, res) {
                        should.not.exist(err);
                        should.exist(res.body);
                        should.exist(res.body.value_at);
                        'update'.should.eql(res.body.action);
                        res.body.value_at.should.eql(items[middleIdx]);
                        done();
                    });
            });

            var createTest = function(idx) {
                return function(done) {
                    var utc = items[idx]._updated_at;
                    var path = [prefix, items[idx][idField], 'revision', utc];
                    var url = path.join("/");
                    ApiServer.get(url)
                        .expect(200, function(err, res) {
                            should.not.exist(err);
                            should.exist(res.body);
                            res.body.should.eql(items[idx]);
                            done();
                        });
                };
            };

            for (var i = 0; i < entries.length; ++i) {
                it("should retrieve item " + i + " by updated_at", createTest(i));
            }

            it("should retrieve the middle item by time", function(done) {
                // calculate a time between the middle item and the next item
                var time = (items[middleIdx + 1]._updated_at - items[middleIdx]._updated_at) / 2;
                time += items[middleIdx]._updated_at;
                var path = [prefix, items[0][idField], 'revision', time];
                ApiServer.newRequest('get', path.join("/"))
                    .expect(200, function(err, res) {
                        should.not.exist(err);
                        should.exist(res.body);
                        res.body.should.eql(items[middleIdx]);
                        done();
                    });
            });

        });
    });

    describe("Test prevent commit tracking", function() {
        var schema = {
            name : "history_test_2",
            owner : ["sistest"],
            definition : {
                name : "String",
                number : "Number"
            },
            track_history : false
        };
        var entity = {
            name : "e1",
            number : 1
        };
        before(function(done) {
            ApiServer.del('/api/v1/schemas/history_test_2')
                .end(function(err, res) {
                ApiServer.post("/api/v1/schemas")
                    .send(schema)
                    .expect(201, function(err, res) {
                        should.not.exist(err);
                        ApiServer.post("/api/v1/entities/history_test_2")
                            .send(entity).expect(201, function(err, res) {

                            should.not.exist(err);
                            entity = res.body;
                            entity.number = 2;
                            ApiServer.put("/api/v1/entities/history_test_2/" + entity._id)
                                .send(entity).expect(200, done);
                    });
                });
            });
        });

        it("Should not retrieve any commits", function(done) {
            ApiServer.get("/api/v1/entities/history_test_2/" + entity._id + "/commits")
                .expect(200, function(err, res) {
                    should.not.exist(err);
                    res.body.should.eql([]);
                    done();
                });
        });
    });

    describe("Updating with the same content", function() {
        var schema = {
            name : "history_test_3",
            owner : ["sistst"],
            definition : {
                name : "String"
            }
        };

        var entity = {
            name : "testme"
        };

        before(function(done) {
            ApiServer.del('/api/v1/schemas/history_test_3')
                .end(function(err, res) {
                ApiServer.post("/api/v1/schemas")
                    .send(schema)
                    .expect(201, function(err, res) {
                        should.not.exist(err);
                        ApiServer.post("/api/v1/entities/history_test_3")
                            .send(entity).expect(201, function(err, res) {
                            should.not.exist(err);
                            entity = res.body;
                            ApiServer.put("/api/v1/entities/history_test_3/" + entity._id)
                                .send(entity).expect(200, done);
                    });
                });
            });
        });

        it("should only have one commit", function(done) {
            ApiServer.get("/api/v1/entities/history_test_3/" + entity._id + "/commits")
                .expect(200, function(err, res) {
                    should.not.exist(err);
                    res.body.length.should.eql(1);
                    done();
                });
        });
    });

});
