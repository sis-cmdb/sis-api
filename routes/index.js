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

'use strict';
// Controller / routes for UI
(function() {

    var marked = require('marked');
    var hljs = require('highlight.js');
    var fs = require('fs');

    marked.setOptions({
        highlight: function(code, lang) {
            var result =  hljs.highlight(lang, code).value;
            return result;
        }
    });

    var UIController = function(config) {

        var self = this;

        var createMdRender = function(title, path, prefix) {
            var data = marked(fs.readFileSync(path, 'utf8'));
            prefix = prefix || './';
            return function(req, res) {
                res.render('index', {
                    'title' : title,
                    'readme' : data,
                    'prefix' : prefix
                });
            }
        }

        var idxRender = createMdRender('SIS', __dirname + '/../README.md');

        // Routes this exposes
        this.routes = {
            "/" : idxRender,
            "/index" : idxRender,
            "/docs/rbac.md" : createMdRender('Role Based Access Control', __dirname + '/../docs/rbac.md', '../'),
            "/docs/sharing.md" : createMdRender('Data Sharing and Organization', __dirname + '/../docs/sharing.md', '../')
        };
    };


    // all route controllers expose a setup method
    module.exports.setup = function(app, config) {
        var express = require('express');

        var controller = new UIController(config);
        app.set('view engine', 'jade');
        app.use('/public', express.static(__dirname + "/../public"));
        app.engine('jade', require('jade').__express);

        for (var k in controller.routes) {
            app.get(k, controller.routes[k]);
        }

    }


})();
