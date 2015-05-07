'use strict';

var ApiController = require("./apicontroller");
var SIS = require("../util/constants");
var BPromise = require("bluebird");

/////////////////////////////////
// Hiera controller
function HieraController(config) {
    var opts = { };
    opts[SIS.OPT_LOG_COMMTS] = true;
    opts[SIS.OPT_FIRE_HOOKS] = true;
    opts[SIS.OPT_TYPE] = SIS.SCHEMA_HIERA;
    opts[SIS.OPT_USE_AUTH] = config[SIS.OPT_USE_AUTH];
    SIS.UTIL_MERGE_SHALLOW(opts, config);
    ApiController.call(this, opts);
    this.manager = require("../util/hiera-manager")(this.sm, opts);
}

// inherit
require('util').inherits(HieraController, ApiController);

// The GET/:id request needs to send only the hiera object back
HieraController.prototype.convertToResponseObject = function(req, obj) {
    if (typeof obj.hieradata === 'undefined') {
        obj.hieradata = { };
    }
    if (req.method == "GET" && req.params.id &&
        !req.params.isCommitApi) {
        // dirty hack to inform the caller that no more
        // conversions are necessary.
        req.params.doneConverting = true;
        return JSON.stringify(obj.hieradata);
    }
    if (typeof obj.toObject === "function") {
        obj = obj.toObject({ minimize : false });
    }
    return obj;
};
/////////////////////////////////

// all route controllers expose a setup method
module.exports.setup = function(app, config) {
    var controller = new HieraController(config);
    controller.attach(app, "/hiera");
};
