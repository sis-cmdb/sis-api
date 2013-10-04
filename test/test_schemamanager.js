var config = require('../config');
var mongoose = require('mongoose');
var schemaManager;

describe('SchemaManager', function() {
  before(function() {
    mongoose.connect(config.db.url);
    var db = mongoose.connection;
    db.once('open', function() {
      schemaManager = require('../util/schema-manager')(mongoose);
    });
  });

  describe('add-invalid-schema', function() {
    var name = "";
    var schema = "";
    schemaManager.addSchema({"name" : name, "definition" : schema}, function(err, entity) {
      should.exist(err);
    });
  });

  describe('add-valid-schema', function() {
    var name = "network_element";
    var schema = "{    \
      ne_type: String, \
      cid: String,     \
      ip: String,      \
      ip6: String,     \
      bgpip: String,   \
      bgpip6: String,  \
    }";
    schemaManager.addSchema({"name" : name, "definition" : schema}, function(err, entity) {
      should.not.exist(err);
      // figure out how to check the entity
    });
  });
});