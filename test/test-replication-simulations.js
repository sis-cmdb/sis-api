// simulate a schema update that occurs outside of the
// manager work flows
describe('Replication Simulation', function() {
  "use strict";

  var SIS = require("../util/constants");
  var config = require('./fixtures/config');
  var should = require('should');
  var TestUtil = require('./fixtures/util');
  var ApiServer = new TestUtil.TestServer();

  var schemaManager = null;

  it("Should setup fixtures", function(done) {
    ApiServer.start(config, function(err, serverData) {
        if (err) { return done(err); }
        schemaManager = serverData.schemaManager;
        ApiServer.becomeSuperUser(done);
    });
  });

  after(function(done) {
    ApiServer.stop(done);
  });

  describe('schema update replicated', function() {
    var schema = {
        name : "repl_sim_schema",
        _sis : { owner : ["sistest"] },
        definition : {
            name : "String",
            number : "Number"
        }
    };

    var entity = {
        name : "repl_entity",
        number : 100
    };

    before(function(done) {
        schemaManager.objectRemoved(schema).then(function() {
            ApiServer.post("/api/v1.1/schemas").send(schema)
                .expect(201, function(err, res) {
                if (err) { return done(err); }
                schema = res.body;
                ApiServer.post("/api/v1/entities/" + schema.name)
                    .send(entity).expect(201, function(err, res) {
                    if (err) { return done(err); }
                    // simulate a schema update
                    schema._sis._updated_at += 1000;
                    delete schema._id;
                    schema.definition.bool = { type : "Boolean", default : true };
                    schemaManager.model.update({ name : schema.name}, schema, done);
                });
            });
        });
    });
    it("should fetch an entity without number", function(done) {
        ApiServer.get("/api/v1/entities/" + schema.name)
            .expect(200, function(err, res) {
            should.not.exist(err);
            var entities = res.body;
            res.body.length.should.eql(1);
            var entity = res.body[0];
            should.exist(entity.bool);
            done();
        });
    });
    it("should return a 404", function(done) {
        // delete the model
        schemaManager.model.remove({ name : schema.name }, function(err, res) {
            if (err) { return done(err); }
            // now expect a 404
            ApiServer.get("/api/v1/entities/" + schema.name)
                .expect(404, done);
        });
    });
    after(function(done) {
        schemaManager.objectRemoved(schema).then(function() {
            done();
        }, function(e) {
            done(e);
        });
    });
  });
});
