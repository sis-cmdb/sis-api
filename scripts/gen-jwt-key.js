// Generate an Ed25519 key pair for signing JWT session tokens.
//
// usage: node scripts/gen-jwt-key.js [--if-missing] [kid] [keys_dir]
//   --if-missing - exit successfully without changes if the pair already exists
//   kid          - key id, defaults to "default" (must match app.jwt.active_kid)
//   keys_dir     - output directory, defaults to conf/keys
//
// Writes <keys_dir>/jwt-<kid>.key (mode 0600) and <keys_dir>/jwt-<kid>.pub.
// Never overwrites existing files.

"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var SIS = require("../util/constants");
var sessions = require("../util/session-manager");

var args = process.argv.slice(2);
var ifMissing = args.indexOf("--if-missing") !== -1;
args = args.filter(function(arg) { return arg !== "--if-missing"; });

var kid = args[0] || SIS.JWT_DEFAULT_KID;
var keysDir = path.resolve(args[1] ||
                           path.join(sessions.DEFAULT_CONF_DIR, SIS.JWT_DEFAULT_KEYS_DIR));

if (!sessions.KID_PATTERN.test(kid)) {
    console.error("kid must match " + sessions.KID_PATTERN);
    process.exit(1);
}

var privFile = path.join(keysDir, sessions.keyFileName(kid, "key"));
var pubFile = path.join(keysDir, sessions.keyFileName(kid, "pub"));

var existing = [privFile, pubFile].filter(function(file) {
    return fs.existsSync(file);
});
if (existing.length == 2 && ifMissing) {
    console.log("Key pair " + kid + " already exists in " + keysDir + "; nothing to do.");
    process.exit(0);
}
if (existing.length) {
    console.error(existing.join(" and ") + " already exists; refusing to overwrite.");
    process.exit(1);
}

var pair = crypto.generateKeyPairSync("ed25519", {
    privateKeyEncoding : { type : "pkcs8", format : "pem" },
    publicKeyEncoding : { type : "spki", format : "pem" }
});

fs.mkdirSync(keysDir, { recursive : true });
// "wx" fails if the file appeared since the check above
fs.writeFileSync(privFile, pair.privateKey, { mode : parseInt("600", 8), flag : "wx" });
fs.writeFileSync(pubFile, pair.publicKey, { mode : parseInt("644", 8), flag : "wx" });

console.log("Wrote " + privFile);
console.log("Wrote " + pubFile);
if (kid !== SIS.JWT_DEFAULT_KID) {
    console.log("Set app.jwt.active_kid to \"" + kid + "\" to sign with this key.");
}
