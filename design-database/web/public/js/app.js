'use strict';

angular.module('designAtlasApp', [
    'ngCookies',
    'ngResource',
    'ngSanitize',
    'ui.router',
    'ngAnimate',
    'designAtlasApp.controllers',
    'designAtlasApp.services',
    'designAtlasApp.directives',
    'designAtlasApp.filters'
])
.config(function ($stateProvider, $urlRouterProvider, $locationProvider) {
    $urlRouterProvider
        .otherwise('search');

    //$locationProvider.html5Mode(true);


    //
    // For any unmatched url, redirect to /state1
    $urlRouterProvider.otherwise("/search");
    //
    // Now set up the states
    $stateProvider
        .state('search', {
            url: "/search",
            templateUrl: "partials/search.html"
        })
        //.state('state1.list', {
        //    url: "/list",
        //    templateUrl: "partials/state1.list.html",
        //    controller: function($scope) {
        //        $scope.items = ["A", "List", "Of", "Items"];
        //    }
        //})
        //.state('browse', {
        //    url: "/browse",
        //    templateUrl: "partials/browse.html"
        //})
        .state('audit', {
            url: "/audit",
            templateUrl: "partials/audit.html"
        })
        .state('guide', {
            url: "/guide",
            templateUrl: "partials/guide.html"
        });
        //.state('state2.list', {
        //    url: "/list",
        //    templateUrl: "partials/state2.list.html",
        //    controller: function($scope) {
        //        $scope.things = ["A", "Set", "Of", "Things"];
        //    }
        //});


});



angular.module('designAtlasApp.controllers', []);
angular.module('designAtlasApp.services', []);
angular.module('designAtlasApp.directives', []);
angular.module('designAtlasApp.filters', []);

