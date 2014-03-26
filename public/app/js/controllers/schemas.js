'use strict';

sisapp.controller("SchemasController", function($scope, $location,
                                                SisUtil, SisClient) {
    var query = {
        sort : "name",
        fields : "name,owner,sis_locked"
    }

    $scope.remove = function(schema) {

    }

    SisClient.schemas.listAll({ sort : "name" }, function(err, schemas) {
        if (schemas) {
            schemas = schemas.map(function(s) {
                s.canManage = SisUtil.canManageSchema(s);
                return s;
            })
            $scope.$apply(function() {
                $scope.schemas = schemas;
            })
        }
    });
});