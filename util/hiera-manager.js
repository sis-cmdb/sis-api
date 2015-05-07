
// Manager for hiera

'use strict';

var Manager = require("./manager");
var SIS = require("./constants");

/////////////////////////////////
// Hiera Manager
// hiera overrides
function HieraManager(sm, opts) {
    opts = opts || {};
    opts[SIS.OPT_USE_AUTH] = sm.authEnabled;
    var model = sm.getSisModel(SIS.SCHEMA_HIERA);
    Manager.call(this, model, opts);
}

// inherit
require('util').inherits(HieraManager, Manager);

HieraManager.prototype.validate = function(entry, toUpdate, options) {
    if (!entry || !entry.name || typeof entry.name != 'string') {
        return "Hiera entry has an invalid or missing name";
    }
    var name = entry.name;
    var hieradata = entry.hieradata;
    if (typeof hieradata === "undefined" ||
        hieradata === null) {
        return "hieradata is missing";
    }
    return this.validateOwner(entry, options);
};

HieraManager.prototype.applyUpdate = function(doc, updateObj) {
    /* allow partial update */
    doc.hieradata = this.applyPartial(doc.hieradata, updateObj.hieradata);
    doc.markModified('hieradata');
    return doc;
};
/////////////////////////////////

module.exports = function(schemaManager, opts) {
    return new HieraManager(schemaManager, opts);
};
