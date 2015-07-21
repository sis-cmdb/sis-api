
// A class used to manage the SIS Scripts defined by the /scripts api

'use strict';
// node http lib
var http = require('http');
// simplified http req
var request = require('request');
var nconf = require('nconf');
var vm = require("vm");

var SIS = require('./constants');
var Manager = require("./manager");
var BPromise = require("bluebird");

/////////////////////////////////
// Script Manager
function ScriptManager(sm, opts) {
    var model = sm.getSisModel(SIS.SCHEMA_SCRIPTS);
    opts = opts || {};
    opts[SIS.OPT_USE_AUTH] = sm.authEnabled;
    Manager.call(this, model, opts);
}

require('util').inherits(ScriptManager, Manager);

ScriptManager.prototype.validate = function(modelObj, toUpdate, options) {
    if (!modelObj) {
        return "No model defined.";
    }
    if(!modelObj.name) {
        return "Script has no name.";
    }
    if(!modelObj.script_type) {
        return "Script has no script_type";
    }
    if(!modelObj.script) {
        return "Script has no content.";
    }
    // try to compile it
    try {
        new vm.Script(modelObj.script, { filename: "__test__.js" });
    } catch(ex) {
        return "Script does not compile " + ex;
    }
    return this.validateOwner(modelObj, options);
};
/////////////////////////////////

module.exports = function(schemaManager, opts) {
    return new ScriptManager(schemaManager);
};
