// Issues and verifies JWT session tokens (the tokens returned by
// POST /users/auth_token).  Persistent API tokens are not handled here.
//
// Keys are Ed25519 PEM files stored alongside the configuration:
//   <keys_dir>/jwt-<kid>.key  - private key, used to sign (active kid only)
//   <keys_dir>/jwt-<kid>.pub  - public key, used to verify
// keys_dir is resolved against the conf/ directory unless it is absolute.

'use strict';

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var SIS = require("./constants");

var DEFAULT_CONF_DIR = path.join(__dirname, "..", "conf");
var KID_PATTERN = /^[A-Za-z0-9._-]+$/;
var PUB_FILE_PATTERN = /^jwt-([A-Za-z0-9._-]+)\.pub$/;
var JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

// jose is ESM-only, so load it lazily (once) via dynamic import.
var josePromise = null;
function loadJose() {
    if (!josePromise) {
        josePromise = import("jose");
    }
    return josePromise;
}

function keyFileName(kid, ext) {
    return "jwt-" + kid + "." + ext;
}

function configError(msg) {
    return new Error("Invalid app." + SIS.OPT_JWT + " configuration: " + msg);
}

function assertEd25519(key, file) {
    if (key.asymmetricKeyType !== "ed25519") {
        throw configError(file + " is not an Ed25519 key (found " +
                          key.asymmetricKeyType + ")");
    }
}

function sameKey(a, b) {
    var fmt = { type : "spki", format : "der" };
    return a.export(fmt).equals(b.export(fmt));
}

// Resolve the effective settings from the raw app.jwt config
function resolveSettings(jwtConfig, confDir) {
    jwtConfig = jwtConfig || { };
    var activeKid = jwtConfig.active_kid || SIS.JWT_DEFAULT_KID;
    if (typeof activeKid !== "string" || !KID_PATTERN.test(activeKid)) {
        throw configError("active_kid must match " + KID_PATTERN);
    }
    var ttl = SIS.AUTH_EXPIRATION_TIME;
    if (jwtConfig.ttl_ms !== undefined) {
        ttl = Number(jwtConfig.ttl_ms);
        if (!Number.isInteger(ttl) || ttl < 1000) {
            throw configError("ttl_ms must be an integer >= 1000");
        }
    }
    var keysDir = jwtConfig.keys_dir || SIS.JWT_DEFAULT_KEYS_DIR;
    return {
        activeKid : activeKid,
        ttlMs : ttl,
        issuer : jwtConfig.issuer || SIS.JWT_DEFAULT_ISSUER,
        keysDir : path.resolve(confDir || DEFAULT_CONF_DIR, keysDir)
    };
}

function SessionManager(jwtConfig, opts) {
    opts = opts || { };
    var settings = resolveSettings(jwtConfig, opts.confDir);
    this.activeKid = settings.activeKid;
    this.ttlMs = settings.ttlMs;
    this.issuer = settings.issuer;
    this.keysDir = settings.keysDir;
    this.verifyKeys = { };
    this.signingKey = null;
    this._loadKeys(opts.requireSigningKey !== false, opts.logger);
}

SessionManager.prototype._loadKeys = function(requireSigningKey, logger) {
    var self = this;
    var hint = " Run `npm run gen-jwt-key` to create a key pair.";
    var files;
    try {
        files = fs.readdirSync(this.keysDir);
    } catch (ex) {
        throw configError("cannot read keys_dir " + this.keysDir + " (" + ex.code + ")." + hint);
    }

    files.forEach(function(file) {
        var m = PUB_FILE_PATTERN.exec(file);
        if (!m) { return; }
        var full = path.join(self.keysDir, file);
        var key;
        try {
            key = crypto.createPublicKey(fs.readFileSync(full));
        } catch (ex) {
            throw configError("cannot load public key " + full + ": " + ex.message);
        }
        assertEd25519(key, full);
        self.verifyKeys[m[1]] = key;
    });

    var privFile = path.join(this.keysDir, keyFileName(this.activeKid, "key"));
    if (fs.existsSync(privFile)) {
        var priv;
        try {
            priv = crypto.createPrivateKey(fs.readFileSync(privFile));
        } catch (ex) {
            throw configError("cannot load private key " + privFile + ": " + ex.message);
        }
        assertEd25519(priv, privFile);
        var derived = crypto.createPublicKey(priv);
        var pub = this.verifyKeys[this.activeKid];
        if (pub && !sameKey(pub, derived)) {
            throw configError(privFile + " does not match " +
                              keyFileName(this.activeKid, "pub"));
        }
        this.verifyKeys[this.activeKid] = derived;
        this.signingKey = priv;
        if (logger && process.platform !== "win32" &&
            (fs.statSync(privFile).mode & parseInt("077", 8))) {
            logger.warn({ file : privFile },
                        "JWT private key is readable by group or others; chmod 600 it");
        }
    } else if (requireSigningKey) {
        throw configError("missing private key " + privFile + "." + hint);
    }

    if (!Object.keys(this.verifyKeys).length) {
        throw configError("no public keys (jwt-<kid>.pub) found in " + this.keysDir + "." + hint);
    }
};

