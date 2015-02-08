'use strict';

var ApiController = require("./apicontroller");
var SIS = require("../util/constants");

/////////////////////////////////
// Scripts controller
function ScriptController(config) {
    var opts = { };
    opts[SIS.OPT_LOG_COMMTS] = true;
    opts[SIS.OPT_TYPE] = SIS.SCHEMA_SCRIPTS;
    opts[SIS.OPT_USE_AUTH] = config[SIS.OPT_USE_AUTH];
    SIS.UTIL_MERGE_SHALLOW(opts, config);
    ApiController.call(this, opts);
    this.manager = require("../util/script-manager")(this.sm, opts);
}

// inherit
require('util').inherits(ScriptController, ApiController);
/////////////////////////////////

// all route controllers expose a setup method
module.exports.setup = function(app, config) {
    var controller = new ScriptController(config);
    controller.attach(app, "/scripts");
};
