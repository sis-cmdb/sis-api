'use strict';

sisapp.controller("LoginController", function($scope, $location, currentUserService) {
    if (currentUserService.isLoggedIn()) {
        $location.path("/schemas");
        return;
    }
    $scope.login = function() {
        var username = $scope.username;
        var pw = $scope.password;
        currentUserService.login(username, pw).then(function() {
            $location.path("/schemas");
        });
    }
});