SessionManager.prototype.canIssue = function() {
    return !!this.signingKey;
};

// Returns a promise for { name : <jwt>, username, expires : Date }
SessionManager.prototype.issue = function(user) {
    var self = this;
    if (!this.signingKey) {
        return Promise.reject(SIS.ERR_BAD_REQ("This server cannot issue session tokens."));
    }
    var username = user[SIS.FIELD_NAME];
    var sgen = user[SIS.FIELD_SESSION_GEN] || 0;
    var nowMs = Date.now();
    var iat = Math.floor(nowMs / 1000);
    var exp = Math.floor((nowMs + this.ttlMs) / 1000);
    return loadJose().then(function(jose) {
        var claims = { };
        claims.sgen = sgen;
        return new jose.SignJWT(claims)
            .setProtectedHeader({ alg : SIS.JWT_ALGORITHM, kid : self.activeKid, typ : "JWT" })
            .setIssuer(self.issuer)
            .setAudience(SIS.JWT_AUDIENCE)
            .setSubject(username)
            .setIssuedAt(iat)
            .setExpirationTime(exp)
            .setJti(crypto.randomBytes(16).toString("hex"))
            .sign(self.signingKey);
    }).then(function(jwt) {
        var result = { };
        result[SIS.FIELD_NAME] = jwt;
        result[SIS.FIELD_USERNAME] = username;
        result[SIS.FIELD_EXPIRES] = new Date(exp * 1000);
        return result;
    });
};

// Returns a promise for the verified claims, or rejects with a
// SIS.ERR_BAD_CREDS error.
SessionManager.prototype.verify = function(token) {
    var self = this;
    return loadJose().then(function(jose) {
        var getKey = function(header) {
            var key = header.kid && self.verifyKeys[header.kid];
            if (!key) {
                throw new Error("unknown kid");
            }
            return key;
        };
        return jose.jwtVerify(token, getKey, {
            algorithms : [SIS.JWT_ALGORITHM],
            issuer : self.issuer,
            audience : SIS.JWT_AUDIENCE,
            typ : "JWT",
            requiredClaims : ["exp", "iat", "sub"],
            clockTolerance : SIS.JWT_CLOCK_TOLERANCE_SEC
        }).then(function(result) {
            var claims = result.payload;
            if (typeof claims.sub !== "string" || !claims.sub ||
                !Number.isInteger(claims.sgen)) {
                return Promise.reject(SIS.ERR_BAD_CREDS("Invalid token."));
            }
            return claims;
        }, function(err) {
            if (err && err.code === "ERR_JWT_EXPIRED") {
                return Promise.reject(SIS.ERR_BAD_CREDS("Token has expired."));
            }
            return Promise.reject(SIS.ERR_BAD_CREDS("Invalid token."));
        });
    });
};

// true if the token has the shape of a JWT (vs. an opaque hex token)
SessionManager.isJwt = function(token) {
    return typeof token === "string" && JWT_PATTERN.test(token);
};

module.exports = function(jwtConfig, opts) {
    return new SessionManager(jwtConfig, opts);
};
module.exports.SessionManager = SessionManager;
module.exports.isJwt = SessionManager.isJwt;
module.exports.keyFileName = keyFileName;
module.exports.KID_PATTERN = KID_PATTERN;
module.exports.DEFAULT_CONF_DIR = DEFAULT_CONF_DIR;
