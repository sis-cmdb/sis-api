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
(function() {

    var jsondiff = require('jsondiffpatch');

    // Take in a schemaManager
    var HistoryManager = function(schemaManager) {

        var self = this;

        // default id field (schemas, hook, hiera)
        this.idField = 'name';

        var init = function() {
            self.model = self.model = schemaManager.getSisModel(schemaManager.SIS_HISTORY_SCHEMA_NAME);
        }

        this.recordHistory = function(oldDoc, newDoc, req, type, callback) {
            var id = oldDoc ? oldDoc[this.idField] : newDoc[this.idField];
            var action = oldDoc ? (newDoc ? "update" : "delete") : "insert";
            var doc = { 'type' : type,
                        'entity_id' : id,
                        'action' : action }
            switch (action) {
                case 'insert':
                    doc['diff'] = newDoc.toObject();
                    doc['old_value'] = null;
                    doc['date_modified'] = newDoc[schemaManager.ENTITY_UPDATED_AT_FIELD];
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
                    doc['date_modified'] = newDoc[schemaManager.ENTITY_UPDATED_AT_FIELD];
                    break;
            }
            // TODO: modified_by presumably using req?
            var entry = new self.model(doc);
            entry.save(function(err, res) {
                //console.log(JSON.stringify(res));
                callback(err, res);
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
            callback(obj ? null : "Invalid entry found", obj);
        }

        this.getVersionById = function(type, id, hid, callback) {
            self.model.findOne({'_id' : hid}, function(err, result) {
                if (err || !result) {
                    callback(err, null);
                } else {
                    if (type != result['type'] ||
                        id != result['entity_id']) {
                        callback("Entry does not exist.", null);
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
                    callback(err, null);
                } else {
                    self.applyDiff(result, callback);
                }
            });
        }

        init();
    }

    module.exports = function(schemaManager) {
        return new HistoryManager(schemaManager);
    }

})();