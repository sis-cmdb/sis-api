// TODO: Figure out how we can inject/override the default config with the
// test config.
var config = require('./test-config')
var server = require('../server')
var request = require('supertest')

var app = null;

describe('Schema API',function() {
  before(function(done) {
    server.startServer(config, function(express) {
        app = express;
        done();
    });
  });

  after(function() {
    server.stopServer();
  });

  it("should get /schemas and return 200", function(done) {
    request(app)
      .get('/api/v1/schemas')
      .expect(200, done);
  });
});