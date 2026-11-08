describe('Session Manager (JWT)', function() {
    "use strict";

    var should = require('should');
    var fs = require('fs');
    var os = require('os');
    var path = require('path');
    var crypto = require('crypto');
    var childProcess = require('child_process');

    var SIS = require("../util/constants");
    var createSessionManager = require("../util/session-manager");
    var server = require("../server");

    var GEN_SCRIPT = path.join(__dirname, "..", "scripts", "gen-jwt-key.js");
    var tmpDirs = [];
    var jose = null;

    before(function() {
        return import("jose").then(function(mod) { jose = mod; });
    });

    after(function() {
        tmpDirs.forEach(function(dir) {
            fs.rmSync(dir, { recursive : true, force : true });
        });
    });

    function tmpDir() {
        var dir = fs.mkdtempSync(path.join(os.tmpdir(), "sis-jwt-"));
        tmpDirs.push(dir);
        return dir;
    }

    function genKeys(dir, kid) {
        childProcess.execFileSync(process.execPath, [GEN_SCRIPT, kid, dir]);
    }

    function privateKey(dir, kid) {
        return crypto.createPrivateKey(fs.readFileSync(path.join(dir, "jwt-" + kid + ".key")));
    }

    function keyDirWith(kid) {
        var dir = tmpDir();
        genKeys(dir, kid);
        return dir;
    }

    var user = { name : "jwt_user", session_gen : 3 };

    // sign arbitrary claims / headers to exercise verification
    function signRaw(key, header, claims) {
        return new jose.SignJWT(claims).setProtectedHeader(header).sign(key);
    }

    function validClaims() {
        var now = Math.floor(Date.now() / 1000);
        return { iss : "sis", aud : SIS.JWT_AUDIENCE, sub : user.name,
                 iat : now, exp : now + 3600, sgen : 0 };
    }

    function expectInvalid(p, msg) {
        return p.then(function() {
            throw new Error("expected rejection");
        }, function(err) {
            should(err).be.an.Array();
            err[0].should.eql(401);
            err[1].error.should.match(msg || /Invalid token/);
        });
    }

    describe("issue and verify", function() {
        var dir = null;
        var sm = null;
        before(function() {
            dir = keyDirWith("default");
            sm = createSessionManager({ keys_dir : dir });
        });

        it("issues a JWT that verifies", function() {
            return sm.issue(user).then(function(t) {
                createSessionManager.isJwt(t.name).should.be.true();
                t.username.should.eql(user.name);
                var remaining = t.expires.getTime() - Date.now();
                remaining.should.be.above(SIS.AUTH_EXPIRATION_TIME - 5000);
                remaining.should.not.be.above(SIS.AUTH_EXPIRATION_TIME);
                var header = jose.decodeProtectedHeader(t.name);
                header.should.eql({ alg : "EdDSA", kid : "default", typ : "JWT" });
                return sm.verify(t.name);
            }).then(function(claims) {
                claims.sub.should.eql(user.name);
                claims.sgen.should.eql(3);
                claims.iss.should.eql("sis");
                claims.aud.should.eql(SIS.JWT_AUDIENCE);
                claims.jti.should.match(/^[0-9a-f]{32}$/);
            });
        });

        it("defaults the session length to 8 hours", function() {
            sm.ttlMs.should.eql(1000 * 60 * 60 * 8);
        });

        it("honors ttl_ms", function() {
            var short = createSessionManager({ keys_dir : dir, ttl_ms : 60000 });
            return short.issue(user).then(function(t) {
                (t.expires.getTime() - Date.now()).should.not.be.above(60000);
            });
        });

        it("defaults session_gen to 0", function() {
            return sm.issue({ name : "nogen" }).then(function(t) {
                return sm.verify(t.name);
            }).then(function(claims) {
                claims.sgen.should.eql(0);
            });
        });

        it("rejects an expired token", function() {
            var claims = validClaims();
            claims.exp = claims.iat - 120;
            claims.iat -= 3600;
            return signRaw(privateKey(dir, "default"),
                           { alg : "EdDSA", kid : "default", typ : "JWT" }, claims)
            .then(function(jwt) {
                return expectInvalid(sm.verify(jwt), /Token has expired/);
            });
        });

        it("accepts a token within the clock tolerance", function() {
            var claims = validClaims();
            claims.exp = claims.iat - 5;
            return signRaw(privateKey(dir, "default"),
                           { alg : "EdDSA", kid : "default", typ : "JWT" }, claims)
            .then(function(jwt) {
                return sm.verify(jwt);
            });
        });

        it("rejects a tampered payload", function() {
            return sm.issue(user).then(function(t) {
                var parts = t.name.split(".");
                var payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
                payload.sub = "sistest_super";
                parts[1] = Buffer.from(JSON.stringify(payload)).toString("base64url");
                return expectInvalid(sm.verify(parts.join(".")));
            });
        });

        it("rejects alg none", function() {
            var header = Buffer.from(JSON.stringify({ alg : "none", kid : "default", typ : "JWT" }))
                .toString("base64url");
            var payload = Buffer.from(JSON.stringify(validClaims())).toString("base64url");
            return expectInvalid(sm.verify(header + "." + payload + "."));
        });

        it("rejects HS256 signed with the public key", function() {
            var pubPem = fs.readFileSync(path.join(dir, "jwt-default.pub"));
            return signRaw(new Uint8Array(pubPem),
                           { alg : "HS256", kid : "default", typ : "JWT" }, validClaims())
            .then(function(jwt) {
                return expectInvalid(sm.verify(jwt));
            });
        });

        it("rejects an unknown kid", function() {
            return signRaw(privateKey(dir, "default"),
                           { alg : "EdDSA", kid : "other", typ : "JWT" }, validClaims())
            .then(function(jwt) {
                return expectInvalid(sm.verify(jwt));
            });
        });

        it("rejects a token signed by a different key", function() {
            var otherDir = keyDirWith("default");
            return signRaw(privateKey(otherDir, "default"),
                           { alg : "EdDSA", kid : "default", typ : "JWT" }, validClaims())
            .then(function(jwt) {
                return expectInvalid(sm.verify(jwt));
            });
        });

        [["iss", "someone-else"], ["aud", "other-api"]].forEach(function(test) {
            it("rejects the wrong " + test[0], function() {
                var claims = validClaims();
                claims[test[0]] = test[1];
                return signRaw(privateKey(dir, "default"),
                               { alg : "EdDSA", kid : "default", typ : "JWT" }, claims)
                .then(function(jwt) {
                    return expectInvalid(sm.verify(jwt));
                });
            });
        });

        ["sub", "sgen", "exp"].forEach(function(field) {
            it("rejects a token without " + field, function() {
                var claims = validClaims();
                delete claims[field];
                return signRaw(privateKey(dir, "default"),
                               { alg : "EdDSA", kid : "default", typ : "JWT" }, claims)
                .then(function(jwt) {
                    return expectInvalid(sm.verify(jwt));
                });
            });
        });

        it("rejects garbage", function() {
            return expectInvalid(sm.verify("a.b.c"));
        });

        it("detects JWT shaped tokens", function() {
            createSessionManager.isJwt("0123456789abcdef0123456789abcdef").should.be.false();
            createSessionManager.isJwt("a.b").should.be.false();
            createSessionManager.isJwt("aa.bb.cc").should.be.true();
            createSessionManager.isJwt(undefined).should.be.false();
        });
    });

    describe("key loading", function() {
        it("verifies tokens from a rotated out key while its .pub remains", function() {
            var dir = keyDirWith("old");
            var oldSm = createSessionManager({ keys_dir : dir, active_kid : "old" });
            genKeys(dir, "new");
            fs.unlinkSync(path.join(dir, "jwt-old.key"));
            var newSm = createSessionManager({ keys_dir : dir, active_kid : "new" });
            return oldSm.issue(user).then(function(t) {
                return newSm.verify(t.name);
            }).then(function(claims) {
                claims.sub.should.eql(user.name);
                return newSm.issue(user);
            }).then(function(t) {
                jose.decodeProtectedHeader(t.name).kid.should.eql("new");
            });
        });

        it("resolves a relative keys_dir against the conf directory", function() {
            var confDir = tmpDir();
            genKeys(path.join(confDir, "mykeys"), "default");
            var sm = createSessionManager({ keys_dir : "mykeys" }, { confDir : confDir });
            sm.keysDir.should.eql(path.join(confDir, "mykeys"));
            sm.canIssue().should.be.true();
        });

        it("defaults keys_dir to conf/keys", function() {
            var confDir = tmpDir();
            genKeys(path.join(confDir, "keys"), "default");
            createSessionManager(undefined, { confDir : confDir }).canIssue().should.be.true();
        });

        it("fails when the keys directory is missing", function() {
            (function() {
                createSessionManager({ keys_dir : path.join(tmpDir(), "nope") });
            }).should.throw(/cannot read keys_dir.*gen-jwt-key/);
        });

        it("fails when the active private key is missing", function() {
            var dir = keyDirWith("default");
            (function() {
                createSessionManager({ keys_dir : dir, active_kid : "other" });
            }).should.throw(/missing private key .*jwt-other\.key/);
        });

        it("allows verify-only mode with just public keys", function() {
            var dir = keyDirWith("default");
            fs.unlinkSync(path.join(dir, "jwt-default.key"));
            var sm = createSessionManager({ keys_dir : dir }, { requireSigningKey : false });
            sm.canIssue().should.be.false();
            return sm.issue(user).then(function() {
                throw new Error("expected rejection");
            }, function(err) {
                err[0].should.eql(400);
            });
        });

        it("fails with no public keys", function() {
            var dir = tmpDir();
            (function() {
                createSessionManager({ keys_dir : dir }, { requireSigningKey : false });
            }).should.throw(/no public keys/);
        });

        it("fails when the private and public keys do not match", function() {
            var dir = keyDirWith("default");
            var other = keyDirWith("default");
            fs.copyFileSync(path.join(other, "jwt-default.pub"), path.join(dir, "jwt-default.pub"));
            (function() {
                createSessionManager({ keys_dir : dir });
            }).should.throw(/does not match/);
        });

        it("fails on a non Ed25519 key", function() {
            var dir = tmpDir();
            var pair = crypto.generateKeyPairSync("ec", {
                namedCurve : "P-256",
                publicKeyEncoding : { type : "spki", format : "pem" },
                privateKeyEncoding : { type : "pkcs8", format : "pem" }
            });
            fs.writeFileSync(path.join(dir, "jwt-default.pub"), pair.publicKey);
            (function() {
                createSessionManager({ keys_dir : dir }, { requireSigningKey : false });
            }).should.throw(/not an Ed25519 key/);
        });

        it("rejects invalid settings", function() {
            var dir = keyDirWith("default");
            (function() {
                createSessionManager({ keys_dir : dir, active_kid : "../x" });
            }).should.throw(/active_kid/);
            (function() {
                createSessionManager({ keys_dir : dir, ttl_ms : "soon" });
            }).should.throw(/ttl_ms/);
        });

        it("warns when the private key is readable by others", function() {
            var dir = keyDirWith("default");
            fs.chmodSync(path.join(dir, "jwt-default.key"), parseInt("644", 8));
            var warnings = [];
            createSessionManager({ keys_dir : dir }, {
                logger : { warn : function(obj, msg) { warnings.push(msg); } }
            });
            warnings.length.should.eql(1);
            warnings[0].should.match(/chmod 600/);
        });
    });

    describe("server integration", function() {
        it("needs no keys when auth is disabled", function() {
            should(server.createSessionManager({ auth : false })).be.null();
        });

        it("requires the private key unless the server is readonly", function() {
            var dir = keyDirWith("default");
            fs.unlinkSync(path.join(dir, "jwt-default.key"));
            (function() {
                server.createSessionManager({ auth : true, jwt : { keys_dir : dir } });
            }).should.throw(/missing private key/);
            server.createSessionManager({ auth : true, readonly : true, jwt : { keys_dir : dir } })
                .canIssue().should.be.false();
        });
    });

    describe("gen-jwt-key script", function() {
        it("writes a 0600 private key and refuses to overwrite", function() {
            var dir = tmpDir();
            genKeys(dir, "k1");
            (fs.statSync(path.join(dir, "jwt-k1.key")).mode & parseInt("777", 8))
                .should.eql(parseInt("600", 8));
            (function() {
                childProcess.execFileSync(process.execPath, [GEN_SCRIPT, "k1", dir],
                                          { stdio : "pipe" });
            }).should.throw();
        });

        it("is a no-op with --if-missing when the pair exists", function() {
            var dir = keyDirWith("k2");
            var before = fs.readFileSync(path.join(dir, "jwt-k2.key"));
            childProcess.execFileSync(process.execPath, [GEN_SCRIPT, "--if-missing", "k2", dir]);
            fs.readFileSync(path.join(dir, "jwt-k2.key")).equals(before).should.be.true();
        });

        it("refuses --if-missing when only half of the pair exists", function() {
            var dir = keyDirWith("k3");
            fs.unlinkSync(path.join(dir, "jwt-k3.pub"));
            (function() {
                childProcess.execFileSync(process.execPath, [GEN_SCRIPT, "--if-missing", "k3", dir],
                                          { stdio : "pipe" });
            }).should.throw();
        });

        it("rejects an invalid kid", function() {
            (function() {
                childProcess.execFileSync(process.execPath, [GEN_SCRIPT, "../bad", tmpDir()],
                                          { stdio : "pipe" });
            }).should.throw();
        });
    });
});
