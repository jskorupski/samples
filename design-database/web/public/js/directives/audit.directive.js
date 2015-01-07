angular.module('designAtlasApp.directives')
    .directive('auditFrame', function () {
        return {
            restrict: 'E',
            replace: true,
            require: '^AuditController',
            templateUrl: 'partials/audit.directive.html',
            scope: true,
            link: ["$scope", "$element", "$attrs", function($scope, $lement, $attrs){
                debugger;
                console.log('what');
            }],
            controller: [
                '$scope', '$rootScope', '$element', '$attrs', '$timeout', '$sce', 'deviceService',
                function ($scope, $rootScope, $element, $attrs, $timeout, $sce, deviceService) {


                    $scope.auditData = {
                        auditUrl : "",
                        devices: [],
                        currentDevice: undefined
                    };
                    deviceService.getDevices(function(deviceData){

                        $scope.auditData.devices = deviceData.deviceList;
                        $scope.auditData.currentDevice = $scope.auditData.devices[0];
                        $scope.selectNewDevice();
                    });


                    var iframeContainer = angular.element(document.querySelector("#webiframe"));
                    var iframeOverlay = angular.element(document.querySelector("#webiframeoverlay"));
                    var iframeElem = angular.element(document.querySelector("#webiframe iframe"));

                    var lastSelected = {
                                    element: undefined,
                                    prevBorderString: undefined
                    };


                    function getElementImageRenderURL(angularElement) {


                        var selector = "";

                        if(angularElement.attr('id')) {

                            selector += ('#' + angularElement.attr('id'));

                        }

                        if(angularElement.attr('class')) {

                            selector += ('.' + angularElement.attr('class'));

                        }

                        if(selector === "") {

                            selector += angularElement.prop("tagName").toLowerCase();
                        }


                        var imageUrl = "screenshot/instant/?url=" + encodeURIComponent($scope.auditParams.auditUserURL) +
                                "&deviceId=" + encodeURIComponent($scope.auditData.currentDevice.deviceId) +
                                "&selector=" + encodeURIComponent(selector);


                        return imageUrl;



                    }


                    iframeOverlay.bind("click", function(e){


                                    var parentOffset = angular.element(this).parent().offset();
                                    //or $(this).offset(); if you really just want the current element's offset
                                        var relX = e.pageX - parentOffset.left;
                                    var relY = e.pageY - parentOffset.top;


                                            var iframewindow = frames['webview'];


                                           var iframeSelected = iframewindow.document.elementFromPoint(relX, relY);


                                            //Alternative, use "outline" to not affect layout at all
                                        if(lastSelected.element) {
                                            angular.element(lastSelected.element).css('outline', lastSelected.prevBorderString);
                                            lastSelected.element = undefined;
                                        }

                                       if(iframeSelected) {

                                           lastSelected.element = angular.element(iframeSelected);
                                           lastSelected.prevBorderString = lastSelected.element.css('outline');


                                           lastSelected.element.css('outline', "2px dashed blue");


                                           $scope.auditParams.currentSelectedElement = lastSelected.element;
                                           $scope.auditParams.componentRenderUrl = $sce.trustAsResourceUrl(getElementImageRenderURL(lastSelected.element));
                                           $scope.auditParams.componentTextContent =  $scope.currentSelectedElement ? $scope.currentSelectedElement.text() : "";

                                           $scope.$apply();


                                        }



                       });

                    iframeOverlay.on("scroll mousewheel", function(e){

                        if(e.originalEvent.wheelDelta < 0) {

                            if(lastSelected.element && lastSelected.element.parent()) {

                                angular.element(lastSelected.element).css('outline', lastSelected.prevBorderString);




                                lastSelected.element =  angular.element(lastSelected.element.parent());
                                lastSelected.prevBorderString = lastSelected.element.css('outline');


                                lastSelected.element.css('outline', "2px dashed blue");


                                $scope.auditParams.currentSelectedElement = lastSelected.element;
                                $scope.auditParams.componentRenderUrl = $sce.trustAsResourceUrl(getElementImageRenderURL(lastSelected.element));
                                $scope.auditParams.componentTextContent =  $scope.currentSelectedElement ? $scope.currentSelectedElement.text() : "";
                                $scope.$apply();


                            }


                        }
                        else {
                            if(lastSelected.element && lastSelected.element.children()[0]) {

                                angular.element(lastSelected.element).css('outline', lastSelected.prevBorderString);




                                lastSelected.element =  angular.element(lastSelected.element.children()[0]);
                                lastSelected.prevBorderString = lastSelected.element.css('outline');


                                lastSelected.element.css('outline', "2px dashed blue");



                                $scope.auditParams.currentSelectedElement = lastSelected.element;
                                $scope.auditParams.componentRenderUrl = $sce.trustAsResourceUrl(getElementImageRenderURL(lastSelected.element));
                                $scope.auditParams.componentTextContent =  $scope.currentSelectedElement ? $scope.currentSelectedElement.text() : "";
                                $scope.$apply();

                            }


                        }




                    });

                    $scope.$watch("auditParams.auditUserURL", function(newValue, oldValue){


                        if(newValue && $scope.auditData.currentDevice !== undefined) {
                            $scope.loadPage();
                        }
                    });


                    $scope.loadPage = function() {

                        $scope.auditData.auditUrl = $sce.trustAsResourceUrl("proxy/?proxyUrl=" + $scope.auditParams.auditUserURL + "&deviceId=" + $scope.auditData.currentDevice.deviceId);
                    };

                    $scope.selectNewDevice = function(){


                        var containerZoom = 800/$scope.auditData.currentDevice.height;


                        $scope.loadPage();

                        iframeContainer.css("zoom", containerZoom);

                        iframeElem.attr('width', $scope.auditData.currentDevice.width);
                        iframeElem.attr('height', $scope.auditData.currentDevice.height);


                        //iframeOverlay.css("zoom", 400/$scope.auditData.currentDevice.width);

                        //Keep sroll bar visible
                        var overlayActualWidth = ($scope.auditData.currentDevice.width) - 11*containerZoom;
                        iframeOverlay.css('width', overlayActualWidth + "px");
                        iframeOverlay.css('height', $scope.auditData.currentDevice.height + "px");
                    };



                }]
            //compile: [
            //    '$scope', '$rootScope', '$element', '$attrs', '$timeout','$sce',
            //    function ($scope, $element, $attrs, $timeout, $sce) {
            //
            //
            //        //Link function returned
            //        return function postLink($scope, $element, $attrs, $timeout, $sce) {
            //
            //                var iframeContainer = angular.element(document.querySelector("#webiframe"));
            //                var iframeOverlay = angular.element(document.querySelector("#webiframeoverlay"));
            //                var iframeElem = angular.element(document.querySelector("#webiframe iframe"));
            //
            //                debugger;
            //                iframeOverlay.on('scroll', function(arguments){
            //
            //                    console.log(arguments);
            //                });
            //
            //
            //
            //
            //            };
            //
            //
            //
            //
            //
            //
            //        //element.find(':input').on('blur',function(){
            //    //    console.log('finally!')
            //    //})
            //}]
        };
    });