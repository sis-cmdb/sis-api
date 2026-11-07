describe('Authenticated reads API', function() {
    "use strict";
    var fs = require("fs");
    var path = require("path");
    var nconf = require("nconf");
    var should = require('should');
    var server = require("../server");
    var TestUtil = require('./fixtures/util');
    var ApiServer = new TestUtil.TestServer();

    var schema = {
        "name" : "test_auth_reads",
        _sis : { "owner" : ["test"] },
        "definition" : {
            "str" : "String"
        }
    };
    var script = {
        name : "test_auth_reads_params",
        script_type : "application/javascript",
        script : fs.readFileSync(path.join(__dirname, "fixtures", "scripts", "params.js"), "utf8"),
        _sis : { owner : ["test"] }
    };

    var token = null;
    var entity = null;

    before(function(done) {
        nconf.add("auth_reads", {
            type : "literal",
            store : {
                "app" : { "auth_reads" : true }
            }
        });
        ApiServer.start(function(err, sd) {
            if (err) { return done(err); }
            ApiServer.becomeSuperUser(function(err) {
                if (err) { return done(err); }
                // send tokens explicitly so unauthenticated requests are possible
                token = ApiServer.authToken;
                ApiServer.authToken = null;
                var options = { user : sd.superUser, version : "v1.1" };
                sd.schemaManager.delete(schema.name, options).catch(function() {
                }).then(function() {
                    return sd.schemaManager.add(schema, options);
                }).then(function() {
                    return ApiServer.post("/api/v1.1/entities/" + schema.name, token)
                        .send({ str : "secret" }).expectAsync(201);
                }).then(function(res) {
                    entity = res.body;
                    return ApiServer.del("/api/v1.1/scripts/" + script.name, token).endAsync();
                }).then(function() {
                    return ApiServer.post("/api/v1.1/scripts", token).send(script).expectAsync(201);
                }).then(function() {
                    done();
                }, done);
            });
        });
    });

    after(function(done) {
        nconf.remove("auth_reads");
        ApiServer.del("/api/v1.1/schemas/" + schema.name, token).end(function() {
            ApiServer.del("/api/v1.1/scripts/" + script.name, token).end(function() {
                ApiServer.stop(done);
            });
        });
    });

    function securedPaths() {
        return [
            "/api/v1.1/schemas",
            "/api/v1.1/schemas/" + schema.name,
            "/api/v1.1/schemas/" + schema.name + "/commits",
            "/api/v1.1/hiera",
            "/api/v1.1/hooks",
            "/api/v1.1/scripts",
            "/api/v1.1/scripts/" + script.name,
            "/api/v1.1/users",
            "/api/v1.1/users/sistest_super",
            "/api/v1.1/users/sistest_super/tokens",
            "/api/v1.1/entities/" + schema.name,
            "/api/v1.1/entities/" + schema.name + "/" + entity._id,
            "/api/v1.1/entities/" + schema.name + "/" + entity._id + "/commits",
            "/api/v1.1/entities/" + schema.name + "/" + entity._id + "/revision/" + Date.now(),
            "/api/v1.1/endpoints/" + script.name + "/"
        ];
    }

    it("should reject reads without a token", function() {
        return Promise.all(securedPaths().map(function(p) {
            return ApiServer.get(p).endAsync().then(function(res) {
                res.status.should.eql(400, p);
                res.body.error.should.match(/x-auth-token/, p);
            });
        }));
    });

    it("should reject reads with an unknown token", function() {
        return Promise.all(securedPaths().map(function(p) {
            return ApiServer.get(p, "not-a-real-token").endAsync().then(function(res) {
                res.status.should.eql(401, p);
            });
        }));
    });

    it("should allow reads with a valid token", function() {
        return Promise.all(securedPaths().map(function(p) {
            return ApiServer.get(p, token).endAsync().then(function(res) {
                res.status.should.eql(200, p);
            });
        }));
    });

    it("should return entity data with a valid token", function() {
        return ApiServer.get("/api/v1.1/entities/" + schema.name + "/" + entity._id, token)
            .expectAsync(200).then(function(res) {
                res.body.str.should.eql("secret");
            });
    });

    it("should leave /info open", function(done) {
        ApiServer.get("/api/v1.1/info").expect(200, done);
    });

    it("should leave HEAD / open for health checks", function(done) {
        ApiServer.newRequest("head", "/").expect(200, done);
    });

    it("should still issue tokens with user credentials", function(done) {
        var creds = ApiServer.getSuperCreds();
        ApiServer.getTempToken(creds.username, creds.password, done);
    });

    it("should still require a token for writes", function(done) {
        ApiServer.post("/api/v1.1/entities/" + schema.name)
            .send({ str : "nope" }).expect(400, done);
    });

    describe("config validation", function() {
        it("should reject auth_reads without auth", function() {
            (function() {
                server.validateAppConfig({ auth_reads : true });
            }).should.throw(/auth_reads requires app\.auth/);
            (function() {
                server.validateAppConfig({ auth : false, auth_reads : true });
            }).should.throw(/auth_reads requires app\.auth/);
        });

        it("should accept valid combinations", function() {
            server.validateAppConfig(undefined);
            server.validateAppConfig({ auth : true, auth_reads : true });
            server.validateAppConfig({ auth : false, auth_reads : false });
            server.validateAppConfig({ auth : true });
        });
    });
});
