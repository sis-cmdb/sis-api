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
// A class used to manage the history of an object
// inserting history into sis_history
// Does not subclass Manager
(function() {

    var jsondiff = require('jsondiffpatch');
    var SIS = require('./constants');

    // Take in a schemaManager
    var CommitManager = function(schemaManager) {

        var self = this;

        // default id field (schemas, hook, hiera)
        this.idField = 'name';
        self.model = schemaManager.getSisModel(SIS.SCHEMA_COMMITS);

        this.recordHistory = function(oldDoc, newDoc, req, type, callback) {
            var id = oldDoc ? oldDoc[this.idField] : newDoc[this.idField];
            var action = oldDoc ? (newDoc ? "update" : "delete") : "insert";
            var doc = { 'type' : type,
                        'entity_id' : id,
                        'action' : action }
            if (req && req.user && req.user[SIS.FIELD_NAME]) {
                doc[SIS.FIELD_MODIFIED_BY] = req.user[SIS.FIELD_NAME];
            }
            switch (action) {
                case 'insert':
                    doc['diff'] = newDoc.toObject();
                    doc['old_value'] = null;
                    doc['date_modified'] = newDoc[SIS.FIELD_UPDATED_AT];
                    break;
                case 'delete':
                    doc['diff'] = null;
                    doc['old_value'] = oldDoc.toObject();
                    doc['date_modified'] = Date.now();
                    break;
                case 'update':
                    // oldDoc is an object, newDoc is a doc
                    doc['diff'] = jsondiff.diff(oldDoc, newDoc.toObject());
                    doc['old_value'] = oldDoc;
                    doc['date_modified'] = newDoc[SIS.FIELD_UPDATED_AT];
                    break;
            }
            // TODO: modified_by presumably using req?
            var entry = new self.model(doc);
            entry.save(function(err, res) {
                callback(SIS.ERR_INTERNAL(err), res);
            });
        }

        this.applyDiff = function(result, callback) {
            var obj = null;
            switch (result['action']) {
                case 'insert':
                    obj = result['diff'];
                    break;
                case 'delete':
                    obj = result['old_value'];
                    break;
                case 'update':
                    obj = jsondiff.patch(result['old_value'], result['diff']);
                    break;
                default:
                    break;
            }
            callback(obj ? null : SIS.ERR_INTERNAL("Error applying patch"), obj);
        }

        this.getVersionById = function(type, id, hid, callback) {
            self.model.findOne({'_id' : hid}, function(err, result) {
                if (err || !result) {
                    callback(err, null);
                } else {
                    if (type != result['type'] ||
                        id != result['entity_id']) {
                        callback(SIS.ERR_NOT_FOUND("commit", hid), null);
                    } else {
                        self.applyDiff(result, function(err, obj) {
                            if (err) {
                                return callback(err, null);
                            }
                            result = result.toObject();
                            result['value_at'] = obj;
                            callback(null, result);
                        });
                    }
                }
            });
        }

        this.getVersionByUtc = function(type, id, utc, callback) {
            var query = {
                'date_modified' : { $lte : utc },
                "entity_id" : id,
                "type" : type
            };
            var q = self.model.findOne(query).sort({date_modified: -1 });
            q.exec(function(err, result) {
                if (err || !result) {
                    callback(SIS.ERR_INTERNAL_OR_NOT_FOUND(err, "commit", utc), null);
                } else {
                    self.applyDiff(result, callback);
                }
            });
        }
    }

    module.exports = function(schemaManager) {
        return new CommitManager(schemaManager);
    }

})();