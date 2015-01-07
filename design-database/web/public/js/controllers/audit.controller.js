'use strict';

angular.module('designAtlasApp.controllers')
    .controller('AuditController', ['$scope', function($scope) {


        $scope.auditParams = {
            auditUserURL: "http://m.ebay.com",
            componentRenderUrl: "",
            currentSelectedElement: undefined,
            componentTextContent: ""
        };




    }]);