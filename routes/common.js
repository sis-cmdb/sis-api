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

(function() {
    module.exports.attachController = function(app, controller, prefix) {
        app.get(prefix, controller.getAll);
        app.get(prefix + "/:id", controller.get);
        if (!app.get("edgesite")) {
            app.put(prefix + "/:id", controller.update);
            app.post(prefix, controller.add);
            app.delete(prefix + "/:id", controller.delete);
        }
    }

    // wrapped in case we want to do more things here..
    module.exports.sendError = function(res, code, err) {
        res.jsonp(code, {"error" : err });
    }

    module.exports.sendObject = function(res, code, obj) {
        res.jsonp(code, obj);
    }

    module.exports.MAX_RESULTS = 200;

})();

