describe('@API @V1.1API - Hook API', function() {
    "use strict";

    var should = require('should');
    var async = require('async');

    var SIS = require("../../util/constants");
    var config = require('../fixtures/config');
    var TestUtil = require('../fixtures/util');

    var ApiServer = new TestUtil.TestServer();


    it("Should setup fixtures", function(done) {
        ApiServer.start(config, function(e) {
            if (e) { return done(e); }
            ApiServer.becomeSuperUser(done);
        });
    });

    after(function(done) {
        ApiServer.stop(done);
    });

    describe("Hooks failure cases", function() {
        // no hooks.
        it("Should fail if name does not exist ", function(done) {
            ApiServer.get("/api/v1.1/hooks/DNE").expect(404, done);
        });
        it("Should fail to delete non existent hook", function(done) {
            ApiServer.del("/api/v1.1/hooks/DNE")
                .expect(404, done);
        });
        it("Should fail to create an invalid hook", function(done) {
            ApiServer.post("/api/v1.1/hooks")
                .set("Content-Type", "application/json")
                .send({"invalid" : "hook"})
                .expect(400, done);
        });
        it("Should fail to update a hook that doens't exist", function(done) {
            var hook = {
                "name" : "DNE",
                _sis : { "owner" : [ "Test" ] },
                "entity_type" : "Schema",
                "target" : {
                    "action" : "POST",
                    "url" : "http://foo.bar.com/foo"
                },
                "events": ['insert','update']
            };
            ApiServer.put("/api/v1.1/hooks/DNE")
                .set("Content-Type", "application/json")
                .send(hook)
                .expect(404, done);
        });
    });

    describe("CRUD hooks", function() {
        var hook = {
            "name" : "test_hook",
            _sis : { "owner" : [ "Test" ] },
            "entity_type" : "Schema",
            "target" : {
                "action" : "POST",
                "url" : "http://foo.bar.com/foo"
            },
            "events": ['insert','update']
        };
        before(function(done) {
            ApiServer.del('/api/v1.1/hooks/' + hook.name)
                .end(done);
        });

        it("Should create new hook", function(done) {
            ApiServer.post("/api/v1.1/hooks")
                .set('content-type', 'application/json')
                .send(hook)
                .expect(201, done);
        });
        it("Should retrieve the hook", function(done) {
            ApiServer.get("/api/v1.1/hooks/test_hook")
                .expect(200, function(err, res) {
                    should.not.exist(err);
                    should.exist(res.body);
                    for (var k in hook) {
                        if (k === '_sis') { continue; }
                        hook[k].should.eql(res.body[k]);
                    }
                    done();
                });
        });
        it("Should update the hook", function(done) {
            hook.events = ['insert'];
            ApiServer.put("/api/v1.1/hooks/test_hook")
                .set("Content-Type", "application/json")
                .send(hook)
                .expect(200)
                .end(function(err, result) {
                    should.not.exist(err);
                    should.exist(result);
                    should.exist(result.body);
                    should.exist(result.body.events);
                    result.body.events.length.should.eql(1);
                    done();
                });
        });
        it("Should fail to update the hook w/ invalid data", function(done) {
            delete hook.events;
            ApiServer.put("/api/v1.1/hooks/test_hook")
                .set("Content-Type", "application/json")
                .send(hook)
                .expect(400, done);
        });
        it ("Should delete the hook", function(done) {
            ApiServer.del("/api/v1.1/hooks/test_hook")
                .expect(200, done);
        });
    });

    describe("Hook search", function() {
        before(function(done) {
            // insert three hooks
            var hooks = [
                {
                    "name" : "test_hook1",
                    _sis : { "owner" : [ "Test" ] },
                    "entity_type" : "Schema",
                    "target" : {
                        "action" : "POST",
                        "url" : "http://foo.bar.com/foo"
                    },
                    "events": ['insert','update']
                },
                {
                    "name" : "test_hook2",
                    _sis : { "owner" : [ "Test" ] },
                    "entity_type" : "Schema",
                    "target" : {
                        "action" : "POST",
                        "url" : "http://foo.bar.com/foo"
                    },
                    "events": ['insert','update']
                },
                {
                    "name" : "test_hook3",
                    _sis : { "owner" : [ "Test" ] },
                    "entity_type" : "Schema",
                    "target" : {
                        "action" : "POST",
                        "url" : "http://foo.bar.com/foo"
                    },
                    "events": ['insert','update']
                }
            ];
            // async magic - https://github.com/caolan/async
            async.map(hooks, function(hook, callback) {
                ApiServer.post('/api/v1.1/hooks')
                    .send(hook).expect(201, callback);
            }, done);
        });
        after(function(done) {
            async.map(['test_hook1', 'test_hook2', 'test_hook3'],
                function(hook, callback) {
                    ApiServer.del('/api/v1.1/hooks/' + hook)
                             .expect(200, callback);
                }, done);
        });
        it("Should return 2 results", function(done) {
            ApiServer.get("/api/v1.1/hooks")
                .query({ offset : 1, limit : 2})
                .expect(200)
                .end(function(err, res) {
                    should.exist(res.body);
                    res.body.length.should.eql(2);
                    done();
                });
        });
        it("Should return 1 results", function(done) {
            ApiServer.get("/api/v1.1/hooks")
                .query({ q: JSON.stringify({"name" : "test_hook1"}) })
                .expect(200)
                .end(function(err, res) {
                    should.exist(res.body);
                    res.body.length.should.eql(1);
                    done();
                });
        });
    });

});
