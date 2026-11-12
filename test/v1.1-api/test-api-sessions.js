describe('@API @V1.1API - JWT sessions', function() {
    "use strict";

    var should = require('should');
    var fs = require('fs');
    var path = require('path');
    var crypto = require('crypto');

    var SIS = require("../../util/constants");
    var TestUtil = require('../fixtures/util');
    var ApiServer = new TestUtil.TestServer();

    var serverData = null;
    var superToken = null;

    // users created for this suite
    var users = {
        jwt_alice : { name : "jwt_alice", pw : "alice-pw", email : "alice@jwt.test",
                      roles : { jwt_g1 : "user" } },
        jwt_bob : { name : "jwt_bob", pw : "bob-pw", email : "bob@jwt.test",
                    roles : { jwt_g1 : "user" } },
        // users without any role cannot update themselves, so carol has one
        jwt_carol : { name : "jwt_carol", pw : "carol-pw", email : "carol@jwt.test",
                      roles : { jwt_g2 : "user" } }
    };

    function login(name, pw) {
        return new Promise(function(resolve, reject) {
            ApiServer.getTempToken(name, pw || users[name].pw, function(err, t) {
                if (err) { return reject(err); }
                resolve(t);
            });
        });
    }

    // a request with no x-auth-token set by the helper
    function rawRequest(method, url) {
        return ApiServer.newRequest(method, url);
    }

    // a simple authenticated write: create a persistent token for self
    function writeAs(name, setAuth) {
        var req = rawRequest('post', "/api/v1.1/users/" + name + "/tokens");
        setAuth(req);
        return req.send({ desc : "jwt test" });
    }

    function withHeader(token) {
        return function(req) { req.set("x-auth-token", token); };
    }

    function withBearer(token, scheme) {
        return function(req) { req.set("Authorization", (scheme || "Bearer") + " " + token); };
    }

    function deleteUser(name) {
        return ApiServer.del("/api/v1.1/users/" + name, superToken).endAsync();
    }

    function createUser(user) {
        return deleteUser(user.name).then(function() {
            return ApiServer.post("/api/v1.1/users", superToken).send(user).expectAsync(201);
        });
    }

    function countStoredTokens(name) {
        var model = serverData.schemaManager.tokenFetcher.model;
        return Promise.resolve(model.countDocuments({ username : name }).exec());
    }

    before(function(done) {
        ApiServer.start(function(err, sd) {
            if (err) { return done(err); }
            serverData = sd;
            var creds = ApiServer.getSuperCreds();
            login(creds.username, creds.password).then(function(t) {
                superToken = t.name;
                return Promise.all(Object.keys(users).map(function(name) {
                    return createUser(users[name]);
                }));
            }).then(function() { done(); }, done);
        });
    });

    after(function(done) {
        Promise.all(Object.keys(users).map(deleteUser)).then(function() {
            ApiServer.stop(done);
        }, done);
    });

    describe("login", function() {
        it("returns a JWT session token with an 8 hour expiry", function() {
            return login("jwt_alice").then(function(t) {
                t.name.split(".").length.should.eql(3);
                t.username.should.eql("jwt_alice");
                t.expires.should.be.a.Number();
                t.expires.should.be.above(SIS.AUTH_EXPIRATION_TIME - 60000);
                t.expires.should.not.be.above(SIS.AUTH_EXPIRATION_TIME);
            });
        });

        it("does not store the session token", function() {
            if (!serverData.local) { return this.skip(); }
            var before = null;
            return countStoredTokens("jwt_alice").then(function(c) {
                before = c;
                return login("jwt_alice");
            }).then(function() {
                return countStoredTokens("jwt_alice");
            }).then(function(c) {
                c.should.eql(before);
            });
        });

        it("rejects bad credentials", function(done) {
            rawRequest('post', "/api/v1.1/users/auth_token")
                .auth("jwt_alice", "wrong")
                .set('Content-Type', null)
                .send("auth")
                .expect(401, done);
        });
    });

    describe("token headers", function() {
        var session = null;
        before(function() {
            return login("jwt_alice").then(function(t) { session = t.name; });
        });

        it("accepts x-auth-token", function() {
            return writeAs("jwt_alice", withHeader(session)).expectAsync(201);
        });

        it("accepts Authorization: Bearer", function() {
            return writeAs("jwt_alice", withBearer(session)).expectAsync(201);
        });

        it("accepts a lowercase bearer scheme", function() {
            return writeAs("jwt_alice", withBearer(session, "bearer")).expectAsync(201);
        });

        it("accepts the same token in both headers", function() {
            return writeAs("jwt_alice", function(req) {
                withHeader(session)(req);
                withBearer(session)(req);
            }).expectAsync(201);
        });

        it("rejects different tokens in the two headers", function() {
            return login("jwt_alice").then(function(other) {
                return writeAs("jwt_alice", function(req) {
                    withHeader(session)(req);
                    withBearer(other.name + "x")(req);
                }).expectAsync(400);
            }).then(function(res) {
                res.body.error.should.match(/different tokens/);
            });
        });

        it("rejects a malformed Bearer header", function() {
            return writeAs("jwt_alice", function(req) {
                req.set("Authorization", "Bearer");
            }).expectAsync(400);
        });

        it("ignores Basic credentials on API routes", function() {
            return writeAs("jwt_alice", function(req) {
                req.auth("jwt_alice", users.jwt_alice.pw);
            }).expectAsync(400).then(function(res) {
                res.body.error.should.match(/x-auth-token or Authorization: Bearer/);
            });
        });

        it("sends a Bearer challenge for an invalid token", function() {
            var bad = session.slice(0, -4) + "AAAA";
            return writeAs("jwt_alice", withBearer(bad)).expectAsync(401).then(function(res) {
                res.headers['www-authenticate'].should.eql('Bearer realm="sis", error="invalid_token"');
                res.body.error.should.match(/Invalid token/);
                res.headers['access-control-expose-headers'].should.match(/WWW-Authenticate/);
            });
        });

        it("rejects an expired JWT", function() {
            if (!serverData.local) { return this.skip(); }
            var keyFile = path.join(__dirname, "..", "fixtures", "keys", "jwt-default.key");
            var key = crypto.createPrivateKey(fs.readFileSync(keyFile));
            var now = Math.floor(Date.now() / 1000);
            return import("jose").then(function(jose) {
                return new jose.SignJWT({ sgen : 0 })
                    .setProtectedHeader({ alg : "EdDSA", kid : "default", typ : "JWT" })
                    .setIssuer("sis").setAudience(SIS.JWT_AUDIENCE).setSubject("jwt_alice")
                    .setIssuedAt(now - 7200).setExpirationTime(now - 3600)
                    .sign(key);
            }).then(function(jwt) {
                return writeAs("jwt_alice", withHeader(jwt)).expectAsync(401);
            }).then(function(res) {
                res.body.error.should.match(/Token has expired/);
            });
        });
    });

    describe("persistent tokens", function() {
        var persistent = null;
        before(function() {
            return login("jwt_bob").then(function(t) {
                return writeAs("jwt_bob", withHeader(t.name)).expectAsync(201);
            }).then(function(res) {
                persistent = res.body.name;
                persistent.should.match(/^[0-9a-f]{32}$/);
            });
        });

        it("still work via x-auth-token", function() {
            return writeAs("jwt_bob", withHeader(persistent)).expectAsync(201);
        });

        it("work via Authorization: Bearer", function() {
            return writeAs("jwt_bob", withBearer(persistent)).expectAsync(201);
        });

        it("are not listed with sessions", function() {
            return ApiServer.get("/api/v1.1/users/jwt_bob/tokens", persistent)
            .expectAsync(200).then(function(res) {
                res.body.forEach(function(t) {
                    should.not.exist(t.expires);
                    t.name.should.match(/^[0-9a-f]{32}$/);
                });
            });
        });

        it("still accept a stored temporary token issued before JWT sessions", function() {
            if (!serverData.local) { return this.skip(); }
            var Model = serverData.schemaManager.tokenFetcher.model;
            var legacy = crypto.randomBytes(16).toString('hex');
            return Promise.resolve(new Model({
                name : legacy, username : "jwt_bob",
                expires : new Date(Date.now() + 60000)
            }).save()).then(function() {
                return writeAs("jwt_bob", withHeader(legacy)).expectAsync(201);
            }).then(function() {
                return writeAs("jwt_bob", withBearer(legacy)).expectAsync(201);
            });
        });
    });

    describe("logout and invalidation", function() {
        it("ends every session of the user and no one else's", function() {
            var a1, a2, b1;
            return Promise.all([login("jwt_alice"), login("jwt_alice"), login("jwt_bob")])
            .then(function(tokens) {
                a1 = tokens[0].name; a2 = tokens[1].name; b1 = tokens[2].name;
                var req = rawRequest('del', "/api/v1.1/users/auth_token");
                withBearer(a1)(req);
                return req.set('Content-Length', 0).expectAsync(204);
            }).then(function() {
                return writeAs("jwt_alice", withHeader(a1)).expectAsync(401);
            }).then(function(res) {
                res.body.error.should.match(/Session has ended/);
                return writeAs("jwt_alice", withHeader(a2)).expectAsync(401);
            }).then(function() {
                return writeAs("jwt_bob", withHeader(b1)).expectAsync(201);
            }).then(function() {
                // a fresh login works again
                return login("jwt_alice");
            }).then(function(t) {
                return writeAs("jwt_alice", withHeader(t.name)).expectAsync(201);
            });
        });

        it("requires a token", function() {
            return rawRequest('del', "/api/v1.1/users/auth_token")
                .set('Content-Length', 0).expectAsync(400);
        });

        it("does not let DELETE /users/:id capture auth_token", function() {
            return login("jwt_alice").then(function(t) {
                return rawRequest('del', "/api/v1.1/users/auth_token")
                    .set("x-auth-token", superToken)
                    .set('Content-Length', 0).expectAsync(204);
            }).then(function() {
                // the super user's session ended, so get a new one
                var creds = ApiServer.getSuperCreds();
                return login(creds.username, creds.password);
            }).then(function(t) {
                superToken = t.name;
            });
        });

        it("ends sessions when the password changes", function() {
            var oldSession = null;
            var user = users.jwt_carol;
            return login("jwt_carol").then(function(t) {
                oldSession = t.name;
                var update = JSON.parse(JSON.stringify(user));
                update.pw = "carol-new-pw";
                return ApiServer.put("/api/v1.1/users/jwt_carol", oldSession)
                    .send(update).expectAsync(200);
            }).then(function() {
                return writeAs("jwt_carol", withHeader(oldSession)).expectAsync(401);
            }).then(function() {
                user.pw = "carol-new-pw";
                return login("jwt_carol");
            }).then(function(t) {
                return writeAs("jwt_carol", withHeader(t.name)).expectAsync(201);
            });
        });

        it("keeps sessions when the same password is sent again", function() {
            var user = users.jwt_carol;
            var session = null;
            return login("jwt_carol").then(function(t) {
                session = t.name;
                return ApiServer.put("/api/v1.1/users/jwt_carol", session)
                    .send(JSON.parse(JSON.stringify(user))).expectAsync(200);
            }).then(function() {
                return writeAs("jwt_carol", withHeader(session)).expectAsync(201);
            });
        });

        it("rejects the session of a deleted user", function() {
            var user = { name : "jwt_dave", pw : "dave-pw", email : "dave@jwt.test", roles : { } };
            var session = null;
            return createUser(user).then(function() {
                return login("jwt_dave", user.pw);
            }).then(function(t) {
                session = t.name;
                return deleteUser("jwt_dave");
            }).then(function() {
                return writeAs("jwt_dave", withHeader(session)).expectAsync(401);
            }).then(function(res) {
                res.body.error.should.match(/Invalid token/);
            });
        });

        it("applies role changes on the next request", function() {
            var session = null;
            var carol = JSON.parse(JSON.stringify(users.jwt_carol));
            return login("jwt_carol").then(function(t) {
                session = t.name;
                // carol cannot administer bob's tokens yet
                return ApiServer.get("/api/v1.1/users/jwt_bob/tokens", session).expectAsync(401);
            }).then(function() {
                carol.roles = { jwt_g1 : "admin" };
                delete carol.pw;
                return ApiServer.put("/api/v1.1/users/jwt_carol", superToken)
                    .send(carol).expectAsync(200);
            }).then(function() {
                return ApiServer.get("/api/v1.1/users/jwt_bob/tokens", session).expectAsync(200);
            });
        });
    });

    describe("session_gen", function() {
        it("is not returned with users", function() {
            return ApiServer.get("/api/v1.1/users/jwt_alice", superToken).expectAsync(200)
            .then(function(res) {
                should.not.exist(res.body.session_gen);
                should.not.exist(res.body.pw);
                return ApiServer.get("/api/v1.1/users", superToken).expectAsync(200);
            }).then(function(res) {
                res.body.forEach(function(u) {
                    should.not.exist(u.session_gen);
                });
            });
        });

        it("cannot be set by clients", function() {
            var session = null;
            var bob = JSON.parse(JSON.stringify(users.jwt_bob));
            delete bob.pw;
            bob.session_gen = 42;
            return login("jwt_bob").then(function(t) {
                session = t.name;
                return ApiServer.put("/api/v1.1/users/jwt_bob", superToken)
                    .send(bob).expectAsync(200);
            }).then(function() {
                // the session is still valid, so session_gen did not change
                return writeAs("jwt_bob", withHeader(session)).expectAsync(201);
            });
        });
    });
});
