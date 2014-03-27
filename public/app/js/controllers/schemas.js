'use strict';

sisapp.controller("SchemasController", function($scope, $location,
                                                SisUtil, SisClient) {
    var query = {
        sort : "name",
        fields : "name,owner,sis_locked"
    }

    $scope.remove = function(schema) {
        var name = schema.name;
        SisClient.schemas.delete(schema, function(err, res) {
            if (!err) {
                $scope.$apply(function() {
                    for (var i = 0; i < $scope.schemas.length; ++i) {
                        if ($scope.schemas[i].name == name) {
                            $scope.schemas.splice(i, 1)
                            break;
                        }
                    }
                });
            }
        });
    }

    $scope.canManage = function(schema) {
        return SisUtil.canManageSchema(schema);
    }

    $scope.canRemove = function(schema) {
        return $scope.canManage(schema) && SisUtil.canDelete(schema);
    }

    SisClient.schemas.listAll({ sort : "name" }, function(err, schemas) {
        if (schemas) {
            schemas = schemas.map(function(s) {
                return s;
            })
            $scope.$apply(function() {
                $scope.schemas = schemas;
            })
        }
    });
});