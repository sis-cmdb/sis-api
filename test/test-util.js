/***********************************************************
 
 The information in this document is proprietary
 to VeriSign and the VeriSign Product Development.
 It may not be used, reproduced or disclosed without
 the written approval of the General Manager of
 VeriSign Product Development.
 
 PRIVILEGED AND CONFIDENTIAL
 VERISIGN PROPRIETARY INFORMATION
 REGISTRY SENSITIVE INFORMATION
 
 Copyright (c) 2013 VeriSign, Inc.  All rights reserved.
 
 ***********************************************************/

var http = require("http");

// api test helpers
(function() {

    var Request = function(config, path, method) {

        this.opts = {
            "hostname": "127.0.0.1",
            "port": config.server.port,
            "path": path,
            "method": method,
            "headers": {
              "Content-type": "application/json"
            }
        };

        this.sendRequest = function(callback) {
            var req = http.request(this.opts, function(res) {
                console.log("Hi");
                var body = "";
                res.on('data', function(d) {
                    body += d.toString('utf8');
                });
                res.on('end', function() {
                    callback(res, body);
                })
                res.on('error', function(err) {
                    callback(res, null);
                });
            });
            req.end();
        }
    }

    module.exports.createRequest = function(config, path, method) {
        return new Request(config, path, method);
    }

})();
