'use strict';

sisapp.controller("EntitiesController", function($scope, $location, $route,
                                                 currentUserService, SisClient) {
    if (!($route.current && $route.current.params && $route.current.params.schema)) {
        $location.path("/#schemas");
        return;
    }

    var canManage = function(entity, schema) {
        var user = currentUserService.getCurrentUser();
        if (!user || entity.sis_locked) {
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

    var getIdField = function(schema) {
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

    $scope.remove = function(entity) {

    }


    var schemaName = $route.current.params.schema;
    SisClient.schemas.get(schemaName, function(err, schema) {
        if (schema) {
            $scope.$broadcast('schema', schema);
            // grab the entities (TODO: paginate)
            SisClient.entities(schemaName).list(function(err, entities) {
                if (entities) {
                    $scope.$apply(function() {
                        $scope.schema = schema;
                        $scope.idField = getIdField(schema);
                        $scope.entities = entities.results.map(function(ent) {
                            ent.canManage = canManage(ent, schema);
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