'use strict';

var ApiController = require("./apicontroller");
var SIS = require("../util/constants");

/////////////////////////////////
// Hook controller
function HookController(config) {
    var opts = { };
    opts[SIS.OPT_LOG_COMMTS] = true;
    opts[SIS.OPT_TYPE] = SIS.SCHEMA_HOOKS;
    opts[SIS.OPT_USE_AUTH] = config[SIS.OPT_USE_AUTH];
    SIS.UTIL_MERGE_SHALLOW(opts, config);
    ApiController.call(this, opts);
    this.manager = require("../util/hook-manager")(this.sm, opts);
}

// inherit
require('util').inherits(HookController, ApiController);

HookController.prototype.attach = function(app, prefix) {
    ApiController.prototype.attach.call(this, app, prefix);
    var triggerPath = this.apiPrefix + "/trigger/:schema/:id";
    app.post(triggerPath, function(req, res) {
        var options = this._getReqOptions(req);
        var id = req.params.id;
        var schema = req.params.schema;
        var p = this.manager.triggerHooks(schema, id, options);
        return this._finish(req, res, p, 200);
    }.bind(this));
};

HookController.prototype.shouldSaveCommit = function(req) {
    if (req.method === "POST" &&
        req.path.indexOf("/hooks/trigger/") !== -1) {
        return false;
    }
    return ApiController.prototype.shouldSaveCommit.call(this, req);
};

/////////////////////////////////

// all route controllers expose a setup method
module.exports.setup = function(app, config) {
    var controller = new HookController(config);
    controller.attach(app, "/hooks");
};
