'use strict';

sisapp.controller("SidebarController", function($scope, $location, currentUserService,
                                                $rootScope) {
    $scope.loggedIn = currentUserService.isLoggedIn();
    $scope.$on("loggedIn", function() {
        var wtf = currentUserService.isLoggedIn();
        $scope.loggedIn = wtf;
        console.log(wtf);
    });
    $scope.logout = function() {
        currentUserService.logout().then(function() {
            $location.path("/");
        });
    }
});
