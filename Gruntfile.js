module.exports = function(grunt) {

  require('load-grunt-tasks')(grunt);

  var distFiles = ['routes/*.js', 'tools/*.js', 'util/*.js', 'util/types/*.js', 'server.js'];

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    env : {
      dist : {
        SIS_RUN_LONG_TESTS : 'true',
        JUNIT_REPORT_PATH : grunt.option('report_path') || '_reports/report.xml'
      }
    },
    copy: {
      dist: {
        files : [
          {
            src: distFiles,
            dest: 'dist/',
          },
          {
            src: ["package.json", "npm-shrinkwrap.json"],
            dest: "dist/"
          }
        ]
      }
    },
    jshint: {
      files: distFiles,
      options: {
        newcap: false,
        node : true
      },
      dist: distFiles.map(function(f) { return "dist/" + f })
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
        src: ['test/init-tests.js', 'test/test-tokenmanager.js', 'test/test-*.js']
      },
      coverage: {
        options: {
          reporter: 'html-cov',
          // use the quiet flag to suppress the mocha console output
          quiet: true,
          // specify a destination file to capture the mocha
          // output (the quiet option does not suppress this)
          captureFile: grunt.option('coverage_out') || '_reports/coverage.html'
        },
        src: ['test/init-tests.js', 'test/test-*.js']
      }
    }
  });

  grunt.registerTask('buildjson', function(target) {
    var outfile = 'build.json';
    if (target == 'dist') {
        outfile = 'dist/' + outfile;
    }
    var buildNum = process.env['BUILD_NUMBER'] || 'local-build';
    var githash = process.env['GIT_COMMIT_HASH'] || 'dev-hash';
    grunt.file.write(outfile, JSON.stringify({ build_num : buildNum, git_hash : githash }));
  });

  grunt.registerTask('dist', [
    'env:dist',
    'clean:dist',
    'mochaTest',
    'copy:dist',
    'jshint:dist',
    'buildjson:dist'
  ]);

  grunt.registerTask('build', [
    'jshint',
    'buildjson',
    'mochaTest',
  ]);

  grunt.registerTask('default', ['newer:jshint','build']);


};