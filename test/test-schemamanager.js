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

  var nconf = require('nconf');
  nconf.env('__').argv();
  nconf.defaults(config);


  before(function(done) {
    mongoose.connect(nconf.get('db').url);
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
        "name" : "network_element",
        "owner" : "test",
        "definition" : {
          ne_type: "String",
          cid: "String",
          ip: "String",
          ip6: "String",
          bgpip: "String",
          bgpip6: "String"
        }
      };
      schemaManager.addSchema(schema, function(err, entity) {
        should.not.exist(err);

        entity.should.have.property('name', 'network_element');
        entity.should.have.property('definition');
        entity['definition'].should.eql(schema['definition']);
        done();
      });
    });
  });

  describe('delete-schema', function() {
    var schemaName = "schema1";
    // add a schema
    var schemaDef = {
      f1 : "String",
      f2 : "String"
    };

    var fullSchema = {
      "name" : schemaName,
      "owner" : "test",
      "definition" : schemaDef
    };
    before(function(done) {
      schemaManager.addSchema(fullSchema, function(err, entity) {
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
          // assert there is an item
          EntityType.count({}, function(err, result) {
            result.should.eql(1);
            done(err); 
          });
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
        done(err);
      });
    });

    it("Should no longer exist ", function(done) {
      // ensure it is null
      schemaManager.getByName(schemaName, function(err, result) {
        should.not.exist(result);
        done(err);
      });
    });

    it("Should have no documents ", function(done) {
      schemaManager.addSchema(fullSchema, function(err, entity) {
        if (err) {
          done(err);
          return;
        }
        var EntityType = schemaManager.getEntityModel(entity);
        EntityType.count({}, function(err, result) {
          result.should.eql(0);
          done(err); 
        });
      });
    });
  });

  describe("update-schema", function() {
    var schema = {
      "name":"test_entity",
      "owner" : "test",
      "definition": {
        "str":   "String",
        "num":   "Number",
        "date":  "Date",
        "bool":  "Boolean",
        "arr": [],
      }
    };

    var initialEntity = {
      "str" : "foobar",
      "num" : 10,
      "date" : new Date(),
      "bool" : false,
      "arr" : "helloworld".split("")
    };

    var savedEntity = null;

    // create the schema and add an entity
    before(function(done) {
        schemaManager.addSchema(schema, function(err, result) {
          if (err) return done(err);
          var EntityType = schemaManager.getEntityModel(schema);
          var doc = new EntityType(initialEntity);
          doc.save(function(err, e) {
            if (err) { return done(err); }
            savedEntity = e;
            done();
          });
        });
    });
    after(function(done) {
        schemaManager.deleteSchema(schema.name, done);
    });

    it("Should update the schema", function(done) {
      // delete the num field, change bool to string, add field
      delete schema.definition['num'];
      schema.definition['bool'] = 'String';
      schema.definition['newBool'] = "Boolean";
      schemaManager.updateSchema(schema, function(err, updated) {
        should.not.exist(err);
        should.exist(updated.definition.newBool);
        should.not.exist(updated.definition.num);
        done();
      });
    });

    it("Should retrieve the existing entity", function(done) {
      schemaManager.getByName(schema.name, function(err, entitySchema) {
        should.not.exist(err);
        var EntityType = schemaManager.getEntityModel(entitySchema);
        EntityType.findOne({"_id" : savedEntity['_id']}, function(err, result) {
          should.not.exist(err);
          should.exist(result);
          // ensure that the bool is removed
          should.not.exist(result.num);
          done();
        });
      });
    });

    it("Should not save the initial entity num field " + JSON.stringify(initialEntity), function(done) {
      schemaManager.getByName(schema.name, function(err, entitySchema) {
        should.not.exist(err);
        var EntityType = schemaManager.getEntityModel(entitySchema);
        var doc = new EntityType(initialEntity);
        var docSchema = doc.schema;
        should.not.exist(doc.schema.num);
        doc.save(function(err, e) {
            should.not.exist(err);
            should.exist(e.str);
            should.not.exist(e.num);
            done();
        });
      });
    });

    it("Should save an updated entity", function(done) {
      schemaManager.getByName(schema.name, function(err, entitySchema) {
        should.not.exist(err);
        var EntityType = schemaManager.getEntityModel(entitySchema);
        var doc = new EntityType({
          "str" : "new",
          "newBool" : true,
          "date" : new Date(),
          "arr" : [0,1,2],
          "bool" : "became a string"
          });
          doc.save(done);
      });
    })
  });
});