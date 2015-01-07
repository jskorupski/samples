

angular.module("designAtlasApp.services")
    .factory("deviceService", ["$resource",
        function ($resource) {

            return $resource("devices/", {}, {
                getDevices: {method: 'GET', cache: true, isArray: false}
            });

        }
     ]
);
