


GlobePropertyAnimator = function(){

  var _this = this;

    _this.animatingObjects = {};


    //list of objectids, stored with a list of animationTypes currently active

    _this.startAnimation = function (objectUniqueId, animationName, sourceObject, targetObject, updateFunction, onCompleteFunction, length, delay, tweenEasingFunc, yoyoAnimation, interruptExistingAnimation) {


        //Make sure to stop existing animations if multiple are occurring on same property
        //Use animationNameType to detect overlapping updates on same object name


        function makeNewTween() {

            var currentSourceObject = sourceObject;


            //console.log(objectUniqueId + ":Starting tween: length:" + length + ",delay:" + delay);
            if (!_this.animatingObjects[objectUniqueId]) {
                _this.animatingObjects[objectUniqueId] = {};
            }
            else {

                //If we have an existing animating property of the same name, then set our source to it's internal interpolated object and stop the old one
                if (_this.animatingObjects[objectUniqueId][animationName]) {

                    if(interruptExistingAnimation) {
                        var existingTween = _this.animatingObjects[objectUniqueId][animationName];

                        existingTween.stop();

                        //This causes a problem because the yoyo comes gback to the intermediate position!!!!
                    }
                    else {
                        //Don't make new animation! Stop here!
                        return;
                    }


                }

            }


            //TO DO: how to deal with interrupting a tween
            var newTween = new TWEEN.Tween(currentSourceObject)
                .to(targetObject, length)
                .repeat((yoyoAnimation ? 1 : 0))
                //.delay(delay) - this built in delay function is not reliable
                .yoyo(yoyoAnimation)
                .easing(tweenEasingFunc)
                .onUpdate(updateFunction)
                .onComplete(function () {
                    //Remove property from reference table
       
                    delete _this.animatingObjects[objectUniqueId][animationName];

                    if(onCompleteFunction) {onCompleteFunction();}
                });
    








            _this.animatingObjects[objectUniqueId][animationName] = newTween;

            newTween.start();
        }

		//Use manual delay
        if (delay > 0) {

            setTimeout(function () {
                makeNewTween();
            }, delay);
        }
        else {
            makeNewTween();
        }
    };




    _this.update = function (deltaTMS) {

      TWEEN.update();

    };

  return _this;
};