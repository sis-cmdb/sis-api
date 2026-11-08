'use strict';

var ApiController = require("./apicontroller");
var SIS = require("../util/constants");

/////////////////////////////////
// User controller
function UserController(config) {
    var opts = { };
    // TODO - secure this when enabling.
    //opts[SIS.OPT_LOG_COMMTS] = true;
    opts[SIS.OPT_TYPE] = SIS.SCHEMA_USERS;
    SIS.UTIL_MERGE_SHALLOW(opts, config);
    ApiController.call(this, opts);
    this.manager = this.sm.auth[SIS.SCHEMA_USERS];
    this.sessionManager = config[SIS.OPT_SESSION_MGR];
}

// inherit
require('util').inherits(UserController, ApiController);

// extend attach to also attach the session token routes
UserController.prototype.attach = function(app, prefix) {
    var self = this;
    var apiPrefix = "/api/:version" + prefix;
    this.auth_token_path = apiPrefix + "/auth_token";
    if (!app.get(SIS.OPT_READONLY)) {
        // logout: ends every session of the authenticated user.  Registered
        // before the base routes so DELETE /users/:id does not capture it.
        app.delete(this.auth_token_path, function(req, res) {
            var p = self.authenticate(req, res, SIS.SCHEMA_TOKENS).then(function(user) {
                return self.manager.endSessions(user[SIS.FIELD_NAME]);
            });
            p.then(function() {
                res.status(204).end();
            }).catch(function(err) {
                self.sendError(res, err);
            });
        });
    }
    ApiController.prototype.attach.call(this, app, prefix);
    // login: exchange Basic credentials for a JWT session token
    app.post(this.auth_token_path, function(req, res) {
        // cors support
        res.set('Access-Control-Allow-Credentials', true);
        req.isAuthTokenReq = true;
        var p = self.authenticate(req, res, 'basic').then(function(user) {
            if (!self.sessionManager) {
                return Promise.reject(SIS.ERR_INTERNAL("Session tokens are not configured."));
            }
            return self.sessionManager.issue(user);
        });
        // hacky
        return self._finish(req, res, p, 201);
    });
};

// No password hashes or server managed fields should be returned.
UserController.prototype.convertToResponseObject = function(req, o) {
    var res = o;
    if (typeof res.toObject == 'function') {
        res = o.toObject();
    }
    if (req.isAuthTokenReq) {
        // token
        var expireDate = o[SIS.FIELD_EXPIRES];
        var timeLeft = expireDate.getTime() - Date.now();
        if (timeLeft <= 0) {
            timeLeft = 0;
        }
        res[SIS.FIELD_EXPIRES] = timeLeft;
    } else {
        delete res.pw;
        delete res[SIS.FIELD_SESSION_GEN];
    }
    return res;
};
/////////////////////////////////

// all route controllers expose a setup method
module.exports.setup = function(app, config) {
    if (!config[SIS.OPT_USE_AUTH]) {
        return;
    }
    var controller = new UserController(config);
    controller.attach(app, "/users");
};
