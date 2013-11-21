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

var genUser = function(name, defaults) {
    defaults['name'] = name;
    defaults['email'] = name + '@test.com';
    defaults['pw'] = name;
    return defaults;
}

var users = {
    // superman
    "superman" : genUser("superman", { super_user : true }),
    "superman2" : genUser("superman2", { super_user : true }),
    // admin for group1
    "admin1" : genUser("admin1", {
        roles : {
            "group1" : "admin"
        }
    }),
    "admin1_1" : genUser("admin1_1", {
        roles : {
            "group1" : "admin"
        }
    }),
    // admin for group2
    "admin2" : genUser("admin2", {
        roles : {
            "group2" : "admin"
        }
    }),
    // admin for one group, user for other
    "admin3" : genUser("admin3", {
       roles : {
            "group1" : "admin",
            "group2" : "user"
        }
    }),
    "admin4" : genUser("admin4", {
        roles : {
            "group1" : "admin",
            "group2" : "admin"
        }
    }),
    // user of group1
    "user1" : genUser("user1", {
        roles : {
            "group1" : "user"
        }
    }),
    "user2" : genUser("user2", {
        roles : {
            "group2" : "user"
        }
    }),
    "user3" : genUser("user3", {
        roles : {
            "group1" : "user",
            "group2" : "user"
        }
    })
};

module.exports.users = users;
