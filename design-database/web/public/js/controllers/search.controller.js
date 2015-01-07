'use strict';


angular.module('designAtlasApp.controllers')
    .controller('SearchResultsController', ['$scope', '$location', 'searchService', function($scope, $location, $searchService) {



        $scope.resultSets = {
            component: {
                totalResults: 0,
                moreResults: true,
                searchResults: [],
                facets: [],
                selectedFacets: [],
                rowStartIndex : 0,
                lastRowCount: 0
            },
            guide: {
                totalResults: 0,
                moreResults: true,
                searchResults: [],
                facets: [],
                selectedFacets: [],
                rowStartIndex : 0,
                lastRowCount: 0
            }
        };


        //$scope.componentResultSet.searchResults = [];
        //
        //$scope.facets = [];
        //
        //$scope.selectedFacets = [];


        //var rowStartIndex = 0;
        //var lastRowCount = 0;




        function reset() {

            for(var rSet in $scope.resultSets) {
                $scope.resultSets[rSet].searchResults = [];
                $scope.resultSets[rSet].facets = [];
                $scope.resultSets[rSet].selectedFacets = [];
                $scope.resultSets[rSet].rowStartIndex = 0;
                $scope.resultSets[rSet].totalResults = 0;
                $scope.resultSets[rSet].moreResults = false;

            }



        }

        function doSearch(docType, loadMore) {

            if(loadMore) {
                $scope.resultSets[docType].rowStartIndex += $scope.resultSets[docType].searchResults.length;
            }
            else {
                $scope.resultSets[docType].rowStartIndex = 0;

            }

            $searchService.search(docType, $scope.searchQuery.searchTerm, $scope.resultSets[docType].selectedFacets, $scope.resultSets[docType].rowStartIndex, function (err, result){


                if(!err) {

                    if(loadMore) {
                        result.results.forEach(function (resultItem) {
                            $scope.resultSets[docType].searchResults.push(resultItem);

                        });
                    }
                    else {
                        $scope.resultSets[docType].searchResults = result.results;
                    }


                    $scope.resultSets[docType].lastRowCount = $scope.resultSets[docType].searchResults.length;
                    $scope.resultSets[docType].facets = result.facets;
                    $scope.resultSets[docType].moreResults = (($scope.resultSets[docType].rowStartIndex + $scope.resultSets[docType].searchResults.length) < result.totalResults);
                    $scope.resultSets[docType].totalResults = result.totalResults;




                }
            });


        }

        $scope.addFacet = function (docType, facetName, facetValue) {





            var facetAlreadyExists = false;

            for(var i=0; i<$scope.resultSets[docType].selectedFacets.length; i++) {

                if($scope.resultSets[docType].selectedFacets[i].name === facetName && $scope.resultSets[docType].selectedFacets[i].value === facetValue) {
                    facetAlreadyExists = true;
                    break;
                }
            }



            if(!facetAlreadyExists) {
                var newindex = $scope.resultSets[docType].selectedFacets.length;
                $scope.resultSets[docType].selectedFacets.push(
                    {
                        name: facetName,
                        value: facetValue,
                        index: newindex
                    }
                );

                doSearch(docType, false);


            }


        };

        $scope.deleteFacet = function (docType, facetIndex) {


            $scope.resultSets[docType].selectedFacets.splice(facetIndex, 1);


            doSearch(docType, false);

        };

        $scope.loadMoreResults = function (docType, facetIndex) {



            doSearch(docType, true);


        };



        $scope.$watch('searchQuery.searchTerm', function(newTerm, oldTerm){

            $location.search('q', newTerm);


            if(newTerm === "") {
                reset();
            }
            else if(newTerm !== undefined) {

                doSearch("component", false);
                doSearch("guide", false);

            }



        });

    }]);