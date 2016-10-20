module.exports = function(grunt) {

  require('load-grunt-tasks')(grunt);
  var BPromise = require('bluebird');
  var requestAsync = BPromise.promisify(require('request'));
  var distFiles = ['routes/*.js', 'tools/*.js', 'util/*.js', 'util/types/*.js', 'server.js', 'endpoints/*.js'];
  var confFiles = ['conf/config.json'];

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    env : {
      dist : {
        SIS_RUN_LONG_TESTS : 'true',
        JUNIT_REPORT_PATH : grunt.option('report_path') || '_reports/report.xml'
      },
      build : { }
    },
    copy: {
      dist: {
        files : [
          {
            expand: true,
            src: distFiles,
            dest: 'dist/'
          },
          {
            expand: true,
            src: ["package.json", "npm-shrinkwrap.json"],
            dest: "dist/"
          },
          {
              expand: true,
              src: confFiles,
              dest: "dist/"
          }
        ]
      }
    },
    jshint: {
        files: distFiles.concat(["test/**/*.js"]).concat(["!test/fixtures/scripts/*.js"]).concat(["!tools/*.mongo.js"]),
        options: {
            strict: "global",
            newcap: false,
            node : true,
            // slowly...
            esnext: true
        },
        dist: distFiles.map(function(f) { return "dist/" + f; })
    },
    // Empties folders to start fresh
    clean: {
      dist: {
        files: [{
          dot: true,
          src: [
            'dist/*',
            '_reports/*',
            grunt.option('coverage_out') || '_reports/coverage.html',
            grunt.option('report_path') || '_reports/report.xml'
          ]
        }]
      },
      server: '.tmp'
    },
    mochaTest: {
      test: {
        options: {
          reporter: 'mocha-jenkins-reporter',
          clearRequireCache: true,
          timeout: 60000,
          require: 'test/fixtures/coverage-blanket'
        },
        src: ['test/init-tests.js', 'test/test-tokenmanager.js', 'test/test-*.js',
              'test/v1.1-api/test-*']
      }
    }
  });

  grunt.registerTask('buildjson', function(target) {
    var outfile = 'build.json';
    var buildNum = process.env.BUILD_NUMBER || 'local-build';
    var githash = process.env.GIT_COMMIT_HASH || 'dev-hash';
    var buildId = process.env.BUILD_ID || grunt.template.date(Date.now(), 'yyyy-mm-dd_HH-MM-ss');

    var output = {
        build_num : buildNum,
        git_hash : githash,
        build_id : buildId,
        version : grunt.config.get('pkg.version')
    };
    output = JSON.stringify(output);
    grunt.file.write(outfile, output);
    if (target == 'dist') {
        // write to dist as well
        outfile = 'dist/' + outfile;
        grunt.file.write(outfile, output);
    }
  });

  grunt.registerTask('localtest', ['mochaTest:test']);

  grunt.registerTask('dist', [
    'env:dist',
    'clean:dist',
    'buildjson:dist',
    'localtest',
    'copy:dist',
    'jshint:dist'
  ]);

  grunt.registerTask('distnotest', [
    'env:dist',
    'clean:dist',
    'buildjson:dist',
    'copy:dist',
    'jshint:dist'
  ]);

  grunt.registerTask('build', [
    'env:build',
    'jshint',
    'buildjson',
    'localtest',
  ]);

  grunt.registerTask('default', ['newer:jshint','build']);

};
