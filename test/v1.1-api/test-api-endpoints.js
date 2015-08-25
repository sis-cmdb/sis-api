describe("@API @V1.1API - Scripts API", function() {
    "use strict";
    let fs = require("fs");
    let path = require("path");
    let should = require("should");
    let TestUtil = require("../fixtures/util");
    let clone = require("clone");

    let ApiServer = new TestUtil.TestServer();

    function loadScript(scriptName) {
        scriptName += ".js";
        let p = path.join(__dirname, "..", "fixtures", "scripts", scriptName);
        return fs.readFileSync(p, { encoding: "utf8" });
    }

    after(function(done) {
        ApiServer.stop(done);
    });

    function errHandler(done) {
        return function(err, res) {
            if (err) {
                console.log(err);
                console.log(res.body);
            }
            should.not.exist(err);
            err = res.body;
            err.should.be.instanceof(Object);
            err.should.not.be.instanceof(Array);
            should.exist(err.code);
            should.exist(err.error);
            done();
        };
    }

    it("Should setup fixtures", function(done) {
        ApiServer.start(function(e) {
            if (e) {
                done(e);
                return;
            }
            ApiServer.becomeSuperUser(done);
        });
    });

    let script_type = "application/javascript";

    describe("Error cases", function() {
        it("Should fail if script doesn't exist", function(done) {
            ApiServer.get("/api/v1.1/scripts/foo").expect(404, errHandler(done));
        });
        it("Should fail to hit an endpoint that doesn't exist", function(done) {
            ApiServer.get("/api/v1.1/endpoints/foo").expect(404, errHandler(done));
        });
        let validObject = {
            name: "valid",
            script_type,
            script: loadScript("timeout"),
            _sis : {
                owner : ["test"]
            }
        };
        Object.keys(validObject).forEach(function(k) {
            let o = clone(validObject);
            it("Should fail to add script without " + k, function(done) {
                delete o[k];
                ApiServer.post("/api/v1.1/scripts")
                    .send(o).expect(400, errHandler(done));
            });
        });
        // add a bad syntax one
        validObject.script = loadScript("bad_syntax");
        it("Should fail to add a script with bad syntax", function(done) {
            ApiServer.post("/api/v1.1/scripts")
                .send(validObject).expect(400, errHandler(done));

        });
    });

    function deleteScript(name, done) {
        let uri = "/api/v1.1/scripts/" + name;
        ApiServer.del(uri).end(done);
    }

    describe("Script params", function() {
        let name = "params";
        // nuke it if it exists
        before(function(done) {
            deleteScript(name, done);
        });
        it("should load the script", function(done) {
            let script = {
                name,
                script_type,
                script: loadScript("params"),
                _sis : {
                    owner : ["test"]
                }
            };
            ApiServer.post("/api/v1.1/scripts")
                .send(script).expect(201, done);
        });

        let allPaths = [
            ["", "/"],
            ["/", "/"],
            ["/p1", "/p1"],
            ["/p1/", "/p1/"],
            ["/p1/p2", "/p1/p2"],
            ["/p1/p2/", "/p1/p2/"],
        ];
        allPaths.forEach(function(p) {
            let path = p[0];
            let expected = p[1];
            let uri = "/api/v1.1/endpoints/params" + path;
            it(`Should respond to ${uri} with ${expected}`, function(done) {
                ApiServer.get(uri).expect(200, function(err, res) {
                    should.not.exist(err);
                    res = res.body;
                    should.exist(res.path);
                    res.path.should.eql(expected);
                    done();
                });
            });
        });
    });

    describe("Output formats", function() {
        let csv = require("csv");
        let yaml = require("js-yaml");
        let name = 'formats';
        before(function(done) {
            deleteScript(name, done);
        });
        it("Should load the script", function(done) {
            let script = {
                name,
                script_type,
                script: loadScript(name),
                _sis : {
                    owner : ["test"]
                }
            };
            ApiServer.post("/api/v1.1/scripts")
                .send(script).expect(201, function(err, res) {
                    if (err) { console.log(err); console.log(res.body); }
                    done(err);
                });
        });

        let expectedData  = [
            {"name":"hello", "value":"world" },
            {"name":"foo", "value":"bar" }
        ];
        let csvData = [
            ['hello','world'],
            ['foo','bar']
        ];

        let baseUri = "/api/v1.1/endpoints/formats";

        it("Should return csv", function(done) {
            let uri = `${baseUri}/csv`;
            ApiServer.get(uri).expect(200, function(err, res) {
                should.not.exist(err);
                let body = res.text;
                csv.parse(body, function(e, result) {
                    should.not.exist(e);
                    result.should.eql(csvData);
                    done();
                });
            });
        });

        it("Should return yaml", function(done) {
            let uri = `${baseUri}/yaml`;
            ApiServer.get(uri).expect(200, function(err, res) {
                should.not.exist(err);
                let body = res.text;
                let data = yaml.safeLoad(body);
                data.should.eql(expectedData);
                done();
            });
        });

        it("Should return json", function(done) {
            let uri = `${baseUri}/json`;
            ApiServer.get(uri).expect(200, function(err, res) {
                should.not.exist(err);
                res.body.should.eql(expectedData);
                done();
            });
        });
    });
});
