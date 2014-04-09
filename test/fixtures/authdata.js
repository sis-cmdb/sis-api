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
    "admin5" : genUser("admin5", {
        roles : {
            "group1" : "admin",
            "group2" : "admin",
            "group3" : "admin"
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
    }),
    "user4" : genUser("user4", {
        roles : {
            "group1" : "user",
            "group2" : "user",
            "group3" : "user"
        }
    })
};

var schemas = {
    "s1" : {
        "name" : "s1",
        "owners" : ["group1", "group2", "group3"],
        "definition" : {
            "str" : "String",
            "num" : "Number"
        }
    },

}

var addTests = [
    // array defining test
    // firstuser can add seconduser pass/fail
    // superman can add everyone
    ["superman", "admin1", true],
    ["superman", "admin1_1", true],
    ["superman", "superman2", true],
    ["superman", "admin2", true],
    ["superman", "admin3", true],
    ["superman", "admin4", true],
    ["superman", "admin5", true],
    ["superman", "user1", true],
    ["superman", "user2", true],
    ["superman", "user3", true],
    ["superman", "user4", true],
    // admin1 - similar as admin2
    ["admin1", "superman", false],
    ["admin1", "admin1_1", true],
    ["admin1", "admin2", false],
    ["admin1", "admin3", false],
    ["admin1", "admin4", false],
    ["admin1", "user1", true],
    ["admin1", "user2", false],
    ["admin1", "user3", false],
    // admin3
    ["admin3", "admin2", false],
    ["admin3", "admin4", false],
    ["admin3", "user1", true],
    ["admin3", "user2", false],
    ["admin3", "user3", false],
    // users
    ["user3", "superman", false],
    ["user3", "admin1", false],
    ["user3", "admin2", false],
    ["user3", "admin3", false],
    ["user3", "user1", false],
    ["user3", "user2", false]
];


var superTests = addTests.filter(function(test) {
    return test[0] == "superman";
});

var updateTests = [
    // test is:
    // [userDoingTheAction, userBeingManaged, action(add, delete, update), group modified, role, pass/fail]

    // adds and updates
    // admin1 can do whatever he wants on group1
    ["admin1", "admin2", 'a', 'group1', 'user', true],
    ["admin1", "admin3", 'd', 'group1', null, true],
    ["admin1", "user3", 'u', 'group1', 'admin', true],

    // superman does it all
    ["superman", "admin1", 'a', 'group2', 'user', true],
    ["superman", "admin1", 'a', 'group2', 'admin', true],
    ["superman", "user1", 'u', 'group1', 'user', true],

    // admin1 only administers group1
    ["admin1", "admin1_1", 'a', 'group2', 'user', false],
    // can't modify a super user
    ["admin1", "superman2", 'a', 'group1', 'user', false],

    // user3 isn't an admin of anything
    ["user3", "admin1", 'a', "group2", 'user', false]
];

module.exports.users = users;
module.exports.addTests = addTests;
module.exports.superTests = superTests;
module.exports.updateTests = updateTests;

// authorization tests
// schemas
var schemas = {
    "s1" : {
        name : "s1",
        owner : ["group1", "group2", "group3"],
        definition : {
            "str" : "String",
            "num" : "Number"
        }
    },

    "s2" : {
        name : "s2",
        owner : ["group1", "group2"],
        definition : {
            "str" : "String",
            "num" : "Number"
        }
    }
}

// entities
var entities = {
    "e1" : {
        schema : "s1",
        entity : {
            str : "e1",
            num : 1,
        }
    },
    "e2" : {
        schema : "s1",
        entity : {
            str : "e2",
            num : 2,
            owner : ["group1", "group2"]
        }
    }
}

module.exports.schemas = schemas;
module.exports.entities = entities;


// tests

// an obj where each key is
// a schema id and it maps
// to an object w/ a pass
// and fail array.  The arrays
// contain the users that it would fail/pass for
var addSchemaTests = {
    "s1" : {
        pass : ['superman', 'superman2', 'admin5']
    },
    "s2" : {
        pass : ['superman', 'superman2', 'admin5', 'admin4']
    }
}

// add the failures
for (var k in addSchemaTests) {
    var test = addSchemaTests[k];
    var passes = test['pass'];
    test['fail'] = Object.keys(users).filter(function(uname) {
        return passes.indexOf(uname) == -1;
    });
}

// add entity tests
var addEntityTests = {
    "e1" : {
        // group1 -> group3 users
        pass : ['superman', 'superman2', 'admin5', 'user4']
    },
    "e2" : {
        // group 1 and group2
        pass : ['superman', 'superman2', 'admin5',
                'user4', 'admin3', 'admin4', 'user3']
    }
};

// add the failures
for (var k in addEntityTests) {
    var test = addEntityTests[k];
    var passes = test['pass'];
    test['fail'] = Object.keys(users).filter(function(uname) {
        return passes.indexOf(uname) == -1;
    });
}

// entities that can't be added
var badEntities = {
    "e3" : {
        schema : "s2",
        entity : {
            str : "e3",
            num : 3,
            owner : ["group3", "group2"]
        }
    }
}

module.exports.addEntityTests = addEntityTests;
module.exports.addSchemaTests = addSchemaTests;
module.exports.badEntities = badEntities;

// update tests
// schema - test adding owner, removing owner
var updateSchemaTests = {
    's2' : [
        {
            owner : ['group1', 'group2', 'group3'],
            pass : ['superman', 'superman2', 'admin5']
        },
        {
            owner : ['group2'],
            pass : ['superman', 'superman2', 'admin5',
                    'admin3', 'admin4']
        },
        {
            owner : ['group4'],
            pass : ['superman', 'superman2']
        }
    ]
};

for (var k in updateSchemaTests) {
    var items = updateSchemaTests[k];
    for (var i = 0; i < items.length; ++i) {
        var test = items[i];
        var passes = test['pass'];
        test['fail'] = Object.keys(users).filter(function(uname) {
            return passes.indexOf(uname) == -1;
        });
    }
}

var updateEntityTests = {
    'e2' : [
        {
            owner : ['group4'],
            pass : [],
            err_code : 400
        },
        {
            owner : ['group3'],
            pass : ['superman', 'superman2', 'admin5', 'user4'],
            err_code : 401
        }
    ]
}

for (var k in updateEntityTests) {
    var items = updateEntityTests[k];
    for (var i = 0; i < items.length; ++i) {
        var test = items[i];
        var passes = test['pass'];
        test['fail'] = Object.keys(users).filter(function(uname) {
            return passes.indexOf(uname) == -1;
        });
    }
}

module.exports.updateSchemaTests = updateSchemaTests;
module.exports.updateEntityTests = updateEntityTests;
