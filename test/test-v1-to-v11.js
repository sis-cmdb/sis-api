describe('Convert from v1 to v1.1', function() {
    "use strict";

    var SIS = require("../util/constants");
    var config = require('./fixtures/config');
    var should = require('should');
    var TestUtil = require('./fixtures/util');
    var LocalTest = new TestUtil.LocalTest();

    var schemaManager = null;

    before(function(done) {
        LocalTest.start(config, function(err, mongoose) {
            schemaManager = require("../util/schema-manager")(mongoose, { auth : false});
            done(err);
        });
    });

    after(function(done) {
        LocalTest.stop(done);
    });

    describe("Utility methods", function() {
        it("Should remove sis fields and put then in _sis", function() {
            var item = {
                sis_tags : ["foo"],
                sis_locked : true,
                sis_immutable : false,
                owner : ['sistest'],
                name : "Foobar",
                other : "Hello",
                __v : "werd",
                _id : "some_id"
            };

            var converted = SIS.UTIL_FROM_V1(item);
            console.log(converted);
            var keys = Object.keys(converted);
            keys.length.should.eql(5);
            var meta = converted[SIS.FIELD_SIS_META];
            should.exist(meta);
            meta.tags.should.eql(item.sis_tags);
            meta.locked.should.eql(item.sis_locked);
            meta.immutable.should.eql(item.sis_immutable);
            meta.owner.should.eql(item.owner);
            converted._v.should.eql(item.__v);
        });
    });
});
