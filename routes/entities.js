// API for entities that adhere to schemas created via
// the schemas API
'use strict';

var ApiController = require("./apicontroller");
var SIS = require("../util/constants");
var Promise = require("bluebird");
var createEntityManager = require("../util/entity-manager");

//////////
// Entity controller
function EntityController(config) {
    var opts = { };
    opts[SIS.OPT_LOG_COMMTS] = true;
    opts[SIS.OPT_FIRE_HOOKS] = true;
    opts[SIS.OPT_ID_FIELD] = SIS.FIELD_ID;
    opts[SIS.OPT_USE_AUTH] = config[SIS.OPT_USE_AUTH];
    SIS.UTIL_MERGE_SHALLOW(opts, config);
    this.opts = opts;
    ApiController.call(this, this.opts);
}

// inherit
require('util').inherits(EntityController, ApiController);

// overrides
// Get the manager to handle this query
EntityController.prototype.getManager = function(req) {
    // Get the latest
    var name = this.getType(req);
    return this.sm.getById(name, { lean : true }).then(function(schema) {
        var model = this.sm.getEntityModel(schema);
        var manager = createEntityManager(model, schema, this.opts);
        req.sisManager = manager;
        req.useLean = model.schema._sis_defaultpaths.length === 0;
        return manager;
    }.bind(this));
};

EntityController.prototype.convertToResponseObject = function(req, obj) {
    if (!req.sisManager) {
        return obj;
    }
    var arrayPaths = req.sisManager.model.schema._sis_arraypaths;
    if (req.query.removeEmpty && arrayPaths.length) {
        if (!obj.toObject) {
            obj = new req.sisManager.model(obj);
        }
        arrayPaths.forEach(function(p) {
            var arr = obj.get(p);
            if (arr && arr.length === 0) {
                obj.set(p, undefined);
            }
        });
        obj = obj.toObject();
    } else if (req.useLean && arrayPaths.length) {
        // need to ensure the array is set to [] if it's null
        req.sisManager.model.schema._sis_arraypaths.forEach(function(path) {
            SIS.UTIL_SET_DEFAULT_ARRAY(obj, path);
        });
    }
    return obj;
};

EntityController.prototype.shouldSaveCommit = function(req) {
    return req.sisManager &&
           req.sisManager.schema[SIS.FIELD_TRACK_HISTORY] &&
           ApiController.prototype.shouldSaveCommit.call(this, req);
};

// The type is the schema being requested
EntityController.prototype.getType = function(req) {
    return req.params.schema;
};

// Apply the default to populate the objects returned from GET
EntityController.prototype.applyDefaults = function(req) {
    if (req.method == "GET") {
        // need to populate..
        if (!('populate' in req.query)) {
            req.query.populate = true;
        }
    }
};
/////////////////////////////////

// all route controllers expose a setup method
module.exports.setup = function(app, config) {
    var controller = new EntityController(config);
    controller.attach(app, "/entities/:schema");
};
