

angular.module("designAtlasApp.services")
    .factory("searchService", ["$http", "$q", "$location", "$state", "$timeout",
        function ($http, $q, $location, $state, $timeout) {

            //TODO: handle simultaneous requests properly as done with eBayX project

            var AUTOSEARCH_DELAY = 0;

            var SOLR_ROW_COUNT = 10;
            var outstandingSearchPromise = { component: undefined, guide: undefined};

            function search(docType, keyword, filterQueryArray, startIndex, callback) {



                keyword = keyword.replace(/[\])}[{("']/g,'');



                if (outstandingSearchPromise[docType]) {
                    outstandingSearchPromise[docType].resolve();
                    outstandingSearchPromise[docType] = undefined;
                }

                //Set search to include substrings with * characters

                if(keyword && keyword.charAt(0) !== "*") {
                    keyword = "*" + keyword;
                }

                if(keyword && keyword.charAt(keyword.length - 1) !== "*") {
                    keyword = keyword + "*";
                }

                var paramData = {
                    query: keyword,
                    start: startIndex,
                    rows: SOLR_ROW_COUNT,
                    fq: "documentType:" + docType
                };

                if(filterQueryArray) {
                    filterQueryArray.forEach(function (fqObj, index) {

                        paramData['fq' + index] = fqObj.name + ":" + fqObj.value;
                    });
                }


                outstandingSearchPromise[docType] = $q.defer();

                return $http({
                    method: 'GET',
                    url: '/db/search',
                    params: paramData,
                    timeout: outstandingSearchPromise[docType].promise
                }).success(function (result) {
                    if(callback) {
                        callback(null, result);
                    }
                }).error(function(err) {

                    if(callback) {
                        callback("Canceled", null);
                    }

                    if(err) {
                        console.log(err);
                    }

                    // called asynchronously if an error occurs
                    // or server returns response with an error status.
                });

            }



            var searchApi = {
                search: search
            };


            return searchApi;

        }]);
