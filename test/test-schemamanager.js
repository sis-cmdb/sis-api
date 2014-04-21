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

describe('SchemaManager', function() {
  "use strict";
  var SIS = require("../util/constants");
  var config = require('./fixtures/config');
  var should = require('should');
  var TestUtil = require('./fixtures/util');
  var LocalTest = new TestUtil.LocalTest();

  var schemaManager = null;

  before(function(done) {
    LocalTest.start(config, function(err, mongoose) {
        schemaManager = require("../util/schema-manager")(mongoose, { auth : false});
        done(err);
    });
  });

  after(function(done) {
    LocalTest.stop(done);
  });

  describe('add-invalid-schema', function() {
    it("should error adding an empty string ", function(done) {
      var name = "name";
      var schema = "";
      schemaManager.add({"name" : name, "definition" : schema}, function(err, entity) {
        should.exist(err);
        done();
      });
    });

    it("should error adding an empty object ", function(done) {
      var name = "name";
      var schema = { };
      schemaManager.add({"name" : name, "definition" : schema}, function(err, entity) {
        should.exist(err);
        done();
      });
    });


    it("should error adding a schema with an unkown type ", function(done) {
      var name = "name";
      var schema = { "field1" : "Bogus", "field2" : "String" };
      schemaManager.add({"name" : name, "definition" : schema}, function(err, entity) {
        should.exist(err);
        done();
      });
    });


    it("should error adding a schema with no name ", function(done) {
      var name = "";
      var schema = { "field1" : "String", "field2" : "String" };
      schemaManager.add({"name" : name, "definition" : schema}, function(err, entity) {
        should.exist(err);
        done();
      });
    });
  });

  describe('add-schema', function() {
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
      schemaManager.add(schema, function(err, entity) {
        should.not.exist(err);

        entity.should.have.property('name', 'network_element');
        entity.should.have.property('definition');
        entity.definition.should.eql(schema.definition);
        done();
      });
    });

    ['sis_hiera', 'sis_schemas', 'sis_hooks'].map(function(name) {
        it("should fail to add a schema with name" + name, function(done) {
            var schema = {
              "name" : name,
              "owner" : "test",
              "definition" : {
                ne_type: "String",
              }
            };
            schemaManager.add(schema, function(err, entity) {
                should.exist(err);
                should.not.exist(entity);
                done();
            });
        });
    });
    it("Should fail to add an empty schema", function(done) {
        var schema = {
          "name" : "name",
          "owner" : "test",
          "definition" : { }
        };
        schemaManager.add(schema, function(err, entity) {
            should.exist(err);
            should.not.exist(entity);
            done();
        });
    });

    ['_id', '__v'].map(function(field) {
        it("Should fail to add a schema w/ field " + field, function(done) {
            var schema = {
                "name" : "schema1",
                "owner" : "test",
                "definition" : {
                    "name" : "String"
                }
            };
            schema.definition[field] = 'String';
            schemaManager.add(schema, function(err, entity) {
                should.exist(err);
                should.not.exist(entity);
                done();
            });
        });
    });
    it("Should fail to add a schema with a bad definition", function(done) {
        var schema = {
            "name" : "schema1",
            "owner" : "test",
            "definition" : "Bogus"
        };
        schemaManager.add(schema, function(err, entity) {
            should.exist(err);
            should.not.exist(entity);
            done();
        });
    });
    it("Should fail to add a schema with an invalid schema def", function(done) {
        var schema = {
            "name" : "schema1",
            "owner" : "test",
            "definition" : {
                "name" : "UnknownType"
            }
        };
        schemaManager.add(schema, function(err, entity) {
            should.exist(err);
            should.not.exist(entity);
            done();
        });
    });
  });

  describe("getEntityModel failures", function() {
    it("Should fail to get an EntityModel for a schema with no name", function(done) {
        var model = schemaManager.getEntityModel({'definition' : {'name' : 'String'}});
        should.not.exist(model);
        done();
    });
    it("Should fail to get an EntityModel for an invalid schema def", function(done) {
        var model = schemaManager.getEntityModel({'name' : 'invalid', 'owner' : 'invalid', 'definition' : {'bogus' : 'Unknown'}});
        should.not.exist(model);
        done();
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
      schemaManager.add(fullSchema, function(err, entity) {
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
      schemaManager.delete("DNE", function(err, result) {
        should.exist(err);
        should.not.exist(result);
        done();
      });
    });

    it("Should return true if schema exists ", function(done) {
      schemaManager.delete(schemaName, function(err, result) {
        should.not.exist(err);
        /* jshint expr: true */
        result.should.be.ok;
        done(err);
      });
    });

    it("Should no longer exist ", function(done) {
      // ensure it is null
      schemaManager.getById(schemaName, function(err, result) {
        should.not.exist(result);
        done();
      });
    });

    it("Should have no documents ", function(done) {
      schemaManager.add(fullSchema, function(err, entity) {
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
        schemaManager.delete(schema.name, function() {
            schemaManager.add(schema, function(err, result) {
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
    });
    after(function(done) {
        schemaManager.delete(schema.name, done);
    });

    it("Should update the schema", function(done) {
      // delete the num field, change bool to string, add field
      delete schema.definition.num;
      schema.definition.bool = 'String';
      schema.definition.newBool = "Boolean";
      schemaManager.update(schema.name, schema, function(err, updated) {
        should.not.exist(err);
        updated = updated[1];
        should.exist(updated.definition);
        should.exist(updated.definition.newBool);
        should.not.exist(updated.definition.num);
        schemaManager.getById(schema.name, function(e,o) {
            updated.toObject().should.eql(o.toObject());
            done();
        });
      });
    });

    it("Should retrieve the existing entity", function(done) {
      schemaManager.getById(schema.name, function(err, entitySchema) {
        should.not.exist(err);
        var EntityType = schemaManager.getEntityModel(entitySchema);
        EntityType.findOne({"_id" : savedEntity._id}, function(err, result) {
          should.not.exist(err);
          should.exist(result);
          // ensure that the bool is removed
          should.not.exist(result.num);
          done();
        });
      });
    });

    it("Should not save the initial entity num field " + JSON.stringify(initialEntity), function(done) {
      schemaManager.getById(schema.name, function(err, entitySchema) {
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
      schemaManager.getById(schema.name, function(err, entitySchema) {
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
    });
  });

  describe("schema diff", function() {
    var s = {
        definition : {
            "str":   "String",
            "num":   "Number",
            "date":  "Date",
            "bool":  "Boolean",
            "arr": []
        }
    };

    beforeEach(function(done){
        s.definition = {
            "str":   "String",
            "num":   "Number",
            "date":  "Date",
            "bool":  "Boolean",
            "arr": []
        };
        done();
    });

    it("should match the schemas", function(done) {
        var s1 = schemaManager._getMongooseSchema(s);
        var s2 = schemaManager._getMongooseSchema(s);
        var diff = schemaManager._diffSchemas(s1, s2);
        for (var i = 0; i < diff.length; ++i) {
            diff[i].length.should.eql(0);
        }
        done();
    });

    it("should see str was removed", function(done) {
        var s1 = schemaManager._getMongooseSchema(s);
        delete s.definition.str;
        var s2 = schemaManager._getMongooseSchema(s);
        var diff = schemaManager._diffSchemas(s1, s2);
        diff[1].length.should.eql(1);
        diff[1][0].should.eql('str');
        done();
    });

    it("should see str was removed, q added, num updated", function(done) {
        var s1 = schemaManager._getMongooseSchema(s);
        delete s.definition.str;
        s.definition.q = "String";
        s.definition.num = "String";
        var s2 = schemaManager._getMongooseSchema(s);
        var diff = schemaManager._diffSchemas(s1, s2);
        diff[1].length.should.eql(1);
        diff[1][0].should.eql('str');
        diff[0].length.should.eql(1);
        diff[0][0].should.eql('q');
        diff[2].length.should.eql(1);
        diff[2][0].should.eql('num');
        done();
    });
  });

  describe("lock-schema", function() {
    var schema = {
      "name":"test_lock_entity",
      "owner" : "test",
      "locked_fields" : ["str", "num"],
      "definition": {
        "str":   "String",
        "num":   "Number",
        "date":  "Date",
        "bool":  "Boolean",
        "arr": []
      }
    };

    var schemaDoc = null;

    // create the schema and add an entity
    before(function(done) {
        schemaManager.add(schema, function(err, result) {
          if (err) return done(err);
          schemaDoc = result;
          schemaDoc.toObject()[SIS.FIELD_LOCKED].should.eql(false);
          done();
        });
    });
    after(function(done) {
        schemaManager.delete(schema.name, done);
    });

    it("Should lock the schema", function(done) {
        var obj = schemaDoc.toObject();
        obj[SIS.FIELD_LOCKED] = true;
        schemaManager.update("test_lock_entity", obj, function(e, r) {
            should.not.exist(e);
            schemaDoc = r[1];
            schemaDoc.toObject()[SIS.FIELD_LOCKED].should.eql(true);
            done();
        });
    });

    it("Should not delete the schema", function(done) {
        schemaManager.delete("test_lock_entity", function(e, r) {
            should.exist(e);
            should.not.exist(r);
            done();
        });
    });

    it("Should unlock the schema", function(done) {
        var obj = schemaDoc.toObject();
        obj[SIS.FIELD_LOCKED] = false;
        schemaManager.update("test_lock_entity", obj, function(e, r) {
            should.not.exist(e);
            schemaDoc = r[1];
            schemaDoc.toObject()[SIS.FIELD_LOCKED].should.eql(false);
            done();
        });
    });

    it("Should prevent updating the schema", function(done) {
        var obj = schemaDoc.toObject();
        delete obj.definition.str;
        schemaManager.update("test_lock_entity", obj, function(e, r) {
            should.exist(e);
            should.not.exist(r);
            done();
        });
    });

    it("Should delete the date field", function(done) {
        var obj = schemaDoc.toObject();
        delete obj.definition.date;
        schemaManager.update("test_lock_entity", obj, function(e, r) {
            should.exist(r);
            should.not.exist(e);
            done();
        });
    });
    it("Should delete the str field", function(done) {
        var obj = schemaDoc.toObject();
        delete obj.definition.str;
        obj[SIS.FIELD_LOCKED_FIELDS] = ["num"];
        schemaManager.update("test_lock_entity", obj, function(e, r) {
            should.exist(r);
            should.not.exist(e);
            done();
        });
    });
  });
});