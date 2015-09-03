"use strict";
// used for code coverage
var path = require('path');
var mainFile = path.join(__dirname, '..', '..', 'server.js');

require('blanket')({
    // Only files that match the pattern will be instrumented
    pattern: ['/routes/', '/util/', '/tools/', '/endpoints/', mainFile]
});
