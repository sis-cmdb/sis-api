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
var hookManager;
var should = require('should');

describe('HookManager', function() {
  before(function(done) {
    mongoose.connect(config.db.url);
    var db = mongoose.connection;
    db.once('open', function() {
      hookManager = require('../util/hook-manager')(mongoose);
      done();
    });
  });

  after(function(done) {
    mongoose.connection.db.dropDatabase();
    mongoose.connection.close();
    done();
  });

  describe('add-invalid-hook', function() {
    it("should error adding an empty string ", function(done) {
      var hook = "";
      hookManager.addHook(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });

    it("should error adding an empty object ", function(done) {
      var hook = { };
      hookManager.addHook(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });


    it("should error adding a hook with no name ", function(done) {
      var hook = { 
        "name" : "", 
        "owner" : "Test",
        "entity_type" : "Schema",
        "target" : {
            "action" : "POST",
            "url" : "http://foo.bar.com/foo"
        },
        "events": ['insert','update']
      };
      hookManager.addHook(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });

    it("should error adding a hook with no owner ", function(done) {
      var hook = { 
        "name" : "TestHook", 
        "entity_type" : "Schema",
        "target" : {
            "action" : "POST",
            "url" : "http://foo.bar.com/foo"
        },
        "events": ['insert','update']
      };
      hookManager.addHook(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });

    it("should error adding a hook with no entity_type ", function(done) {
      var hook = { 
        "name" : "TestHook", 
        "owner" : "Test",
        "target" : {
            "action" : "POST",
            "url" : "http://foo.bar.com/foo"
        },
        "events": ['insert','update']
      };
      hookManager.addHook(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });

    it("should error adding a hook with no target ", function(done) {
      var hook = { 
        "name" : "TestHook", 
        "owner" : "Test",
        "entity_type" : "Schema",
        "events": ['insert','update']
      };
      hookManager.addHook(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });
    it("should error adding a hook with no target.url ", function(done) {
      var hook = { 
        "name" : "TestHook", 
        "owner" : "Test",
        "entity_type" : "Schema",
        "target" : {
            "action" : "POST"
        },
        "events": ['insert','update']
      };
      hookManager.addHook(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });
    it("should error adding a hook with no target.action ", function(done) {
      var hook = { 
        "name" : "TestHook", 
        "owner" : "Test",
        "entity_type" : "Schema",
        "target" : {
            "url" : "http://foo.bar.com/foo"
        },
        "events": ['insert','update']
      };
      hookManager.addHook(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });
    it("should error adding a hook with no events ", function(done) {
      var hook = { 
        "name" : "TestHook", 
        "owner" : "Test",
        "entity_type" : "Schema",
        "target" : {
            "action" : "POST",
            "url" : "http://foo.bar.com/foo"
        }
      };
      hookManager.addHook(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });
    it("should error adding a hook with no event values ", function(done) {
      var hook = { 
        "name" : "TestHook", 
        "owner" : "Test",
        "entity_type" : "Schema",
        "target" : {
            "action" : "POST",
            "url" : "http://foo.bar.com/foo"
        },
        "events": []
      };
      hookManager.addHook(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });

  });

  describe('add-valid-hook', function() {
    var hookName = "TestHook"; 
    after(function(done) {
        hookManager.deleteHook(hookName, done);
    });
    it("should add a valid hook object", function(done) {
      var hook = { 
        "name" : hookName,
        "owner" : "Test",
        "entity_type" : "Schema",
        "target" : {
            "action" : "POST",
            "url" : "http://foo.bar.com/foo"
        },
        "events": ['insert','update']
      };
      hookManager.addHook(hook, function(err, entity) {
        should.not.exist(err);

        entity.should.have.property('name', 'TestHook');
        entity.should.have.property('owner', 'Test');
        entity.should.have.property('entity_type', 'Schema');
        entity['target'].should.eql(hook.target);
        
        JSON.stringify(entity['events']).should.eql(JSON.stringify(hook.events));
        done();
      });
    });
  });

  describe('delete-hook', function() {
    var hookName = "DeleteTest";
    var hook = { 
      "name" : hookName, 
      "owner" : "Test",
      "entity_type" : "Schema",
      "target" : {
          "action" : "POST",
          "url" : "http://foo.bar.com/foo"
      },
      "events": ['insert','update']
    };

    before(function(done) {
      hookManager.addHook(hook, function(err, entity) {
        if (err) {
          done(err);
          return;
        }
        done();
      });
    });

    it("Should return false if hook dne ", function(done) {
      hookManager.deleteHook("DNE", function(err, result) {
        should.exist(err);
        result.should.not.be.ok;
        done();
      });
    });

    it("Should return true if hook exists ", function(done) {
      hookManager.deleteHook(hookName, function(err, result) {
        should.not.exist(err);
        result.should.be.ok;
        done(err);
      });
    });

    it("Should no longer exist ", function(done) {
      // ensure it is null
      hookManager.getByName(hookName, function(err, result) {
        should.not.exist(result);
        done(err);
      });
    });

  });

  describe("update-hook", function() {
    var hookName = "UpdateTest";
    var initialHook = { 
      "name" : hookName, 
      "owner" : "Test",
      "entity_type" : "Schema",
      "target" : {
          "action" : "POST",
          "url" : "http://foo.bar.com/foo"
      },
      "events": ['insert','update']
    };
    var updatedHook = { 
      "name" : hookName, 
      "owner" : "Bob",
      "entity_type" : "EntityA",
      "target" : {
          "action" : "GET",
          "url" : "http://frob.com/foo"
      },
      "events": ['update']
    };

    // create the hook
    before(function(done) {
        hookManager.addHook(initialHook, function(err, result) {
          if (err) return done(err);
          done();
        });
    });
    after(function(done) {
        hookManager.deleteHook(hookName, done);
    });

    it("Should update the hook", function(done) {
      // delete the num field, change bool to string, add field
      hookManager.updateHook(updatedHook, function(err, updated) {
        should.not.exist(err);
        updated.should.have.property('owner','Bob');
        updated.should.have.property('entity_type','EntityA');
        updated['target'].should.eql(updatedHook.target);
        JSON.stringify(updated['events']).should.eql(JSON.stringify(updatedHook.events));

        done();
      });
    });
  });
});
