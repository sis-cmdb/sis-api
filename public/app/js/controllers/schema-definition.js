'use strict';

sisapp
.controller("SchemaDefinitionController", function($scope, SisClient, SisUtil) {

    $scope.$on('schema', function(event, schema) {
        $scope.schema = schema;
        $scope.descriptors = SisUtil.getDescriptorArray(schema);
    });
})