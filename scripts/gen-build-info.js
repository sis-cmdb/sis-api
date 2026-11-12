'use strict';

// Generates build.json at the repo root (consumed by the /info endpoint).
// Replaces the former grunt 'buildjson' task. Runs both when required (mocha
// loads it via .mocharc) and when invoked directly (node scripts/gen-build-info.js).

var fs = require('fs');
var path = require('path');
var pkg = require('../package.json');

var output = {
    build_num : process.env.BUILD_NUMBER || 'local-build',
    git_hash : process.env.GIT_COMMIT_HASH || 'dev-hash',
    build_id : process.env.BUILD_ID || new Date().toISOString(),
    version : pkg.version
};

fs.writeFileSync(path.resolve(__dirname, '../build.json'), JSON.stringify(output));

module.exports = output;
