'use strict';

var sisapp = angular.module('sisui', ['ngRoute', 'ui.bootstrap'])
.config(function($routeProvider) {
    $routeProvider
        .when("/login", {
            templateUrl : "public/app/partials/login.html",
            controller : 'LoginController'
        })
        .when("/schemas", {
            templateUrl : "public/app/partials/schemas.html",
            controller : "SchemasController"
        })
        .when("/entities/:schema", {
            templateUrl : "public/app/partials/entities.html",
            controller : "EntitiesController"
        })
        .when("/entities/:schema/:eid", {
            templateUrl : "public/app/partials/entities.html",
            controller : "EntitiesController"
        })
        .otherwise({
            redirectTo: '/schemas'
        })
});

// add factories here
sisapp.factory('SisUtil', function(currentUserService) {
// add some utilities to the client
    function getArrayDescriptor(arr, name) {
        var res = {
            type : "Array"
        };
        if (arr.length) {
            res['children'] = [normalizeDescriptor(arr[0])];
        } else {
            res['children'] = [{ "type" : "Mixed" }]
        }
        if (name) {
            res['name'] = name;
        }
        res['children'].map(function(c) {
            c['_parent_'] = res;
        });
        return res;
    }

    function normalizeDescriptor(desc, name) {
        if (desc instanceof Array) {
            return getArrayDescriptor(desc, name);
        } else if (typeof desc === "string") {
            return { type : desc, name : name };
        } else if ('type' in desc) {
            if (typeof desc.type === "string") {
                var result = {
                    name : name
                };
                for (var k in desc) {
                    result[k] = desc[k];
                }
                if (desc.type == "ObjectId" && desc['ref']) {
                    result.type = desc['ref'];
                    result['url'] = "#/entities/" + result.type;
                }
                return result;
            } else {
                // check if it's an array
                if (desc['type'] instanceof Array) {
                    var arrDesc = getArrayDescriptor(desc['type'], name);
                    for (var k in desc) {
                        if (k != 'type') {
                            arrDesc[k] = desc[k];
                        }
                    }
                    return arrDesc;
                } else {
                    // type is an embedded schema or
                    var inner = {
                        name : name,
                        type : "Document",
                        children : getDescriptors(desc)
                    }
                    inner['children'].map(function(c) {
                        c['_parent_'] = inner;
                    });
                    return inner;
                }
            }
        } else {
            // embedded scema
            var inner = {
                name : name,
                type : "Document",
                children : getDescriptors(desc)
            }
            inner['children'].map(function(c) {
                c['_parent_'] = inner;
            });
            return inner;
        }
    }

    function _getPathForDesc(desc) {
        var paths = [];
        while (desc) {
            if (desc['name']) {
                paths.push(desc['name'])
            } else {
                paths.push('_0');
            }
            desc = desc['_parent_'];
        }
        paths.reverse();
        return paths;
    }


    function getDescriptors(defn) {
        var result = [];
        for (var k in defn) {
            var desc = defn[k];
            var normalized = normalizeDescriptor(desc, k);
            result.push(normalized);
        }
        return result;
    }

    var _canAddEntityForSchema = function(schema) {
        var user = currentUserService.getCurrentUser();
        if (!user) {
            return false;
        }
        if (user.super_user) { return true; }
        var roles = user.roles || { };
        var owner = schema.owner;
        for (var i = 0; i < owner.length; ++i) {
            if (owner[i] in roles) {
                return true;
            }
        }
        return false;
    }

    var _getOwnerSubset = function(schema) {
        var user = currentUserService.getCurrentUser();
        if (!user) {
            return
        }
        if (user.super_user) {
            return schema.owner;
        }
        var roles = user.roles || { };
        var subset = schema.owner.filter(function(o) {
            return o in roles;
        });
        return subset;
    }

    var _canDelete = function(obj) {
        return obj && !obj.sis_locked;
    }

    var _canManageEntity = function(entity, schema) {
        var user = currentUserService.getCurrentUser();
        if (!user) {
            return false;
        }
        if (user.super_user) { return true; }
        var roles = user.roles || { };
        var owner = entity.owner || schema.owner;
        for (var i = 0; i < owner.length; ++i) {
            var group = owner[i];
            if (!roles[group]) {
                return false;
            }
        }
        return true;
    }

    var _canManageSchema = function(schema) {
        var user = currentUserService.getCurrentUser();
        if (!user) {
            return false;
        }
        if (user.super_user) { return true; }
        var roles = user.roles || { };
        for (var i = 0; i < schema.owner.length; ++i) {
            var group = schema.owner[i];
            if (roles[group] != 'admin') {
                return false;
            }
        }
        return true;
    }

    var _getIdField = function(schema) {
        var defn = schema.definition;
        for (var k in defn) {
            if (typeof defn[k] === 'object') {
                var descriptor = defn[k];
                if (typeof(descriptor['type']) === "string" &&
                    descriptor['type'] == "String" &&
                    descriptor['required'] &&
                    descriptor['unique']) {
                    // found a required, unique string
                    return k;
                }
            }
        }
        var result = "_id";
        if ('name' in defn) {
            result = "name";
        } else if ("title" in defn) {
            result = "title";
        }
        return result;
    }

    var _getNewItemForDesc = function(desc) {
        if (desc.type == "Document") {
            return { };
        } else if (desc.type == "Array") {
            return [];
        } else {
            return "";
        }
    }

    return {
        getDescriptorArray : function(schema) {
            return getDescriptors(schema.definition);
        },
        getIdField : _getIdField,
        canManageEntity : _canManageEntity,
        canManageSchema : _canManageSchema,
        canAddEntity : _canAddEntityForSchema,
        getDescriptorPath : _getPathForDesc,
        getNewItemForDesc : _getNewItemForDesc,
        canDelete : _canDelete,
        getOwnerSubset : _getOwnerSubset
    }
})

