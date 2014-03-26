'use strict';

sisapp
.controller("EntityDescriptorController", function($scope, SisUtil) {
    // gets a descriptor that might also map
    // to a field with a value in an entity
    var setup = function() {
        var value = $scope.value;
        var desc = $scope.descriptor;
        var paths = SisUtil.getDescriptorPath(desc);
        if (!isNaN($scope.arrIdx)) {
            paths.push($scope.arrIdx);
        }
        $scope.path = paths.join(".");
        if (desc.type == "Array") {
            // document is an array
            $scope.array = value[desc.name] || [];
            $scope.childDesc = desc['children'][0];
        } else if (desc.type == "Document") {
            $scope.doc = value[desc.name] || {};
            $scope.children = desc['children'];
        } else {
            // normal value.
            if (typeof value === 'object') {
                $scope.fieldValue = value[desc.name] || "";
            } else {
                $scope.fieldValue = value;
            }
        }
    }

    $scope.addItem = function() {
        if (!$scope.array) {
            return;
        }
        var item = SisUtil.getNewItemForDesc($scope.childDesc);
        $scope.array.push(item);
    }

    $scope.delItem = function(idx) {
        if (!$scope.array) {
            return;
        }
        if (idx >= 0 && idx < $scope.array.length) {
            $scope.array.splice(idx, 1);
        }
    }

    $scope.isItem = function() {
        var result = !isNaN($scope.arrIdx);
        return result;
    }

    $scope.init = function(value, descriptor, arrIdx) {
        $scope.value = value;
        $scope.descriptor = descriptor;
        $scope.arrIdx = arrIdx;
        setup();
    }

});

sisapp
.controller("ModEntityController", function($scope, SisUtil, SisClient) {
    var entity = $scope.entity;
    $scope.descriptors = SisUtil.getDescriptorArray($scope.schema);
    $scope.value = entity;
})