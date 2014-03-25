'use strict';

sisapp.controller("SchemaDefinitionController", function($scope) {

    function getArrayDescriptor(arr, name) {
        var res = {
            type : "Array"
        };
        if (arr.length) {
            res['children'] = [normalizeDescriptor(arr[0])];
        } else {
            res['children'] = [{ "type" : "Mixed" }]
        }
        if (name) {
            res['name'] = name;
        }
        return res;
    }

    function normalizeDescriptor(desc, name) {
        if (desc instanceof Array) {
            return getArrayDescriptor(desc, name);
        } else if (typeof desc === "string") {
            return { type : desc, name : name };
        } else if ('type' in desc) {
            if (typeof desc.type === "string") {
                var result = {
                    name : name
                };
                for (var k in desc) {
                    result[k] = desc[k];
                }
                if (desc.type == "ObjectId" && desc['ref']) {
                    result.type = desc['ref'];
                    result['url'] = "#/entities/" + result.type;
                }
                return result;
            } else {
                // check if it's an array
                if (desc['type'] instanceof Array) {
                    var arrDesc = getArrayDescriptor(desc['type'], name);
                    for (var k in desc) {
                        if (k != 'type') {
                            arrDesc[k] = desc[k];
                        }
                    }
                    return arrDesc;
                } else {
                    // type is an embedded schema or
                    var inner = {
                        name : name,
                        type : "Document",
                        children : getDescriptors(desc)
                    }
                    return inner;
                }
            }
        } else {
            // embedded scema
            var inner = {
                name : k,
                type : "Document",
                children : getDescriptors(desc)
            }
            return inner;
        }
    }

    function getDescriptors(defn) {
        var result = [];
        for (var k in defn) {
            var desc = defn[k];
            var normalized = normalizeDescriptor(desc, k);
            result.push(normalized);
        }
        return result;
    }

    $scope.$on('schema', function(event, schema) {
        $scope.schema = schema;
        $scope.descriptors = getDescriptors(schema.definition);
    });
})