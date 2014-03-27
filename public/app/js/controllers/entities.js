'use strict';

sisapp.controller("EntitiesController", function($scope, $location, $route,
                                                 $modal, SisUtil, SisClient) {
    if (!($route.current && $route.current.params && $route.current.params.schema)) {
        $location.path("/#schemas");
        return;
    }

    $scope.remove = function(entity) {

    }

    var schemaName = $route.current.params.schema;

    var addNew = function() {
        // bring up a dialog..
        var modalScope = $scope.$new(true);
        modalScope.schema = $scope.schema;
        modalScope.entity = { };
        modalScope.action = 'add';
        var modal = $modal.open({
            templateUrl : "public/app/partials/mod-entity.html",
            scope : modalScope,
            controller : "ShowEntityController"
        }).result.then(function(entity) {
            entity.__canManage = SisUtil.canManageEntity(entity, $scope.schema);
            $scope.entities.push(entity);
        });;
    }

    var editEntity = function(entity) {
        var modalScope = $scope.$new(true);
        modalScope.schema = $scope.schema;
        modalScope.entity = angular.copy(entity);
        modalScope.action = 'edit';
        var modal = $modal.open({
            templateUrl : "public/app/partials/mod-entity.html",
            scope : modalScope,
            controller : "ShowEntityController"
        }).result.then(function(entity) {
            entity.__canManage = SisUtil.canManageEntity(entity, $scope.schema);
            for (var i = 0; i < $scope.entities.length; ++i) {
                if ($scope.entities[i]['_id'] == entity['_id']) {
                    $scope.entities[i] = entity;
                    break;
                }
            }
        });
    }

    var viewEntity = function(entity) {
        var modalScope = $scope.$new(true);
        modalScope.schema = $scope.schema;
        modalScope.entity = entity;
        modalScope.action = 'view';
        $modal.open({
            templateUrl : "public/app/partials/mod-entity.html",
            scope : modalScope,
            controller : "ShowEntityController"
        });
    }

    SisClient.schemas.get(schemaName, function(err, schema) {
        if (schema) {
            $scope.canAdd = SisUtil.canAddEntity(schema);
            $scope.$broadcast('schema', schema);
            $scope.addNew = addNew;
            $scope.editEntity = editEntity;
            $scope.viewEntity = viewEntity;
            // grab the entities (TODO: paginate)
            SisClient.entities(schemaName).list(function(err, entities) {
                if (entities) {
                    $scope.$apply(function() {
                        $scope.schema = schema;
                        $scope.idField = SisUtil.getIdField(schema);
                        $scope.entities = entities.results.map(function(ent) {
                            ent.__canManage = SisUtil.canManageEntity(ent, schema);
                            return ent;
                        })
                    });
                }
            });
        } else {
            $location.path("/#schemas")
        }
    });
});