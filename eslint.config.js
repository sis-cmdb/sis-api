"use strict";

// Flat ESLint config (replaces the former grunt-contrib-jshint setup).
// This is an older CommonJS codebase, so the config is intentionally lenient -
// it flags genuine errors (undeclared globals, etc.) rather than style.

var nodeGlobals = {
    process: "readonly",
    console: "readonly",
    Buffer: "readonly",
    __dirname: "readonly",
    __filename: "readonly",
    module: "writable",
    require: "readonly",
    exports: "writable",
    global: "readonly",
    setTimeout: "readonly",
    clearTimeout: "readonly",
    setInterval: "readonly",
    clearInterval: "readonly",
    setImmediate: "readonly",
    fetch: "readonly"
};

var mochaGlobals = {
    describe: "readonly",
    it: "readonly",
    before: "readonly",
    after: "readonly",
    beforeEach: "readonly",
    afterEach: "readonly"
};

module.exports = [
    {
        ignores: ["node_modules/**", "dist/**", "test/fixtures/scripts/**"]
    },
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: nodeGlobals
        },
        rules: {
            "no-undef": "error",
            "no-dupe-keys": "error",
            "no-unreachable": "error"
        }
    },
    {
        files: ["test/**/*.js"],
        languageOptions: {
            globals: Object.assign({}, nodeGlobals, mochaGlobals)
        }
    }
];
