'use strict';

var ApiController = require("./apicontroller");
var SIS = require("../util/constants");
var passport = require("passport");
var Promise = require("bluebird");

/////////////////////////////////
// Token controller (user level)
function TokenController(config) {
    var opts = { };
    // TODO - secure this when enabling.
    //opts[SIS.OPT_LOG_COMMTS] = true;
    opts[SIS.OPT_TYPE] = SIS.SCHEMA_TOKENS;
    SIS.UTIL_MERGE_SHALLOW(opts, config);
    ApiController.call(this, opts);
    this.manager = this.sm.auth[SIS.SCHEMA_TOKENS];
    this.userManager = this.sm.auth[SIS.SCHEMA_USERS];
}

// inherit
require('util').inherits(TokenController, ApiController);

// Append the query parameter to be that of the user
TokenController.prototype.applyDefaults = function(req) {
    if (req.method == "GET" && req[SIS.FIELD_TOKEN_USER]) {
        var rq = this.parseQuery(req);
        var query = rq.query;
        query[SIS.FIELD_USERNAME] = req.params.uid;
        req.query.q = query;
    }
};

TokenController.prototype.convertToResponseObject = function(req, o) {
    var convertToken = function(token) {
        if (token[SIS.FIELD_EXPIRES]) {
            // change it to be a time in MS
            var d = token[SIS.FIELD_EXPIRES];
            var timeLeft = d.getTime() - Date.now();
            if (timeLeft <= 0) {
                timeLeft = 0;
            }
            if (typeof token.toObject === "function") {
                token = token.toObject();
            }
            token[SIS.FIELD_EXPIRES] = timeLeft;
        }
        return token;
    };
    return convertToken(o);
};

// override main entry points to ensure user exists..
TokenController.prototype.ensureUser = function(req) {
    var uid = req.params.uid;
    return this.userManager.getById(uid, { lean : true });
};

var fixBody = function(req) {
    if (req.method == "PUT" || req.method == "POST") {
        var obj = req.body;
        if (obj) {
            obj[SIS.FIELD_USERNAME] = req[SIS.FIELD_TOKEN_USER][SIS.FIELD_NAME];
            delete obj[SIS.FIELD_EXPIRES];
        }
    }
};

// Wrap the token API to ensure the user requesting it
// is allowed to
TokenController.prototype.wrapApi = function() {
    var self = this;
    // takes in an api controller function(req, res), and
    // returns a wrapper around it
    var wrapFunc = function(func) {
        return function(req, res) {
            self.ensureUser(req).then(function(user) {
                req[SIS.FIELD_TOKEN_USER] = user;
                fixBody(req);
                // need to ensure that only admins of the user
                // super users, or the user himself are
                // getting the tokens
                var p = self.authenticate(req, res, SIS.SCHEMA_TOKENS);
                return p.then(function(auth) {
                    if (self.manager.canAdministerTokensOf(req.user, user)) {
                        func.call(self, req, res);
                    } else {
                        return self.sendError(res, SIS.ERR_BAD_CREDS("Cannot read tokens for user."));
                    }
                });
            })
            .catch(function(err) {
                return self.sendError(res, err);
            });
        };
    };
    var apis = ['get', 'getAll', 'update', 'add', 'delete'];
    for (var i = 0; i < apis.length; ++i) {
        var fname = apis[i];
        this[fname] = wrapFunc(ApiController.prototype[fname]);
    }
};

/////////////////////////////////

// all route controllers expose a setup method
module.exports.setup = function(app, config) {
    if (!config[SIS.OPT_USE_AUTH]) {
        return;
    }

    var controller = new TokenController(config);
    controller.wrapApi();
    controller.attach(app, "/api/v1/users/:uid/tokens");
};
