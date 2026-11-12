
// A class used to manage users, services and tokens

'use strict';

var SIS = require("./constants");
var Manager = require("./manager");
var crypto = require("crypto");

/////////////////////////////////
// Token manager for a particular user
function TokenManager(sm, username) {
    var opts = {};
    Manager.call(this, sm.getSisModel(SIS.SCHEMA_TOKENS), opts);
    this.sm = sm;
    this.username = username;
    this.authEnabled = this.sm.authEnabled;
}

require('util').inherits(TokenManager, Manager);

// override add to use createToken
TokenManager.prototype.add = function(obj, options) {
    var user = options ? options.user : null;
    var err = this.validate(obj, false, options);
    if (err) {
        err = SIS.ERR_BAD_REQ(err);
        return Promise.reject(err);
    }
    var p = this.authorize(SIS.EVENT_INSERT, obj, user)
                .then(this.createToken.bind(this));
    return p;
};

// raw fetch of a token - used for verifying a SIS token
TokenManager.prototype.getTokenByName = function(token) {
    var self = this;
    return Manager.prototype.getById.call(self, token, { lean : true });
};

TokenManager.prototype.getAll = function(condition, options, fields) {
    condition = condition || { };
    condition[SIS.FIELD_USERNAME] = this.username;
    return Manager.prototype.getAll.call(this, condition, options, fields);
};

TokenManager.prototype.getById = function(id, options) {
    var self = this;
    return Manager.prototype.getById.call(self, id, options)
    .then(function(token) {
        // ensure the token matches the requested username
        if (token[SIS.FIELD_USERNAME] !== self.username) {
            return Promise.reject(SIS.ERR_NOT_FOUND('Token for ' + self.username, id));
        }
        return token;
    });
};

TokenManager.prototype.validate = function(obj, toUpdate, options) {
    if (!this.username) {
        return "Token manager assigned to invalid user.";
    }
    if (obj[SIS.FIELD_USERNAME] && obj[SIS.FIELD_USERNAME] !== this.username) {
        return "Token must belong to " + this.username;
    }
    obj[SIS.FIELD_USERNAME] = this.username;
    return null;
};

TokenManager.prototype.createToken = function(token) {
    // save token
    var self = this;
    var createTokenHelper = function() {
        // 128 bits of randomness as hex (replaces the former 'hat' dependency)
        token.name = crypto.randomBytes(16).toString('hex');
        var doc = new self.model(token);
        return Promise.resolve(doc.save()).catch(function(err) {
            if (err && err.code == 11000) {
                // duplicate token name - retry with a fresh one
                return createTokenHelper();
            }
            return Promise.reject(SIS.ERR_INTERNAL(err));
        });
    };
    return createTokenHelper();
};

// check if request user can read the tokens of user
TokenManager.prototype.canAdministerTokensOf = function(reqUser, user) {
    // super users and the user himself can read tokens
    // of the user
    if (reqUser[SIS.FIELD_SUPERUSER] ||
        reqUser[SIS.FIELD_NAME] == user[SIS.FIELD_NAME]) {
        return true;
    }
    if (user[SIS.FIELD_SUPERUSER] && !reqUser[SIS.FIELD_SUPERUSER]) {
        return false;
    }
    // admins of all roles can
    return SIS.UTIL_ENSURE_ROLE_SUBSET(reqUser[SIS.FIELD_ROLES], user[SIS.FIELD_ROLES], true);
};

// only the user, super user
TokenManager.prototype.authorize = function(evt, doc, user, mergedDoc) {
    var self = this;
    if (!doc[SIS.FIELD_USERNAME]) {
        return Promise.reject(SIS.ERR_BAD_REQ("Missing username in token."));
    }
    if (mergedDoc && mergedDoc[SIS.FIELD_USERNAME] != doc[SIS.FIELD_USERNAME]) {
        return Promise.reject(SIS.ERR_BAD_REQ("Cannot change the username of the token."));
    }
    if (mergedDoc && mergedDoc[SIS.FIELD_EXPIRES]) {
        return Promise.reject(SIS.ERR_BAD_REQ("Cannot change a temporary token."));
    }
    if (doc[SIS.FIELD_EXPIRES] && doc[SIS.FIELD_USERNAME] != user[SIS.FIELD_NAME]) {
        return Promise.reject(SIS.ERR_BAD_REQ("Cannot create a temp token for another user."));
    }
    if (!self.authEnabled) {
        return Promise.resolve(mergedDoc || doc);
    }
    if (!user) {
        return Promise.reject(SIS.ERR_BAD_CREDS("User is null."));
    }
    if (!user[SIS.FIELD_ROLES] && !user[SIS.FIELD_SUPERUSER]) {
        return Promise.reject(SIS.ERR_BAD_CREDS("Invalid user."));
    }
    // get the user
    var username = doc[SIS.FIELD_USERNAME];
    return self.sm.auth[SIS.SCHEMA_USERS].getById(username).then(function(tokenUser) {
        if (tokenUser[SIS.FIELD_SUPERUSER] && !doc[SIS.FIELD_EXPIRES]) {
            // super users cannot have a persistent token.  too much power
            return Promise.reject(SIS.ERR_BAD_REQ("Super users cannot have persistent tokens."));
        }
        if (self.canAdministerTokensOf(user, tokenUser)) {
            return Promise.resolve(mergedDoc || doc);
        }
        return Promise.reject(SIS.ERR_BAD_CREDS("Only admins of the user or the user can manage the token."));
    });
};

TokenManager.prototype.canInsertWithId = function(id, obj) {
    // always return false to disable upsert
    return false;
};

/////////////////////////////////

module.exports = function(sm, username) {
    return new TokenManager(sm, username);
};
