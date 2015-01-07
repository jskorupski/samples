angular.module('designAtlasApp.filters')
    .filter('toTitleCase', function() {
        return function(input) {


            return input.charAt(0).toUpperCase() + input.slice(1);


        };
    })
    .filter('toUpperCase', function() {
        return function(input) {

            return input.toUpperCase();


        };
    })
    .filter('toImageUrl', function() {
        return function(name) {

            return "screenshot/?name=" + encodeURIComponent(name);


        };
    });

