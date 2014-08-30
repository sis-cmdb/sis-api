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
/////////////////////////////////

// all route controllers expose a setup method
module.exports.setup = function(app, config) {
    var controller = new HookController(config);
    controller.attach(app, "/hooks");
};
