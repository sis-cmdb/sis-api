'use strict';

sisapp.controller("SchemasController", function($scope, $location,
                                                currentUserService, SisClient) {
    var query = {
        sort : "name",
        fields : "name,owner,sis_locked"
    }

    var canManage = function(schema) {
        var user = currentUserService.getCurrentUser();
        if (!user || schema.sis_locked) {
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

    $scope.remove = function(schema) {

    }

    SisClient.schemas.listAll({ sort : "name" }, function(err, schemas) {
        if (schemas) {
            schemas = schemas.map(function(s) {
                s.canManage = canManage(s);
                return s;
            })
            $scope.$apply(function() {
                $scope.schemas = schemas;
            })
        }
    });
});