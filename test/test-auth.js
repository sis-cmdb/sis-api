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
var should = require('should');
var SIS = require("../util/constants");

describe('AuthManager', function() {

  var nconf = require('nconf');
  var schemaManager = null;
  nconf.env('__').argv();
  nconf.defaults(config);

  before(function(done) {
    mongoose.connect(nconf.get('db').url);
    var db = mongoose.connection;
    db.once('open', function() {
        schemaManager = require("../util/schema-manager")(mongoose);
        done();
    });
  });

  after(function(done) {
    mongoose.connection.db.dropDatabase();
    mongoose.connection.close();
    done();
  });

  var user = {
    "name" : "test_user",
    "email" : "test@foo.com",
    "pw" : "hi"
  };

  var service = {
    "name" : "test_service"
  }

  var token = null;
  var serviceToken = null;

  it("should add user", function(done) {
    var pw = user.pw;
    var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
    userManager.add(user, function(e, u) {
        should.not.exist(e);
        u.pw.should.eql(userManager.hashPw(pw))
        user = u.toObject();
        done();
    });
  });

  it("should get user token", function(done) {
    var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
    userManager.createToken(user, function(e, t) {
        should.not.exist(e);
        should.exist(t);
        token = t;
        should.exist(t.ref);
        should.exist(t.ref[SIS.SCHEMA_USERS]);
        t.ref[SIS.SCHEMA_USERS].toObject().should.eql(user);
        done();
    });
  });

  it("should fetch a user", function(done) {
    var userManager = schemaManager.auth[SIS.SCHEMA_USERS];
    userManager.getVerifiedUser('test_user', 'hi')
        .then(function(u) {
            should.exist(u);
            u.toObject().should.eql(user);
            done();
        });
  });

  it("should get the token info", function(done) {
    var tokenManager = schemaManager.auth[SIS.SCHEMA_TOKENS];
    tokenManager.getById(token['name'], function(e, t) {
        should.not.exist(e);
        t.toObject().should.eql(token.toObject());
        done();
    });
  });

  // it("should add a service", function(done) {
  //   service['creator'] = user['_id'];
  //   authManager.addService(service, function(e, s) {
  //       should.not.exist(e);
  //       should.exist(s);
  //       service = s.toObject();
  //       done();
  //   });
  // })

  // it("should get the service token", function(done) {
  //   authManager.getTokenInfo(service['token'], function(e, t) {
  //       should.not.exist(e);
  //       should.exist(t);
  //       serviceToken = t;
  //       should.exist(t.service);
  //       t.service.toObject().should.eql(service);
  //       done();
  //   });
  // })

});