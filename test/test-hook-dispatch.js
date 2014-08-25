describe("Hook Dispatch", function() {
    "use strict";

    var SIS = require("../util/constants");
    var config = require('./fixtures/config');
    var should = require('should');
    var TestUtil = require('./fixtures/util');
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

    describe("test-get-hook-dispatch", function() {
        // the done callback that our listening server will callback on
        var doneCallback = null;
        // hook server - receives the hook events
        var hookServer = null;
        var hookHttpServer = null;
        var hookName = "test_hook_get";
        var hook = null;

        before(function(done) {
            var express = require('express');
            var bodyParser = require('body-parser');
            hookServer = express();
            hookServer.use(bodyParser.json());
            hookServer.get('/hook', function(req, res) {
                should.exist(req.query.data);
                var data = req.query.data;
                data.entity_type.should.eql("sis_hiera");
                data.hook.should.eql(hookName);
                data.event.should.eql(SIS.EVENT_INSERT);
                if (doneCallback) {
                    doneCallback();
                }
            });


            var postCount = 0;
            hookServer.post('/hook_retry', function(req, res) {
                should.exist(req.body);
                if (!postCount) {
                    postCount++;
                    res.status(400).send("Need to retry.");
                } else {
                    res.status(200).send("ok");
                    if (doneCallback) {
                        doneCallback();
                    }
                }
            });

            hook = {
                "name" : hookName,
                "owner" : "Test",
                "entity_type" : "sis_hiera",
                "target" : {
                    "action" : "GET",
                    "url" : "http://localhost:3335/hook"
                },
                "events": [ SIS.EVENT_INSERT ]
            };

            hookHttpServer = hookServer.listen(3335, function(err) {
                if (err) {
                    done(err);
                }
                ApiServer.post('/api/v1/hooks')
                    .send(hook)
                    .expect(201, done);
            });
        });

        after(function(done) {
            hookHttpServer.close();
            ApiServer.del('/api/v1/hooks/' + hookName)
                .expect(200, done);
        });

        var hiera_data = {
            "name" : "hiera_key",
            "owner" : "test",
            "hieradata" : {
                "field" : "String",
                "field2" : "Number"
            }
        };

        it("Should dispatch the hiera hook", function(doneCb) {
            doneCallback = doneCb;
            ApiServer.post("/api/v1/hiera")
                .set('content-type', 'application/json')
                .send(hiera_data)
                .end(function(err, res) { });
        });

        it("Should dispatch the update hook and retry", function(doneCb) {
            doneCallback = doneCb;
            hook.target.action = "POST";
            hook.target.url = "http://localhost:3335/hook_retry";
            hook.retry_count = 5;
            hook.retry_delay = 1;
            hook.events.push(SIS.EVENT_UPDATE);
            ApiServer.put('/api/v1/hooks/' + hook.name)
                .send(hook).expect(200, function(err, result) {
                if (err) { return done(err); }
                hiera_data.hieradata.field3 = 'foo';
                ApiServer.put("/api/v1/hiera/hiera_key")
                    .set('content-type', 'application/json')
                    .send(hiera_data)
                    .end(function(err, res) { });
            });
        });
    });

    describe("test-post-hook-dispatch", function() {
        // the done callback that our listening server will callback on
        var doneCallback = null;
        // hook server - receives the hook events
        var hookServer = null;
        var hookHttpServer = null;
        var hookName = "test_hook";
        var hook = null;

        before(function(done) {
            var express = require('express');
            var bodyParser = require('body-parser');
            hookServer = express();
            hookServer.use(bodyParser.json());
            hookServer.post('/hook', function(req, res) {
                should.exist(req.body);
                req.body.entity_type.should.eql(SIS.SCHEMA_SCHEMAS);
                req.body.hook.should.eql(hookName);
                req.body.event.should.eql(SIS.EVENT_INSERT);
                if (doneCallback) {
                    doneCallback();
                }
            });

            hook = {
                "name" : hookName,
                "owner" : [ "Test" ],
                "entity_type" : SIS.SCHEMA_SCHEMAS,
                "target" : {
                    "action" : "POST",
                    "url" : "http://localhost:3334/hook"
                },
                "events": [ SIS.EVENT_INSERT, SIS.EVENT_UPDATE ]
            };

            hookHttpServer = hookServer.listen(3334, function(err) {
                if (err) {
                    done(err);
                }
                ApiServer.post('/api/v1/hooks')
                    .send(hook)
                    .expect(201, done);
            });
        });

        after(function(done) {
            hookHttpServer.close();
            ApiServer.del('/api/v1/hooks/' + hookName)
                .expect(200, done);
        });

        var hookSchema = {
            "name" : "test",
            "owner" : "test",
            "definition" : {
                "field" : "String",
                "field2" : "Number"
            }
        };

        it("Should dispatch the schema hook", function(doneCb) {
            doneCallback = doneCb;
            ApiServer.post("/api/v1/schemas")
                .set('content-type', 'application/json')
                .send(hookSchema)
                .end(function(err, res) { });
        });
    });
});
