describe('@API @V1.1API - Schema API', function() {
    "use strict";

    var should = require('should');
    var async = require('async');

    var SIS = require("../../util/constants");

    var TestUtil = require('../fixtures/util');

    var ApiServer = new TestUtil.TestServer();

    it("Should setup fixtures", function(done) {
        ApiServer.start(function(e) {
            if (e) {
                done(e);
                return;
            }
            ApiServer.becomeSuperUser(done);
        });
    });

    after(function(done) {
        ApiServer.stop(done);
    });

    function errHandler(done) {
        return function(err, res) {
            should.not.exist(err);
            err = res.body;
            err.should.be.instanceof(Object);
            err.should.not.be.instanceof(Array);
            should.exist(err.code);
            should.exist(err.error);
            done();
        };
    }

    describe("Schema failure cases", function() {
        it("Should fail if type does not exist ", function(done) {
            ApiServer.get("/api/v1.1/schemas/dne").expect(404, errHandler(done));
        });
        it("Should fail to delete type if it doesn't exist", function(done) {
            ApiServer.del("/api/v1.1/schemas/dne").expect(404, errHandler(done));
        });
        it("Should fail to add an invalid schema", function(done) {
            ApiServer.post("/api/v1.1/schemas")
                .set("Content-type", "application/json")
                .send({"name" : "no_owner_or_def"})
                .expect(400, errHandler(done));
        });
        it("Should fail to update a schema that DNE", function(done) {
            ApiServer.put("/api/v1.1/schemas/DNE")
                .set("Content-type", "application/json")
                .send({"name" : "DNE", _sis : { "owner" : "DNE" }, "definition" : {"k" : "String"}})
                .expect(404, errHandler(done));
        });
        it("Should fail to add a schema with a bad name", function(done) {
            var schema = {
                "name" : "@#(*^! !(@#*$!",
                _sis : { "owner" : "test" },
                "definition" : {
                    "name" : "String"
                }
            };
            ApiServer.post("/api/v1.1/schemas")
                .set("Content-type", "application/json")
                .send(schema)
                .expect(400, errHandler(done));
        });
        it("Should fail to add a schema with a non existent ID field", function(done) {
            var schema = {
                name : "test_bad_id_1",
                id_field : "bogus",
                _sis : { owner : ["sistest"] },
                definition : {
                    name : "String"
                }
            };
            ApiServer.post("/api/v1.1/schemas")
                .set("Content-type", "application/json")
                .send(schema)
                .expect(400, errHandler(done));
        });
        it("Should fail to add a schema with a non unique / required id field", function(done) {
            var schema = {
                name : "test_bad_id_2",
                id_field : "name",
                _sis : { owner : ["sistest"] },
                definition : {
                    name : "String"
                }
            };
            ApiServer.post("/api/v1.1/schemas")
                .set("Content-type", "application/json")
                .send(schema)
                .expect(400, errHandler(done));
        });
        it("Should fail to add a schema with invalid JSON", function(done) {
            ApiServer.post("/api/v1.1/schemas")
                .set("Content-type", "application/json")
                .send("{ Invalid JSON }")
                .expect(400, errHandler(done));
        });
    });
    describe("Allowed schemas in v1.1", function() {
        // no longer an issue in v1.1
        it("Should not fail to add a schema with a sis_ field", function(done) {
            var schema = {
                name : "test_schema_field_sis",
                _sis : { owner : ["sistest"] },
                definition : {
                    sis_name : "String"
                }
            };
            ApiServer.del("/api/v1.1/schemas/" + schema.name)
            .endAsync().then(function() {
                return ApiServer.post("/api/v1.1/schemas")
                    .send(schema)
                    .expectAsync(201).nodeify(done);
            });
        });
        var types = ["Number", "String", "ObjectId", { }, "Boolean"];
        types.forEach(function(type, idx) {
            it("Should add a schema with owner = " + JSON.stringify(type), function(done) {
                var schema = {
                    name : "test_schema_owner_field_" + idx,
                    _sis : { owner : ["sistest"] },
                    definition : {
                        owner : type
                    }
                };
                ApiServer.del("/api/v1.1/schemas/" + schema.name)
                .endAsync().then(function() {
                    ApiServer.post("/api/v1.1/schemas")
                        .set("Content-type", "application/json")
                        .send(schema)
                        .expectAsync(201).nodeify(done);
                });
            });
        });
        var badQueries = [
            "fooo",
            "null",
            "foo:bar",
            '["valid","array"]'
        ];

        badQueries.forEach(function(bq) {
            it("Should return a 400 with query " + bq, function(done) {
                ApiServer.get("/api/v1.1/schemas")
                    .query({ q: bq })
                    .expectAsync(400).nodeify(done);
            });
        });
    });

    describe("CRUD schema", function() {
        var jsData = {
            "name":"test_network_element",
            _sis : { owner : ["sistest"] },
            "definition": {
                "ne_type": "String",
                "cid":     "String",
                "ip":      "String",
                "ip6":     "String",
                "bgpip":   "String",
                "bgpip6":  "String",
                "owner" : ["String"]
            }
        };
        before(function(done) {
            ApiServer.del('/api/v1.1/schemas/test_network_element')
                .end(done);
        });

        it("Should create new schemas", function(done) {

            ApiServer.post("/api/v1.1/schemas")
                .set('Content-Type', 'application/json')
                .send(jsData)
                .expect(201, function(e, r) {
                    if (e) {
                        console.log(r.body);
                    }
                    done(e);
                });
        });
        it("Should get the schema", function(done) {
            ApiServer.get("/api/v1.1/schemas/test_network_element")
                .expect(200)
                .end(function(err, res) {
                    var data = res.body;
                    should.not.exist(err);
                    should.exist(data);
                    for (var k in jsData) {
                        if (k === '_sis') { continue; }
                        jsData[k].should.eql(data[k]);
                    }
                    done();
                });
        });
        it("Should update the schema", function(done) {
            // update jsdata
            jsData.definition.cid = "Number";
            ApiServer.put("/api/v1.1/schemas/test_network_element")
                .set("Content-type", "application/json")
                .send(jsData)
                .expect(200)
                .end(function(err, res) {
                    var data = res.body;
                    should.not.exist(err);
                    should.exist(data);
                    for (var k in jsData) {
                        if (k === '_sis') { continue; }
                        jsData[k].should.eql(data[k]);
                    }
                    done();
                });
        });
        it("Should fail to change the schema name", function(done) {
            jsData.name = "whatever";
            ApiServer.put("/api/v1.1/schemas/test_network_element")
                .set("Content-type", "application/json")
                .send(jsData)
                .expect(400, done);
        });
        it("Should fail to update the schema with an invalid body", function(done) {
            delete jsData.owner;
            jsData.name = 'network_element';
            ApiServer.put("/api/v1.1/schemas/test_network_element")
                .set("Content-type", "application/json")
                .send(jsData)
                .expect(400, done);
        });
        it("Should delete the schema", function(done) {
            ApiServer.del("/api/v1.1/schemas/test_network_element")
                .expect(200, done);
        });
    });

    describe("Schema search", function() {
        before(function(done) {
            // insert three schemas
            var schemas = [{ "name":"s1", "definition": { "field" : "String" }, _sis : { "owner" : "sistest_rops" } },
                           { "name":"s2", "definition": { "field" : "String" }, _sis : { "owner" : "sistest_rops" } },
                           { "name":"t1", "definition": { "field" : "String" }, _sis : { "owner" : "sistest_pops" } }];
            // async magic - https://github.com/caolan/async
            async.map(schemas, function(schema, callback) {
                ApiServer.post('/api/v1.1/schemas')
                    .send(schema).expect(201, callback);
            }, done);
        });
        after(function(done) {
            async.map(['s1', 's2', 't1'], function(schema, callback) {
                ApiServer.del('/api/v1.1/schemas/' + schema)
                    .expect(200, callback);
            }, done);
        });
        it("Should return 2 results", function(done) {
            ApiServer.get("/api/v1.1/schemas")
                .query({ offset : 1, limit : 2})
                .expect(200)
                .end(function(err, res) {
                    should.exist(res.body);
                    res.body.length.should.eql(2);
                    done();
                });
        });
        it("Should return s1 and s2 ", function(done) {
            ApiServer.get("/api/v1.1/schemas")
                .query({q : JSON.stringify({ "_sis.owner" : ["sistest_rops"] }) })
                .expect(200)
                .end(function(err, res) {
                    should.exist(res.body);
                    res.body.length.should.eql(2);
                    for (var i = 0; i < 2; ++i) {
                        res.body[i]._sis.owner.should.eql(['sistest_rops']);
                    }
                    done();
                });
        });
    });

    describe("Schema regex", function() {
        it("Should fail for bad regex", function(done) {
            var failures = [
                "/foo",
                "foo",
                "abc*",
                "//",
                "//g",
            ];
            failures = failures.map(function(f, idx) {
                return {
                    name : "regex_fail_" + idx,
                    _sis : { owner : ['sistest'] },
                    definition : {
                        name : { type : "String", match : f }
                    }
                };
            });
            async.map(failures, function(schema, callback) {
                ApiServer.post("/api/v1.1/schemas")
                    .send(schema).expect(400, callback);
            }, done);
        });

        it("Should add valid regex", function(done) {
            var success = [
                "/foo/",
                "/^[0-9]+$/i",
                "/\\//"
            ];
            success = success.map(function(s, idx) {
                return {
                    name : "regex_success_" + idx,
                    _sis : { owner : ["sistest"] },
                    definition : {
                        name : { type : "String", match : s }
                    }
                };
            });
            async.map(success, function(schema, callback) {
                ApiServer.post("/api/v1.1/schemas")
                    .send(schema).expect(201, function(err, res) {
                        should.not.exist(err);
                        ApiServer.del("/api/v1.1/schemas/" + schema.name)
                            .expect(200, callback);
                    });
            }, done);
        });

        it("Should add a digits only field", function(done) {
            var schema = {
                name : "regex_digits",
                _sis : { owner : ["sistest"] },
                definition : {
                    digits : { type : "String", match : "/^[0-9]+$/" }
                }
            };
            var entities = [
                ["alkdjfa", 400],
                ["400", 201],
                ["502laksdjfa", 400],
                ["lkaadflkj2094852", 400],
                // mongoose always passes these
                ["", 201],
                ["0", 201]
            ];
            ApiServer.post("/api/v1.1/schemas")
            .send(schema).expect(201, function(err, res) {
                async.map(entities, function(e, cb) {
                    var entity = { digits : e[0] };
                    var code = e[1];
                    ApiServer.post("/api/v1.1/entities/regex_digits")
                    .send(entity).expect(code, function(err, res) {
                        if (err) {
                            console.log(JSON.stringify(e));
                        }
                        cb(err, res);
                    });
                }, function(err, res) {
                    should.not.exist(err);
                    ApiServer.del("/api/v1.1/schemas/regex_digits")
                        .expect(200, done);
                });
            });
        });
    });

    // TODO - move to v1 and v1.1 meta APIs
    describe("lock-schema", function() {
      var schema = {
        "name":"test_lock_entity",
        _sis : { owner : ["test"] },
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
          ApiServer.del('/api/v1.1/schemas/' + schema.name)
              .end(function() {
              ApiServer.post('/api/v1.1/schemas').send(schema)
              .expect(201, function(err, result) {
                  if (err) return done(err);
                  schemaDoc = result.body;
                  schemaDoc._sis[SIS.FIELD_LOCKED].should.eql(false);
                  done();
              });
          });
      });
      after(function(done) {
          ApiServer.del('/api/v1.1/schemas/' + schema.name).expect(200, done);
      });

      it("Should lock the schema", function(done) {
          schemaDoc._sis[SIS.FIELD_LOCKED] = true;
          ApiServer.put("/api/v1.1/schemas/" + schema.name)
          .send(schemaDoc).expect(200, function(err, result) {
              should.not.exist(err);
              schemaDoc = result.body;
              schemaDoc._sis[SIS.FIELD_LOCKED].should.eql(true);
              done();
          });
      });

      it("Should not delete the schema", function(done) {
          ApiServer.del('/api/v1.1/schemas/' + schema.name)
          .expect(401, done);
      });

      it("Should unlock the schema", function(done) {
          schemaDoc._sis[SIS.FIELD_LOCKED] = false;
          ApiServer.put("/api/v1.1/schemas/" + schema.name)
          .send(schemaDoc).expect(200, function(err, result) {
              should.not.exist(err);
              schemaDoc = result.body;
              schemaDoc._sis[SIS.FIELD_LOCKED].should.eql(false);
              done();
          });
      });

      it("Should prevent updating the schema with locked_fields", function(done) {
          var obj = JSON.parse(JSON.stringify(schemaDoc));
          delete obj.definition.str;
          ApiServer.put("/api/v1.1/schemas/" + schema.name)
          .send(obj).expect(400, done);
      });

      it("Should delete the date field", function(done) {
          var obj = JSON.parse(JSON.stringify(schemaDoc));
          delete obj.definition.date;
          ApiServer.put("/api/v1.1/schemas/" + schema.name)
          .send(obj).expect(200, function(err, res) {
              should.not.exist(err);
              schemaDoc = res.body;
              should.not.exist(schemaDoc.definition.date);
              done();
          });
      });
      it("Should delete the str field", function(done) {
          var obj = JSON.parse(JSON.stringify(schemaDoc));
          delete obj.definition.str;
          obj[SIS.FIELD_LOCKED_FIELDS] = ["num"];
          ApiServer.put("/api/v1.1/schemas/" + schema.name)
          .send(obj).expect(200, function(err, res) {
              should.not.exist(err);
              schemaDoc = res.body;
              should.not.exist(schemaDoc.definition.str);
              done();
          });
      });
    });

    describe("immutable schemas", function() {
        var schema = {
          "name":"test_immutable_schema",
          _sis : { "owner" : ["test"] },
          "definition": {
            "str":   "String"
          }
        };

        var schemaDoc = null;

        // create the schema and add an entity
        before(function(done) {
            ApiServer.del('/api/v1.1/schemas/' + schema.name)
                .end(function() {
                ApiServer.post('/api/v1.1/schemas').send(schema)
                .expect(201, function(err, result) {
                    if (err) return done(err);
                    schemaDoc = result.body;
                    schemaDoc._sis[SIS.FIELD_LOCKED].should.eql(false);
                    done();
                });
            });
        });
        after(function(done) {
            ApiServer.del('/api/v1.1/schemas/' + schema.name).expect(200, done);
        });

        it("Should mark the schema immutable and add num", function(done) {
            var obj = JSON.parse(JSON.stringify(schemaDoc));
            obj._sis[SIS.FIELD_IMMUTABLE] = true;
            obj.definition.num = "Number";
            ApiServer.put("/api/v1.1/schemas/" + schema.name)
            .send(obj).expect(200, function(err, res) {
                should.not.exist(err);
                schemaDoc = res.body;
                schemaDoc._sis[SIS.FIELD_IMMUTABLE].should.eql(true);
                schemaDoc.definition.num.should.eql("Number");
                done();
            });
        });

        it("Should fail to update the schema", function(done) {
           var obj = JSON.parse(JSON.stringify(schemaDoc));
           obj.definition.other = "Number";
           ApiServer.put("/api/v1.1/schemas/" + schema.name)
           .send(obj).expect(401, done);
        });

        it("Should make the schema mutable", function(done) {
            var obj = JSON.parse(JSON.stringify(schemaDoc));
            obj._sis[SIS.FIELD_IMMUTABLE] = false;
            ApiServer.put("/api/v1.1/schemas/" + schema.name)
            .send(obj).expect(200, function(err, res) {
                should.not.exist(err);
                schemaDoc = res.body;
                schemaDoc._sis[SIS.FIELD_IMMUTABLE].should.eql(false);
                done();
            });
        });

        it("Should update the schema now", function(done) {
            var obj = JSON.parse(JSON.stringify(schemaDoc));
            obj.definition.other = "Number";
            ApiServer.put("/api/v1.1/schemas/" + schema.name)
            .send(obj).expect(200, function(err, res) {
                var obj = res.body;
                obj.definition.other.should.eql("Number");
                done();
            });
        });
    });

    describe("with counts API", function() {
        var schema = {
          "name":"test_counts_schema",
          _sis : { "owner" : ["test"] },
          "definition": {
            "num":   "Number"
          }
        };
        var NUM_ENTITIES = 50;

        var schemaDoc = null;

        function addEntities(done) {
            // add 100 entities
            var entities = [];
            for (var i = 0; i < NUM_ENTITIES; ++i) {
                entities.push({
                    num : i
                });
            }
            ApiServer.post('/api/v1.1/entities/' + schema.name)
            .send(entities).expect(200, function(err, res) {
                if (err) { return done(err); }
                should.exist(res.body.success);
                should.exist(res.body.errors);
                res.body.success.should.be.instanceof(Array);
                res.body.success.length.should.eql(NUM_ENTITIES);
                res.body.errors.should.be.instanceof(Array);
                res.body.errors.length.should.eql(0);
                done();
            });
        }

        // create the schema and add entities
        before(function(done) {
            ApiServer.del('/api/v1.1/schemas/' + schema.name)
                .end(function() {
                ApiServer.post('/api/v1.1/schemas').send(schema)
                .expect(201, function(err, result) {
                    if (err) return done(err);
                    schemaDoc = result.body;
                    addEntities(done);
                });
            });
        });
        after(function(done) {
            ApiServer.del('/api/v1.1/schemas/' + schema.name).expect(200, done);
        });
        // tests
        it("should not return total_counts by default", function(done) {
            ApiServer.get("/api/v1.1/schemas").expect(200, function(err, res) {
                should.not.exist(err);
                res.body.should.be.instanceof(Array);
                res.body.forEach(function(s) {
                    s.should.not.have.property('entity_count');
                });
                done();
            });
        });
        it("should not return total_counts by default (id)", function(done) {
            ApiServer.get("/api/v1.1/schemas/" + schema.name).expect(200, function(err, res) {
                should.not.exist(err);
                res.body.should.not.have.property('entity_count');
                done();
            });
        });
        it("should fetch entity_count on schema list", function(done) {
            ApiServer.get("/api/v1.1/schemas").query({ with_counts : true })
            .expect(200, function(err, res) {
                should.not.exist(err);
                res.body.should.be.instanceof(Array);
                res.body.forEach(function(s) {
                    s.should.have.property('entity_count');
                    s.entity_count.should.be.instanceof(Number);
                    if (s.name === schema.name) {
                        s.entity_count.should.eql(NUM_ENTITIES);
                    }
                });
                done();
            });
        });
        it("should fetch entity_count via ID", function(done) {
            ApiServer.get("/api/v1.1/schemas/" + schema.name).query({with_counts : true})
            .expect(200, function(err, res) {
                should.not.exist(err);
                res.body.should.have.property('entity_count');
                res.body.entity_count.should.eql(NUM_ENTITIES);
                done();
            });
        });
    });
});
