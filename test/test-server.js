// TODO: Figure out how we can inject/override the default config with the
// test config.
var config = require('./test-config')
  ,    server = require('../server')
  ,   http = require('http');

describe('Schema API',function() {
  before(function(done) {
    server.startServer(config);
  });

  after(function() {
    server.stopServer();
  });

  it("should get /schemas and return 200", function(done) {
    request()
      .get('/schemas')
      .should.have.status(200);
    done();
  });
});