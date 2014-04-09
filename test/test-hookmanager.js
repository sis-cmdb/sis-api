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

describe('HookManager', function() {

  var SIS = require("../util/constants");
  var config = require('./fixtures/config');
  var should = require('should');
  var TestUtil = require('./fixtures/util');
  var LocalTest = new TestUtil.LocalTest();

  var hookManager = null;

  before(function(done) {
    LocalTest.start(config, function(err, mongoose) {
        var schemaManager = require("../util/schema-manager")(mongoose, { auth : false});
        hookManager = require('../util/hook-manager')(schemaManager);
        done(err);
    });
  });

  after(function(done) {
    LocalTest.stop(done);
  });

  describe('add-invalid-hook', function() {
    it("should error adding an empty string ", function(done) {
      var hook = "";
      hookManager.add(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });

    it("should error adding an empty object ", function(done) {
      var hook = { };
      hookManager.add(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });


    it("should error adding a hook with no name ", function(done) {
      var hook = {
        "name" : "",
        "owner" : [ "Test" ],
        "entity_type" : "Schema",
        "target" : {
            "action" : "POST",
            "url" : "http://foo.bar.com/foo"
        },
        "events": ['insert','update']
      };
      hookManager.add(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });

    it("should error adding a hook with no owner ", function(done) {
      var hook = {
        "name" : "test_hook",
        "entity_type" : "Schema",
        "target" : {
            "action" : "POST",
            "url" : "http://foo.bar.com/foo"
        },
        "events": ['insert','update']
      };
      hookManager.add(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });

    it("should error adding a hook with no entity_type ", function(done) {
      var hook = {
        "name" : "test_hook",
        "owner" : [ "Test" ],
        "target" : {
            "action" : "POST",
            "url" : "http://foo.bar.com/foo"
        },
        "events": ['insert','update']
      };
      hookManager.add(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });

    it("should error adding a hook with no target ", function(done) {
      var hook = {
        "name" : "test_hook",
        "owner" : "Test",
        "entity_type" : "Schema",
        "events": ['insert','update']
      };
      hookManager.add(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });
    it("should error adding a hook with no target.url ", function(done) {
      var hook = {
        "name" : "test_hook",
        "owner" : "Test",
        "entity_type" : "Schema",
        "target" : {
            "action" : "POST"
        },
        "events": ['insert','update']
      };
      hookManager.add(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });
    it("should error adding a hook with no target.action ", function(done) {
      var hook = {
        "name" : "test_hook",
        "owner" : "Test",
        "entity_type" : "Schema",
        "target" : {
            "url" : "http://foo.bar.com/foo"
        },
        "events": ['insert','update']
      };
      hookManager.add(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });
    it("should error adding a hook with no events ", function(done) {
      var hook = {
        "name" : "test_hook",
        "owner" : "Test",
        "entity_type" : "Schema",
        "target" : {
            "action" : "POST",
            "url" : "http://foo.bar.com/foo"
        }
      };
      hookManager.add(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });
    it("should error adding a hook with no event values ", function(done) {
      var hook = {
        "name" : "test_hook",
        "owner" : "Test",
        "entity_type" : "Schema",
        "target" : {
            "action" : "POST",
            "url" : "http://foo.bar.com/foo"
        },
        "events": []
      };
      hookManager.add(hook, function(err, entity) {
        should.exist(err);
        done();
      });
    });

  });

  describe('add-valid-hook', function() {
    var hookName = "test_hook";
    after(function(done) {
        hookManager.delete(hookName, done);
    });
    it("should add a valid hook object", function(done) {
      var hook = {
        "name" : hookName,
        "owner" : [ "Test" ],
        "entity_type" : "Schema",
        "target" : {
            "action" : "POST",
            "url" : "http://foo.bar.com/foo"
        },
        "events": ['insert','update']
      };
      hookManager.add(hook, function(err, entity) {
        should.not.exist(err);

        entity.should.have.property('name', 'test_hook');
        JSON.stringify(entity.owner).should.eql(JSON.stringify(["Test"]));
        entity.should.have.property('entity_type', 'Schema');
        entity['target'].should.eql(hook.target);

        JSON.stringify(entity['events']).should.eql(JSON.stringify(hook.events));
        done();
      });
    });
  });

  describe('delete-hook', function() {
    var hookName = "delete_test";
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
      hookManager.add(hook, function(err, entity) {
        if (err) {
          done(err);
          return;
        }
        done();
      });
    });

    it("Should return false if hook dne ", function(done) {
      hookManager.delete("dne", function(err, result) {
        should.exist(err);
        should.not.exist(result);
        done();
      });
    });

    it("Should return true if hook exists ", function(done) {
      hookManager.delete(hookName, function(err, result) {
        should.not.exist(err);
        result.should.be.ok;
        done(err);
      });
    });

    it("Should no longer exist ", function(done) {
      // ensure it is null
      hookManager.getById(hookName, function(err, result) {
        should.not.exist(result);
        done();
      });
    });

  });

  describe("update-hook", function() {
    var hookName = "update_test";
    var initialHook = {
      "name" : hookName,
      "owner" : [ "Test" ],
      "entity_type" : "Schema",
      "target" : {
          "action" : "POST",
          "url" : "http://foo.bar.com/foo"
      },
      "events": ['insert','update']
    };
    var updatedHook = {
      "name" : hookName,
      "owner" : [ "Bob" ],
      "entity_type" : "EntityA",
      "target" : {
          "action" : "GET",
          "url" : "http://frob.com/foo"
      },
      "events": ['update']
    };

    // create the hook
    before(function(done) {
        hookManager.add(initialHook, function(err, result) {
          if (err) return done(err);
          done();
        });
    });
    after(function(done) {
        hookManager.delete(hookName, done);
    });

    it("Should update the hook", function(done) {
      // delete the num field, change bool to string, add field
      hookManager.update(hookName, updatedHook, function(err, updated) {
        should.not.exist(err);
        should.exist(updated);
        updated = updated[1];
        JSON.stringify(updated.owner).should.eql(JSON.stringify(["Bob"]));
        updated.should.have.property('entity_type','EntityA');
        updated['target'].should.eql(updatedHook.target);
        JSON.stringify(updated['events']).should.eql(JSON.stringify(updatedHook.events));

        done();
      });
    });
  });
});
