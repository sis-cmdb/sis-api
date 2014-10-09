
describe('Verify Seed Data', function() {
    "use strict";

    var replUtil = require('../fixtures/repl-util');
    var servers = replUtil.loadReplicationServers();

    it("should verify the seed data", function(done) {
        // only use first one
        var seedServer = servers[0];
        replUtil.verifySeedData(seedServer, done);
    });

});
