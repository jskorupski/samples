angular.module('designAtlasApp.controllers')
    .controller('MainController', ['$scope', '$state','$location',
        function($scope, $state, $location) {

            $scope.searchScopeList = [
                {name: "All Entries", scope:"all"},
                {name: "Guidelines", scope:"guide"},
                {name: "Components", scope:"component"}

            ];

            $scope.searchQuery = {
                searchTerm: undefined,
                searchScope:  $scope.searchScopeList[0]
            };


            var locData = $location.search();

            if(locData.q) {
                $scope.searchQuery.searchTerm = locData.q;

            }

    }]);