// SIS Client factory
sisapp.factory('SisClient', function($location) {
    var absUrl = $location.absUrl();
    // strip off the #
    var idx = absUrl.indexOf('#');
    if (idx != -1)
        absUrl = absUrl.substring(0, absUrl.indexOf('#'));
    var client = SIS.client({'url' : absUrl })

    return client;
})

sisapp.factory("currentUserService", function(SisClient, $q, $rootScope) {
    var USER_KEY = "t";
    return {
        isLoggedIn : function() {
            if (!(USER_KEY in localStorage)) {
                return false;
            }
            var currentUser = angular.fromJson(localStorage[USER_KEY]);
            var result = currentUser &&
                         currentUser.expirationTime &&
                         currentUser.expirationTime > Date.now();
            if (!result) {
                // cleanup
                SisClient.authToken = null;
                delete localStorage[USER_KEY];
            } else {
                // ensure sis client token is set
                SisClient.authToken = currentUser.token;
            }
            return result;
        },
        getCurrentUser : function() {
            var data = localStorage[USER_KEY];
            if (data) {
                return angular.fromJson(data);
            }
            return null;
        },
        logout : function() {
            var d = $q.defer();
            if (!this.isLoggedIn()) {
                d.resolve(true);
                return d.promise;
            }
            var username = this.getCurrentUser().username;
            SisClient.tokens(username).delete(SisClient.authToken, function(e, r) {
                // ignore errors
                SisClient.authToken = null;
                delete localStorage[USER_KEY];
                d.resolve(true)
                $rootScope.$broadcast("loggedIn", false);
            });
            return d.promise;
        },
        login : function(username, password) {
            var d = $q.defer();
            this.logout().then(function() {
                SisClient.authenticate(username, password, function(e, token) {
                    if (e || !token) {
                        return d.reject("Authentication failed.");
                    }
                    // get the user details
                    SisClient.users.get(username, function(e, user) {
                        var data = {
                            username : username,
                            super_user : user.super_user,
                            roles : user.roles,
                            expirationTime : Date.now() + token.expires,
                            token : token.name
                        }
                        localStorage[USER_KEY] = angular.toJson(data);
                        d.resolve(data);
                        $rootScope.$broadcast("loggedIn", true);
                    });
                });
            });
            return d.promise;
        }
    }
});
