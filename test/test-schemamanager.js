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

var config = require('./test-config');
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

  after(function(done) {
    mongoose.connection.db.dropDatabase();
    mongoose.connection.close();
    done();
  });

  describe('add-invalid-schema', function() {
    it("should error adding an empty string ", function(done) {
      var name = "name";
      var schema = "";
      schemaManager.addSchema({"name" : name, "definition" : schema}, function(err, entity) {
        should.exist(err);
        done();
      });
    });

    it("should error adding an empty object ", function(done) {
      var name = "name";
      var schema = { };
      schemaManager.addSchema({"name" : name, "definition" : schema}, function(err, entity) {
        should.exist(err);
        done();
      });
    });


    it("should error adding a schema with an unkown type ", function(done) {
      var name = "name";
      var schema = { "field1" : "Bogus", "field2" : "String" };
      schemaManager.addSchema({"name" : name, "definition" : schema}, function(err, entity) {
        should.exist(err);
        done();
      });
    });


    it("should error adding a schema with no name ", function(done) {
      var name = "";
      var schema = { "field1" : "String", "field2" : "String" };
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

        entity.should.have.property('name', 'network_element');
        entity.should.have.property('definition');
        entity['definition'].should.eql(schema);
        done();
      });
    });
  });

  describe('delete-schema', function() {
    var schemaName = "schema1"
    before(function(done) {
      // add a schema
      var schema = {
        f1 : "String",
        f2 : "String"
      };
      schemaManager.addSchema({"name" : schemaName, "definition" : schema}, function(err, entity) {
        if (err) {
          done(err);
          return;
        }
        // add some documents - get the model and save a document
        var EntityType = schemaManager.getEntityModel(entity);
        if (!EntityType) {
          done("Entity type is null");
          return;
        }
        var doc = new EntityType({f1 : "f1", f2 : "f2"});
        doc.save(function(err, e) {
          done() 
        });
      });
    });

    it("Should return false if schema dne ", function(done) {
      schemaManager.deleteSchema("DNE", function(err, result) {
        should.exist(err);
        result.should.not.be.ok;
        done();
      });
    });
    it("Should return true if schema exists ", function(done) {
        schemaManager.deleteSchema(schemaName, function(err, result) {
          should.not.exist(err);
          result.should.be.ok;
          // ensure it is null
          schemaManager.getByName(schemaName, function(err, result) {
            should.not.exist(result);
            done();
          });
        });
    });
  });
});