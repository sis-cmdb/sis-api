describe("Hook Dispatch", function() {
    "use strict";

    var SIS = require("../util/constants");
    var should = require('should');
    var TestUtil = require('./fixtures/util');
    var ApiServer = new TestUtil.TestServer();

    it("Should setup fixtures", function(done) {
        ApiServer.start(function(e) {
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
                _sis : { "owner" : ["Test"] },
                "entity_type" : "sis_hiera",
                "target" : {
                    "action" : "GET",
                    "url" : "http://127.0.0.1:3335/hook"
                },
                "events": [ SIS.EVENT_INSERT ]
            };

            hookHttpServer = hookServer.listen(3335, function(err) {
                if (err) {
                    done(err);
                }
                ApiServer.post('/api/v1.1/hooks')
                    .send(hook)
                    .expect(201, done);
            });
        });

        after(function(done) {
            hookHttpServer.close();
            ApiServer.del('/api/v1.1/hooks/' + hookName)
                .expect(200, done);
        });

        var hiera_data = {
            "name" : "hiera_key",
            _sis : { "owner" : "test" },
            "hieradata" : {
                "field" : "String",
                "field2" : "Number"
            }
        };

        it("Should dispatch the hiera hook", function(doneCb) {
            doneCallback = doneCb;
            ApiServer.post("/api/v1.1/hiera")
                .set('content-type', 'application/json')
                .send(hiera_data)
                .end(function(err, res) { });
        });

        it("Should dispatch the update hook and retry", function(doneCb) {
            doneCallback = doneCb;
            hook.target.action = "POST";
            hook.target.url = "http://127.0.0.1:3335/hook_retry";
            hook.retry_count = 5;
            hook.retry_delay = 1;
            hook.events.push(SIS.EVENT_UPDATE);
            ApiServer.put('/api/v1.1/hooks/' + hook.name)
            .send(hook).expect(200, function(err, result) {
                if (err) { console.log(err); console.log(result); return doneCb(err); }
                hiera_data.hieradata.field3 = 'foo';
                ApiServer.put("/api/v1.1/hiera/hiera_key")
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
                _sis : { "owner" : [ "Test" ] },
                "entity_type" : SIS.SCHEMA_SCHEMAS,
                "target" : {
                    "action" : "POST",
                    "url" : "http://127.0.0.1:3334/hook"
                },
                "events": [ SIS.EVENT_INSERT, SIS.EVENT_UPDATE ]
            };

            hookHttpServer = hookServer.listen(3334, function(err) {
                if (err) {
                    done(err);
                }
                ApiServer.post('/api/v1.1/hooks')
                    .send(hook)
                    .expect(201, done);
            });
        });

        after(function(done) {
            hookHttpServer.close();
            ApiServer.del('/api/v1.1/hooks/' + hookName)
                .expect(200, done);
        });

        var hookSchema = {
            "name" : "test",
            _sis :{ "owner" : "test" },
            "definition" : {
                "field" : "String",
                "field2" : "Number"
            }
        };

        it("Should dispatch the schema hook", function(doneCb) {
            doneCallback = doneCb;
            ApiServer.post("/api/v1.1/schemas")
                .set('content-type', 'application/json')
                .send(hookSchema)
                .end(function(err, res) { });
        });
    });

    describe("Forced Triggers", function() {
                // the done callback that our listening server will callback on
        var doneCallback = null;
        // hook server - receives the hook events
        var hookServer = null;
        var hookHttpServer = null;
        var hookName = "test_force_trigger";
        var hook = null;
        var entity = null;

        before(function(done) {
            var express = require('express');
            var bodyParser = require('body-parser');
            hookServer = express();
            hookServer.use(bodyParser.json());
            hookServer.post('/hook', function(req, res) {
                should.exist(req.body);
                req.body.entity_type.should.eql("test_hook_trigger");
                req.body.hook.should.eql(hookName);
                req.body.event.should.eql(SIS.EVENT_UPDATE);
                req.body.data.should.eql(req.body.old_value);
                req.body.data.should.eql(entity);
                if (doneCallback) {
                    doneCallback();
                }
            });

            var schema = {
                name: "test_hook_trigger",
                _sis: { owner: ["sistest"] },
                definition: {
                    name: "String",
                    num: "Number"
                }
            };

            entity = {
                name: "Forced Trigger",
                num: 1001
            };

            hook = {
                "name" : hookName,
                _sis : { "owner" : [ "Test" ] },
                "entity_type" : "test_hook_trigger",
                "target" : {
                    "action" : "POST",
                    "url" : "http://127.0.0.1:3335/hook"
                },
                "events": [ SIS.EVENT_UPDATE ]
            };

            hookHttpServer = hookServer.listen(3335, function(err) {
                if (err) {
                    done(err);
                    return;
                }

                function postCb(err, res) {
                    if (err) {
                        done(err);
                        return;
                    }
                    entity = res.body;
                    ApiServer.post('/api/v1.1/hooks')
                        .send(hook)
                        .expect(201, done);
                }

                // nuke schema
                ApiServer.del("/api/v1.1/schemas/test_hook_trigger")
                .end(function() {
                    ApiServer.post("/api/v1.1/schemas").send(schema)
                    .expect(201, function(err, res) {
                        if (err) {
                            done(err);
                            return;
                        }
                        ApiServer.post("/api/v1.1/entities/test_hook_trigger")
                        .send(entity).expect(201, postCb);
                    });
                });
            });
        });

        after(function(done) {
            hookHttpServer.close();
            ApiServer.del("/api/v1.1/schemas/test_hook_trigger")
            .expect(200, function(err, res) {
                if (err) {
                    done(err);
                    return;
                }
                ApiServer.del('/api/v1.1/hooks/' + hookName)
                    .expect(200, done);
            });
        });

        it("Should trigger the hook", function(doneCb) {
            var count = 0;
            function d(err) {
                if (err) {
                    doneCb(err);
                    return;
                }
                count++;
                if (count === 2) {
                    doneCb();
                }
            }
            doneCallback = d;
            ApiServer.post("/api/v1.1/hooks/trigger/test_hook_trigger/" + entity._id)
            .set('content-type', 'application/json')
            .expect(200, function(err, res) {
                if (err) {
                    doneCallback = null;
                    doneCb(err);
                    return;
                }
                should.exist(res.body.message);
                should.exist(res.body.type);
                res.body.type.should.eql("test_hook_trigger");
                should.exist(res.body.entity);
                res.body.entity.should.eql(entity);
                d();
            });
        });
    });
});
