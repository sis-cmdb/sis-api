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

// A class used to manage the history of an object
// inserting history into sis_history
// Does not subclass Manager
(function() {
    'use strict';

    var jsondiff = require('jsondiffpatch');
    var SIS = require('./constants');

    var docToPojo = function(doc) {
        return JSON.parse(JSON.stringify(doc.toObject()));
    };

    // Take in a schemaManager
    function CommitManager(schemaManager) {

        var self = this;

        // default id field (schemas, hook, hiera)
        this.idField = 'name';
        self.model = schemaManager.getSisModel(SIS.SCHEMA_COMMITS);

        this.recordHistory = function(oldDoc, newDoc, user, type, callback) {
            var id = oldDoc ? oldDoc[this.idField] : newDoc[this.idField];
            var action = oldDoc ? (newDoc ? "update" : "delete") : "insert";
            var doc = { 'type' : type,
                        'entity_id' : id,
                        'action' : action };
            if (user && user[SIS.FIELD_NAME]) {
                doc[SIS.FIELD_MODIFIED_BY] = user[SIS.FIELD_NAME];
            }
            switch (action) {
                case 'insert':
                    doc.commit_data = docToPojo(newDoc);
                    doc.date_modified = newDoc[SIS.FIELD_UPDATED_AT];
                    break;
                case 'delete':
                    doc.commit_data = docToPojo(oldDoc);
                    doc.date_modified = Date.now();
                    break;
                case 'update':
                    // oldDoc is an object, newDoc is a doc
                    doc.commit_data = jsondiff.diff(oldDoc, docToPojo(newDoc));
                    doc.date_modified = newDoc[SIS.FIELD_UPDATED_AT];
                    break;
                default:
                    break;
            }
            var entry = new self.model(doc);
            entry.save(function(err, res) {
                callback(SIS.ERR_INTERNAL(err), res);
            });
        };

        // aggregate commits where the first commit is the insert
        // followed by a series of updates (patches)
        var aggregateCommits = function(commits) {
            // first commit should be the insert
            // TODO: look into offloading to node-webworker-threads
            // if intense
            var initial = commits.shift();
            var patched = commits.reduce(function(obj, commit) {
                // apply commit.commit_data to obj
                if (commit.commit_data) {
                    jsondiff.patch(obj, commit.commit_data);
                }
                return obj;
            }, initial.commit_data);
            return patched;
        };

        this.applyDiff = function(result, callback) {
            // get the low hanging fruit ones out
            if (result.action == 'insert' || result.action == 'delete') {
                return callback(null, result.commit_data);
            } else if (result.action != 'update') {
                return callback(SIS.ERR_INTERNAL("unknown commit type found " + result.action), null);
            }
            // get the commits on the object that precede this
            var condition = {
                entity_id : result.entity_id,
                type : result.type,
                date_modified : { $lt : result.date_modified }
            };
            var fields = 'commit_data';
            var options = {
                sort : { date_modified : 1 }
            };
            // get only the commit data sorted in ascending
            // time
            var query = self.model.find(condition)
                                  .select('commit_data')
                                  .sort({date_modified: 1 });
            query.exec(function(err, commits) {
                if (err || !commits || !commits.length) {
                    return callback(SIS.ERR_INTERNAL("Could not retrieve previous commits."), null);
                }
                commits.push(result);
                var patched = aggregateCommits(commits);
                return callback(null, patched);
            });
        };

        this.getVersionById = function(type, id, hid, callback) {
            self.model.findOne({'_id' : hid}).exec(function(err, result) {
                if (err || !result) {
                    callback(err, null);
                } else {
                    if (type != result.type ||
                        id != result.entity_id) {
                        callback(SIS.ERR_NOT_FOUND("commit", hid), null);
                    } else {
                        self.applyDiff(result, function(err, obj) {
                            if (err) {
                                return callback(err, null);
                            }
                            result = result.toObject();
                            result.value_at = obj;
                            callback(null, result);
                        });
                    }
                }
            });
        };

        this.getVersionByUtc = function(type, id, utc, callback) {
            var query = {
                'date_modified' : { $lte : utc },
                "entity_id" : id,
                "type" : type
            };
            var q = self.model.find(query).sort({date_modified: 1 });
            q.exec(function(err, commits) {
                if (err || !commits || !commits.length) {
                    callback(SIS.ERR_INTERNAL_OR_NOT_FOUND(err, "commit", utc), null);
                } else {
                    if (commits.length == 1) {
                        // only one commit - it's an insert.
                        return callback(null, commits[0].commit_data);
                    } else if (commits[commits.length - 1].action == 'delete') {
                        return callback(null, commits[commits.length - 1].commit_data);
                    }
                    // merge
                    var patched = aggregateCommits(commits);
                    return callback(null, patched);
                }
            });
        };
    }

    module.exports = function(schemaManager) {
        return new CommitManager(schemaManager);
    };

})();