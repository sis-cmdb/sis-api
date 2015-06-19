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
      files: distFiles.concat(["test/**/*.js"]),
      options: {
        newcap: false,
        node : true
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
        src: ['test/init-tests.js', 'test/test-*.js', 'test/v1-api/*', 'test/v1.1-api/*']
      },
      remote : {
        options: {
          reporter: 'mocha-jenkins-reporter',
          timeout: 60000,
          grep: '@API',
          clearRequireCache: true
        },
        src: ['test/test-*.js', 'test/v1-api/*', 'test/v1.1-api/*']
      },
      repl : {
        options : {
            reporter: 'mocha-jenkins-reporter',
            timeout : 60000,
            clearRequireCache : true
        },
        src : ['test/replication-tests/init-seed-data.js',
               'test/replication-tests/test-repl-*.js',
               'test/replication-tests/verify-seed-data.js']
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

  var getWebInstancesFromInventory = function(inventory) {
    var ini = require('ini');
    var webInstances = [];
    function parseGroup(conf, group) {
        if (!conf || !conf[group]) {
            return;
        }
        for (var k in conf[group]) {
            var v = conf[group][k];
            var line = k + '=' + v;
            var splits = line.split(' ');
            var host = splits.shift();
            /* jshint loopfunc: true */
            splits = splits.map(function(s) {
                return s.split('=');
            });
            for (var i = 0; i < splits.length; ++i) {
                if (splits[i][0] == 'ansible_ssh_host') {
                    webInstances.push({ host : host, ip : splits[i][1], group : group });
                    break;
                }
            }
        }
    }
    function parseFile(file) {
        var conf = ini.parse(grunt.file.read(file));
        parseGroup(conf, 'sis-web');
        parseGroup(conf, 'sis-proxy');
    }
    if (grunt.file.isDir(inventory)) {
        grunt.file.recurse(inventory, parseFile);
    } else {
        parseFile(inventory);
    }
    return webInstances;
  };

  grunt.registerTask('verifySameApi', 'Verify API info', function() {
      var inventory = grunt.option("ansible-inventory");
      if (!inventory || !grunt.file.exists(inventory)) {
          return grunt.fail.fatal("inventory does not exist - set ansible-inventory");
      }
      var webInstances = getWebInstancesFromInventory(inventory);
      // verify the info for all of them are the same (at least API version)
      // and then test only one
      if (!webInstances.length) {
          return grunt.fail.fatal("no web instances found"); 
      }
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      var done = this.async();
      var infoPromises = webInstances.map(function(host) {
          var url = 'http://' + host.ip + '/api/v1.1/info';
          var opts = {
              uri : url,
              json : true
          };
          return requestAsync(opts).spread(function(res, body) {
              return body.version;
          });
      });
      BPromise.all(infoPromises).then(function(versions) {
          // ensure all are the same
          var version = versions[0];
          if (!version) {
              grunt.fail.fatal("No version found.");
          }
          var same = versions.every(function(v) {
              return v === version;
          });
          if (!same) {
              grunt.fail.fatal("Versions mismatch " + JSON.stringify(versions));
          }
          done();
      }).catch(function(err) {
          grunt.fail.fatal(err);
      });
  });

  grunt.registerTask('apitest', 'Run remote api tests', function() {
      var inventory = grunt.option("ansible-inventory");
      if (!inventory || !grunt.file.exists(inventory)) {
          return grunt.fail.fatal("inventory does not exist - set ansible-inventory");
      }
      var webInstances = getWebInstancesFromInventory(inventory);
      // verify the info for all of them are the same (at least API version)
      // and then test only one
      if (!webInstances.length) {
          return grunt.fail.fatal("no web instances found"); 
      }
      // run the test against ONE host
      var host = webInstances[0];
      var host_fixed = host.host.replace(/\./g, '_');
      var envData = {
          SIS_REMOTE_USERNAME : 'sistest',
          SIS_REMOTE_PASSWORD : 'sistest',
          SIS_REMOTE_URL : 'http://' + host.ip,
          JUNIT_REPORT_PATH : 'report_apitest_' + host_fixed + '.xml',
          NODE_TLS_REJECT_UNAUTHORIZED : "0"
      };
      grunt.config.set('env.' + host_fixed, envData);
      console.log(envData);
      grunt.task.run('env:' + host_fixed);
      grunt.task.run('mochaTest:remote');
      grunt.task.run('verifySameApi');
  });

  grunt.registerTask('repltest', 'Run replication tests', function() {
    var inventory = grunt.option("ansible-inventory");
    if (!inventory || !grunt.file.exists(inventory)) {
        return grunt.fail.fatal("inventory does not exist - set ansible-inventory");
    }
    if (!inventory || !grunt.file.exists(inventory)) {
        return grunt.fail.fatal("inventory does not exist");
    }
    var webInstances = getWebInstancesFromInventory(inventory);
    var data = webInstances.map(function(wi) {
        return {
            url : 'http://' + wi.ip,
            host : wi.host
        };
    });
    grunt.config.set('env.repl', {
        SIS_REPL_DATA: JSON.stringify(data),
        SIS_REMOTE_USERNAME : 'sistest',
        SIS_REMOTE_PASSWORD : 'sistest',
        JUNIT_REPORT_PATH : 'report_repltests.xml',
        NODE_TLS_REJECT_UNAUTHORIZED : "0"
    });
    grunt.task.run('env:repl');
    grunt.task.run('mochaTest:repl');
  });

  grunt.registerTask('localtest', ['mochaTest:test', 'mochaTest:coverage']);

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
