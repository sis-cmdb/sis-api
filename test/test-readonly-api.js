describe('Readonly API ', function() {
    "use strict";
    var nconf = require("nconf");
    var schema = {
        "name":"test_entity",
        _sis : { "owner" : ["test"] },
        "definition": {
            "str":   "String",
            "num":   "Number",
            "date":  "Date",
            "bool":  "Boolean",
            "arr": []
        }
    };

    var SIS = require("../util/constants");
    var should = require('should');
    var TestUtil = require('./fixtures/util');
    var ApiServer = new TestUtil.TestServer();
    var app = null;

    it("Should setup fixtures", function(done) {
        nconf.add("readonly", {
                type: "literal",
                store: {
                    "app" : { "readonly" : true }
                }
            });
        ApiServer.start(function(err, sd) {
            if (err) { return done(err); }
            app = sd.app;
            var options = { user : sd.superUser, version : "v1.1" };
            sd.schemaManager.delete(schema.name, options).nodeify(function() {
                sd.schemaManager.add(schema, options).nodeify(done);
            });
        });
    });

    after(function(done) {
        nconf.remove("readonly");
        ApiServer.stop(done);
    });

    it("should have readonly set in the app", function() {
        should.exist(app.get("readonly"));
        app.get("readonly").should.eql(true);
    });

    var paths = [
        "/api/v1.1/schemas",
        "/api/v1.1/hiera",
        "/api/v1.1/entities/test_entity"
    ];

    paths.map(function(path) {
        it("should allow GET on " + path, function(done) {
            ApiServer.get(path)
                     .expect(200, done);
        });
    });

    paths.map(function(path) {
        it("should 404 when POSTing to " + path, function(done) {
            ApiServer.post(path)
                .send({"unprocessed" : "entity"})
                .expect(404, done);
        });
    });

});
