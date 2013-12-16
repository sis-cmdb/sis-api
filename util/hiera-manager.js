/***********************************************************

 The information in this document is proprietary
 to VeriSign and the VeriSign Product Development.
 It may not be used, reproduced or disclosed without
 the written approval of the General Manager of
 VeriSign Product Development.

 PRIVILEGED AND CONFIDENTIAL
 VERISIGN PROPRIETARY INFORMATION
 REGISTRY SENSITIVE INFORMATION

 Copyright (c) 2013 VeriSign, Inc.  All rights reserved.

 ***********************************************************/

'use strict';

// Manager for hiera
(function() {

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
    HieraManager.prototype.__proto__ = Manager.prototype;

    HieraManager.prototype.validate = function(entry, isUpdate) {
        if (!entry || !entry.name || typeof entry.name != 'string') {
            return "Hiera entry has an invalid or missing name";
        }
        var name = entry.name;
        var hieradata = entry.hieradata;
        try {
            // validate it's an object
            if (Object.keys(entry.hieradata).length == 0) {
                return "hieradata cannot be empty";
            }
        } catch (ex) {
            return "hieradata is not a valid object";
        }
        return this.validateOwner(entry);
    }

    HieraManager.prototype.applyUpdate = function(doc, updateObj) {
        /* allow partial update */
        doc.hieradata = this.applyPartial(doc.hieradata, updateObj.hieradata);
        return doc;
    }
    /////////////////////////////////

    module.exports = function(schemaManager, opts) {
        return new HieraManager(schemaManager, opts);
    }

})();
