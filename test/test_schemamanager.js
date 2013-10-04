var config = require('../config');
var mongoose = require('mongoose');
var schemaManager;
var should = require('should');

describe('SchemaManager', function() {
  before(function(done) {
    mongoose.connect(config.db.url);
    var db = mongoose.connection;
    db.once('open', function() {
      schemaManager = require('../util/schema-manager')(mongoose);
      done();
    });
  });

  describe('add-invalid-schema', function() {   
    it("should error adding an empty string ", function(done) {
      var name = "";
      var schema = "";
        schemaManager.addSchema({"name" : name, "definition" : schema}, function(err, entity) {
          should.exist(err);
          done();
        });
      });
  });

  describe('add-valid-schema', function() {
    it("should add a valid json schema object", function(done) {
      var name = "network_element";
      var schema = {
        ne_type: "String",
        cid: "String",
        ip: "String",
        ip6: "String",
        bgpip: "String",
        bgpip6: "String",
    }
    schemaManager.addSchema({"name" : name, "definition" : schema}, function(err, entity) {
      should.not.exist(err);
      done();
      // figure out how to check the entity
    });
    });
  });
});