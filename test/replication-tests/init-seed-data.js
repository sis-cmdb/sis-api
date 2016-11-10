describe('Init Seed Data', function() {
    "use strict";

    var replUtil = require('../fixtures/repl-util');
    var servers = replUtil.loadReplicationServers();

    console.log("Servers are: ",JSON.stringify(servers));

    it("should seed the data", function(done) {
        // only use first one
        var seedServer = servers[0];
        seedServer.becomeSuperUser(function(e, r) {
            if (e) { return done(e); }
            replUtil.seedData(seedServer, done);
        });
    });

});
