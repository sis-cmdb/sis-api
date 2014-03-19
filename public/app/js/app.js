'use strict';

var sisapp = angular.module('sisui', ['ngRoute'])
.config(function($routeProvider) {
    $routeProvider
        .when("/", {
            templateUrl : "public/app/partials/login.html",
            controller : 'LoginController'
        })
        .when("/schemas", {
            templateUrl : "public/app/partials/schemas.html",
            controller : "SchemasController"
        })
        .otherwise({
            redirectTo: '/'
        })
})
.run(function($rootScope, $location, currentUserService) {
    // register listener to watch location changes
    $rootScope.$on( "$locationChangeStart", function(event, newUrl, oldUrl) {
        var hashIdx = newUrl.indexOf('#');
        if (hashIdx == -1) {
            if (currentUserService.isLoggedIn()) {
                $location.path("/schemas");
            } else {
                $location.path("/");
            }
            return;
        }
        newUrl = newUrl.substring(hashIdx + 1);
        if ( !currentUserService.isLoggedIn() ) {
            // not logged in, make sure we go to login
            if (newUrl != '/') {
                $location.path("/");
            }
        } else {
            // logged in
            if (newUrl == '/') {
                // redirect to schemas
                $location.path("/schemas");
            }
        }
    })
});

// add factories here
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
                delete localStorage[USER_KEY];
            }
            return result;
        },
        getUserName : function() {
            var data = localStorage[USER_KEY];
            if (data) {
                return angular.fromJson(data).username;
            }
            return null;
        },
        logout : function() {
            var d = $q.defer();
            if (!this.isLoggedIn()) {
                d.resolve(true);
                return d.promise;
            }
            var username = this.getUserName();
            SisClient.tokens(username).delete(SisClient.authToken, function(e, r) {
                // ignore errors
                SisClient.auth_token = null;
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
                    var user = {
                        username : username,
                        expirationTime : Date.now() + token.expires
                    }
                    localStorage[USER_KEY] = angular.toJson(user);
                    d.resolve(username);
                    $rootScope.$broadcast("loggedIn", true);
                });
            });
            return d.promise;
        }
    }
});
