'use strict';

sisapp.controller("SidebarController", function($scope, $location, currentUserService,
                                                $rootScope) {
    $scope.loggedIn = currentUserService.isLoggedIn();
    $scope.$on("loggedIn", function() {
        $scope.loggedIn = currentUserService.isLoggedIn();
    });
    $scope.logout = function() {
        currentUserService.logout().then(function() {
            $location.path("/");
        });
    }
    $scope.isActive = function(name) {
        var path = $location.path();
        switch(name) {
            case 'login':
                return path == "/"
            case 'schemas':
                return path.indexOf("/schemas") == 0 ||
                       path.indexOf("/entities") == 0;
            case 'hooks':
                return path.indexOf("/hooks") != -1;
            case 'hiera':
                return path.indexOf("/hiera") != -1;
            default:
                return false;
        }
    }
    $scope.$on("$locationChangeSuccess", function(evt) {

    });
});
