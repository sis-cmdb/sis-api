// A class used to manage the history of an object
// inserting history into sis_history
// Does not subclass Manager

'use strict';

var jsondiff = require('jsondiffpatch');
var SIS = require('./constants');
var BPromise = require("bluebird");

var docToPojo = function(doc) {
    if (typeof doc.toObject === 'function') {
        doc = doc.toObject();
    }
    // return JSON.parse(JSON.stringify(doc));
    return doc;
};

var differ = jsondiff.create({
    objectHash: function(obj) {
        // serialize the objects within an array to JSON
        return JSON.stringify(obj);
    }
});

// Take in a schemaManager
function CommitManager(schemaManager) {

    var self = this;

    // default id field (schemas, hook, hiera)
    this.idField = 'name';
    self.model = schemaManager.getSisModel(SIS.SCHEMA_COMMITS);

    function createCommitObject(oldDoc, newDoc, user, type, ts) {
        var id = oldDoc ? oldDoc[self.idField] : newDoc[self.idField];
        var oid = oldDoc ? oldDoc._id : newDoc._id;
        var action = oldDoc ? (newDoc ? "update" : "delete") : "insert";
        var doc = { 'type' : type,
                    'entity_id' : id,
                    'action' : action,
                    'entity_oid' : oid };
        if (user && user[SIS.FIELD_NAME]) {
            doc[SIS.FIELD_MODIFIED_BY] = user[SIS.FIELD_NAME];
        }
        switch (action) {
            case 'insert':
                doc.commit_data = docToPojo(newDoc);
                doc.date_modified = newDoc[SIS.FIELD_SIS_META][SIS.FIELD_UPDATED_AT];
                break;
            case 'delete':
                doc.commit_data = docToPojo(oldDoc);
                doc.date_modified = ts;
                break;
            case 'update':
                // oldDoc is an object, newDoc is a doc
                var left = docToPojo(oldDoc);
                var right = docToPojo(newDoc);
                doc.commit_data = differ.diff(left, right);
                var mod_date = newDoc[SIS.FIELD_SIS_META][SIS.FIELD_UPDATED_AT];
                var hasChanged = doc.commit_data && Object.keys(doc.commit_data).some(function(k) {
                    return k[0] != '_';
                });
                if (!hasChanged) {
                    // just exit
                    return null;
                }
                doc.date_modified = mod_date;
                break;
            default:
                break;
        }
        var commitMeta = {};
        commitMeta[SIS.FIELD_UPDATED_AT] = ts;
        commitMeta[SIS.FIELD_CREATED_AT] = ts;
        doc[SIS.FIELD_SIS_META] = commitMeta;
        return doc;
    }

    this.recordHistoryBulk = function(items, user, action, type) {
        var ts = Date.now();
        var commits = [];

        if (action === "insert") {
            commits = items.map(function(item) {
                return createCommitObject(null, item, user, type, ts);
            });
        } else if (action === "delete") {
            commits = items.map(function(item) {
                return createCommitObject(item, null, user, type, ts);
            });
        } else {
            commits = items.map(function(item) {
                return createCommitObject(item[0], item[1], user, type, ts);
            }).filter(function(item) {
                return item !== null;
            });
        }
        commits = commits.map(function(c) {
            return new self.model(c).toObject();
        });
        if (!commits.length) {
            return BPromise.resolve(items);
        }

        // do a bulk insert directly
        var insert = BPromise.promisify(self.model.collection.insert, {context: self.model.collection });
        return insert(commits).then(function() {
            return items;
        });
    };

    this.recordHistory = function(oldDoc, newDoc, user, type, callback) {
        var ts = Date.now();
        var doc = createCommitObject(oldDoc, newDoc, user, type, ts);
        if (!doc) {
            callback(null, null);
            return;
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
        if (initial.action !== 'insert') {
            // in a situation where tracking was enabled
            // later
            return null;
        }
        var patched = commits.reduce(function(obj, commit) {
            // apply commit.commit_data to obj
            if (commit.commit_data) {
                jsondiff.patch(obj, commit.commit_data);
            }
            return obj;
        }, initial.commit_data);
        return patched;
    };

    this.getCommitsOnObject = function(id, type, timestamp) {
        var condition = {
            entity_id : id,
            type : type,
            date_modified : { $lte : timestamp },
            action : 'insert'
        };
        var fields = 'date_modified entity_oid';
        var sort = { date_modified : -1 };
        var commits = [];
        // result promise
        var d = BPromise.pending();
        // find the first commit
        var query = self.model.findOne(condition).select(fields).sort(sort);
        query.exec(function(err, first) {
            if (err || !first) {
                return d.resolve([]);
            }
            var start_date = first.date_modified;
            delete condition.action;
            condition.entity_oid = first.entity_oid;
            condition.date_modified = { $lte : timestamp, $gte : start_date };
            fields = 'commit_data action entity_oid';
            sort.date_modified = 1;
            self.model.find(condition).select(fields).sort(sort).exec(function(e, commits) {
                commits = commits || [];
                d.resolve(commits);
            });
        });

        return d.promise;
    };

    this.applyDiff = function(result, callback) {
        // get the low hanging fruit ones out
        if (result.action == 'insert' || result.action == 'delete') {
            return callback(null, result.commit_data);
        } else if (result.action != 'update') {
            return callback(SIS.ERR_INTERNAL("unknown commit type found " + result.action), null);
        }
        // get the commits on the object that precede this
        this.getCommitsOnObject(result.entity_id, result.type, result.date_modified)
            .then(function(commits) {
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
        this.getCommitsOnObject(id, type, utc).then(function(commits) {
            if (!commits.length) {
                callback(SIS.ERR_NOT_FOUND("commit", utc), null);
            } else {
                if (commits.length == 1) {
                    // only one commit - it's an insert.
                    return callback(null, commits[0].commit_data);
                } else if (commits[commits.length - 1].action == 'delete') {
                    return callback(null, commits[commits.length - 1].commit_data);
                }
                // merge
                var patched = aggregateCommits(commits);
                if (!patched) {
                    return callback(SIS.ERR_NOT_FOUND("Full commit history unavailable."), null);
                }
                return callback(null, patched);
            }
        });
    };
}

module.exports = function(schemaManager) {
    return new CommitManager(schemaManager);
};
