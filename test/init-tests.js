describe('Initialize Tests', function() {
    "use strict";

    var util = require('./fixtures/util');

    var test = null;

    it("Should create the test", function(done) {
        test = new util.LocalTest();
        test.start(done);
    });

    it("Should stop the test", function(done) {
        test.stop(done);
    });
});
