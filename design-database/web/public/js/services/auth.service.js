'use strict';

angular.module('designAtlasApp.services')
    .factory("authenticationSvc", function($http, $q, $window) {
        var userInfo;

        function login(userName, password) {
            var deferred = $q.defer();

            $http.post("/api/login", {
                userName: userName,
                password: password
            }).then(function(result) {
                userInfo = {
                    accessToken: result.data.access_token,
                    userName: result.data.userName
                };
                $window.sessionStorage["userInfo"] = JSON.stringify(userInfo);
                deferred.resolve(userInfo);
            }, function(error) {
                deferred.reject(error);
            });

            return deferred.promise;
        }

        return {
            login: login
        };
    });