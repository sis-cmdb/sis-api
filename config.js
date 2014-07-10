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

// templatize this for the env
module.exports =
{
    db: {
        url : "mongodb://localhost/sis",
        opts : {
                "server": {
                    "auto_reconnect": true,"socketOptions": {"keepAlive": 1}, "poolSize": 5
                },
                db: {"native_parser": true, w: 1, j: true}
            }
    },
    server : {
        port : 3000
    },
    app : {
        auth : true,
        auth_config : {
            type : 'sis'
        }
    }
};
