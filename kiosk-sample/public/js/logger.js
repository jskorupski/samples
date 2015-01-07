var _logger = _makeLogManager();



function _makeLogManager() {

    var _timer = _makeLogTimer();

    var self = {
        timer: _timer,
        init: init,
        setSessionId: setSessionId,
        logProductView: logProductView,
        logCartEvent: logCartEvent,
        logSessionCompletion: logSessionCompletion,
        //logNewTrackedUserData: logNewTrackedUserData,
        //logNewUserData: logNewUserData,
        logLostUserData: logLostUserData,
        logLostTrackedUserData: logLostTrackedUserData
    }

    var _serviceHost = "http://localhost:3001";
    var _kinectTracker = null;
    var _missingFieldString = "NONE";
    var _missingFieldNumber = 0;
    var _sessionId = _missingFieldString;


    return self;

    // ******************
    // NO VARIABLE DECLARATIONS AFTER THIS LINE!!!! WILL NOT WORK!!!
    // no inline code execution either - only internal function definitions
    // ******************




    function init(localServicePort, kinectTracker) {

        if(localServicePort != undefined) { _serviceHost = "http://localhost:" + localServicePort; }
        if(kinectTracker != undefined) {_kinectTracker = kinectTracker;}

    }

    function setSessionId(sessionId) {

        if(sessionId != undefined) {_sessionId = sessionId;}

    }

    function getUnixTime() {

        return Math.round((new Date()).getTime() / 1000);

    }
    function getLocalSortableDateTimeString() {


        var dNow = new Date();

        var year = dNow.getFullYear();
        var month = 1 + dNow.getMonth();
        //Month range we get is from 0 to 11 - we increment by one to make it human readable

        month = (month >= 10 ) ? month : "0" + month;


        var day = dNow.getDate();
        day = (day >= 10 ) ? day : "0" + day;

        var hours = dNow.getHours();
        hours = (hours >= 10 ) ? hours : "0" + hours;

        var minutes = dNow.getMinutes();
        minutes = (minutes >= 10 ) ? minutes : "0" + minutes;

        var seconds = dNow.getSeconds();
        seconds = (seconds >= 10 ) ? seconds : "0" + seconds;


        return year + "-" + month + '-' + day + ' ' + hours + ':' + minutes + ':' + seconds;
    }


    function logNewTrackedUserData(kinectUser) {
        var localTime = getLocalSortableDateTimeString();
        var unixTime = getUnixTime();
        var kinectUserHeight = _kinectTracker ? _kinectTracker.getUserHeight(kinectUser) : -1;

        var logData = {
            timestamp: localTime,
            unixTime: unixTime,
            sessionId: _sessionId,
            type: "kinectFoundTrackedSkeleton",
            userId: kinectUser.id,
            height: kinectUserHeight
        };

        logDataToWebService('/logKinectData', logData);

    }

    function logLostTrackedUserData(kinectUser) {
        var localTime = getLocalSortableDateTimeString();
        var unixTime = getUnixTime();
        var kinectUserHeight = _kinectTracker ? _kinectTracker.getUserHeight(kinectUser) : -1;

        var logData = {
            timestamp: localTime,
            unixTime: unixTime,
            sessionId: _sessionId,
            type: "kinectLostTrackedSkeleton",
            userId: kinectUser.id,
            height: kinectUserHeight,
            trackedTimeSeconds: kinectUser.skeletonTrackTotalTimeSeconds
        };

        logDataToWebService('/logKinectData', logData);

    }

    function logNewUserData(kinectUser) {
        var localTime = getLocalSortableDateTimeString();
        var unixTime = getUnixTime();
        var logData = {
            timestamp: localTime,
            unixTime: unixTime,
            sessionId: _sessionId,
            type: "kinectFoundUser",
            userId: kinectUser.id
        };

        logDataToWebService('/logKinectData', logData);

    }


    function logLostUserData(kinectUser) {
        var localTime = getLocalSortableDateTimeString();
        var unixTime = getUnixTime();
        var logData = {
            timestamp: localTime,
            unixTime: unixTime,
            sessionId: _sessionId,
            type: "kinectLostUser",
            userId: kinectUser.id,
            trackedTimeSeconds: kinectUser.userTrackTotalTimeSeconds
        };

        logDataToWebService('/logKinectData', logData);

    }



    /*
        NOTE: for ALL timing calculation, we assume that the incoming times have already been corrected with
              idle timeout time taken into account. The _logger.timer object expects an idle time parameter for every
              timer end function, which automatically subtracts that idle time from the total tracked time. This ensures
              that our timing data isn't skewed by extra idle time

        sessionTotalTimeS: Number (seconds) - total session time from first tap to idle timeout or user 'close' button tap
        sessionCompleted: 	Was the session completed (sms sent, etc)? true/false
        browseViewCount: Number - number of views to the browsing carousel page
        browseTimeTotalS: Number - total time spent on browsing carousel page,
        browseHelpCircleViewCount: Number - number of times user clicked on help circles on browse page
        productViewCountTotal: Number - total number of views for all product Id's (sum up all totalViews values in array)
        productViewTimeTotalS: Number - total time spent viewing products (sum up all totalTimeS values in array)
        productViewsArray: Array of objects -> [ {productId: <number>, totalTimeS: <number>, totalViews: <number>} ]
        cartViewCount: Number
        cartTotalTimeS: Number (seconds) - Total time spent on cart page
        cartTotalCount: total item count (number)
        cartTotalPrice total price of cart (number)
        cartContentArray: Array of objects -> [ {productId: <number>, style: <string>, color: <string>, colorDescription: <string>, size: <string>, price: <number>, qty: <number>} ]
        checkoutPageViewCount: Number - Total number of views of checkout/sms page
        checkoutPageTotalTimeS: Number  (Seconds) - Total time spent on checkout/sms page
        smsResendActionCount: Number - total number of times user tapped "I don't see it" after SMS send completion
        confirmationPageViewCount:
        confirmationPageTotalTimeS:
        thankyouPageViewCount:
        thankyouPageTotalTimeS:
        idleTimeoutHappened: Did the Kiosk time out from no activity? true/false
        idleTimeoutSettingS: Number (seconds), global idle timeout value
        lastVisitedPage: String, with specific values:
                        'attract'
                        'browse'
                        'pdp'
                        'cart'
                        'checkout'
                        'confirmation'
                        'thankyou'
        userFinishHappened: Did the user click the finished button? true/false
        userStartOverHappened: Did the user click the start over button at the top? true/false
        userPhoneNumber: String - last number entered by user
        smsSendCount: How many SMS's sent
        globalHelpButtonViewCount : Number - total number of times user viewed the global help button
        pageHistoryArray: List of page names (same strings from lastVisitedPage parameter) visited, in order, by user
        screenTapsSinceLastSession: number of screen taps since last session (number)
    */
    function logSessionCompletion(sessionTotalTimeS, sessionComplete, browseViewCount, browseTimeTotalS, browseHelpCircleViewCount,
                                  productViewCountTotal, productViewTimeTotalS, productViewsArray, cartViewCount,
                                  cartTotalTimeS, cartTotalCount, cartTotalPrice, cartContentArray, checkoutPageViewCount, checkoutPageTotalTimeS,
                                  smsResendActionCount, confirmationPageViewCount, confirmationPageTotalTimeS,
                                  thankyouPageViewCount, thankyouPageTotalTimeS, idleTimeoutHappened, idleTimeoutSettingS, lastVisitedPage,
                                  userFinishHappened,  userStartOverHappened, userPhoneNumber, smsSendCount, globalHelpButtonViewCount,
                                  pageHistoryArray, screenTapsSinceLastSession) {


        var localTime = getLocalSortableDateTimeString();
        var unixTime = getUnixTime();
        //var kinectUserHeight = _kinectTracker ? _kinectTracker.getUserHeight(_kinectTracker.getPrimaryUser()) : -1;
        var kinectTrackedUserHeights = _kinectTracker ? _kinectTracker.getTrackedUserHeights() : [];
        var kinectAllUserCount = _kinectTracker ? _kinectTracker.getAllUserArray().length : 0;
        if(kinectAllUserCount < 1) {kinectAllUserCount = 1;} //We know at least ONE user is present, even if kinect
                                                             //doesn't track him/her

        //var kinectTrackedUserCount =  _kinectTracker ? _kinectTracker.getEngagedUserArray().length : 0;


        var logData = {
            timestamp: localTime,
            unixTime: unixTime,
            type: "sessionCompleted",
            sessionId: _sessionId,
            sessionTotalTimeS: sessionTotalTimeS,
            sessionComplete: sessionComplete,
            browseViewCount: browseViewCount,
            browseTimeTotalS: browseTimeTotalS,
            browseHelpCircleViewCount: browseHelpCircleViewCount,
            productViewCountTotal: productViewCountTotal,
            productViewTimeTotalS: productViewTimeTotalS,
            productViewsArray: productViewsArray,
            cartViewCount: cartViewCount,
            cartTotalTimeS: cartTotalTimeS,
            cartTotalCount: cartTotalCount,
            cartTotalPrice: cartTotalPrice,
            cartContentArray: cartContentArray,
            checkoutPageViewCount: checkoutPageViewCount,
            checkoutPageTotalTimeS: checkoutPageTotalTimeS,
            smsResendActionCount: smsResendActionCount,
            confirmationPageViewCount: confirmationPageViewCount,
            confirmationPageTotalTimeS: confirmationPageTotalTimeS,
            thankyouPageViewCount: thankyouPageViewCount,
            thankyouPageTotalTimeS: thankyouPageTotalTimeS,
            idleTimeoutHappened: idleTimeoutHappened,
            idleTimeoutSettingS: idleTimeoutSettingS,
            lastVisitedPage: lastVisitedPage,
            userFinishHappened: userFinishHappened,
            userStartOverHappened: userStartOverHappened,
            userPhoneNumber: userPhoneNumber,
            smsSendCount: smsSendCount,
            globalHelpButtonViewCount: globalHelpButtonViewCount,
            pageHistoryArray: pageHistoryArray,
            kinectUserCount: kinectAllUserCount,
            kinectUserHeights: kinectTrackedUserHeights,
            screenTapsSinceLastSession: screenTapsSinceLastSession
        };

//
//        console.log("Logged session completion");
//        console.log(logData);

        logDataToWebService('/logSessionData', logData);

    }

    /*
        productId: String - unique id for this particular product combination of size/color/style
        style: String
        color: String
        colorDescription: String
        size: String
        price: Number
        qty: Number,
        viewTimeS: Number (seconds) - total time spent viewing that particular item
     */
    function logProductView(productId, style, color, colorDescription, size, price, qty, viewTimeS) {



        var localTime = getLocalSortableDateTimeString();
        var unixTime = getUnixTime();
        var kinectTrackedUserHeights = _kinectTracker ? _kinectTracker.getTrackedUserHeights() : [];
        var kinectAllUserCount = _kinectTracker ? _kinectTracker.getAllUserArray().length : 0;
        if(kinectAllUserCount < 1) {kinectAllUserCount = 1;}
                                //We know at least ONE user is present, even if kinect
                                //doesn't track him/her

        var logData = {
            timestamp: localTime,
            unixTime: unixTime,
            type: "productView",
            sessionId: _sessionId,
            productId: productId,
            style: style,
            color: color,
            colorDescription: colorDescription,
            size: size,
            qty: qty,
            price: price,
            viewTimeS: viewTimeS,
            kinectUserCount: kinectAllUserCount,
            kinectUserHeights: kinectTrackedUserHeights
        };

//        console.log("Producted viewed");
//        console.log(logData);

        logDataToWebService('/logSessionData', logData);

    }


    /*
     cartEventType: String, with specific values:
                        'add' -> NEW item added to cart from PDP page (not for quantity increase)
                        'delete' -> item removed completely from cart (not for quantity reduction)
                        'viewed' -> cart is just viewed (nothing added to it)
                        'sms' -> sent this cart over SMS (happens immediately after SMS sent)
     changedProductId: String,  the productId of item that was added/deleted -
                        -> Set to null if cartEventType is 'view' or 'sms'
     changedProductStyle: String,  the style of item that was added/deleted -
                        -> Set to null if cartEventType is 'view' or 'sms'
     changedProductColor: String, the color  of item that was added/deleted -
                        -> Set to null if cartEventType is 'view' or 'sms'
     changedProductColorDesc: String, color desc (or null)
     changedProductSize: String, the size of item that was added/deleted -
                        -> Set to null if cartEventType is 'view' or 'sms'
     changedProductPrice: Number, the price of item that was added/deleted -
                        -> Set to null if cartEventType is 'view' or 'sms'
     changedProductQty: Number, the new quantity of item that was added/deleted
                        -> Set to null if cartEventType is 'view' or 'sms'
     cartViewCount: Number, total views to cart (including this one)
     cartTotalTimeS: Number, total time spent on cart so far
     cartTotalPrice: Number, total price of all items in cart
     cartTotalCount: Number, total number of items in cart (including multiple qty of unique products)
     cartContentArray: Array of objects -> [ {productId: <number>, style: <string>, color: <string>, colorDescription: <string>, size: <string>, price: <number>, qty: <number>} ]
     userPhoneNumber: String, phone number sent over SMS
                    -> null if cartEventType is 'add', 'delete', or 'viewed'

     */
    function logCartEvent(cartEventType, changedProductId, changedProductStyle, changedProductColor, changedProductColorDesc, changedProductSize,
                          changedProductPrice, changedProductQty, cartViewCount, cartTotalTimeS, cartTotalPrice,
                          cartTotalCount, cartContentArray, userPhoneNumber) {


        var localTime = getLocalSortableDateTimeString();
        var unixTime = getUnixTime();
        var kinectTrackedUserHeights = _kinectTracker ? _kinectTracker.getTrackedUserHeights() : [];
        var kinectAllUserCount = _kinectTracker ? _kinectTracker.getAllUserArray().length : 0;
        if(kinectAllUserCount < 1) {kinectAllUserCount = 1;}
        //We know at least ONE user is present, even if kinect
        //doesn't track him/her




        var logData = {
            timestamp: localTime,
            unixTime: unixTime,
            type: "cartEvent",
            sessionId: _sessionId,
            cartEventType: cartEventType,
            changedProductId: ((changedProductId == null) ? _missingFieldString : changedProductId),
            changedProductStyle: ((changedProductStyle == null) ? _missingFieldString : changedProductStyle),
            changedProductColor: ((changedProductColor == null) ? _missingFieldString : changedProductColor),
            changedProductColorDesc: ((changedProductColorDesc == null) ? _missingFieldString : changedProductColorDesc),
            changedProductSize: ((changedProductSize == null) ? _missingFieldString : changedProductSize),
            changedProductPrice: ((changedProductPrice == null) ? _missingFieldNumber : changedProductPrice),
            changedProductQty: ((changedProductQty == null) ? _missingFieldNumber : changedProductQty),
            cartViewCount: cartViewCount,
            cartTotalTimeS: cartTotalTimeS,
            totalCartPrice: cartTotalPrice,
            totalCartCount: cartTotalCount,
            cartContentArray: cartContentArray,
            userPhoneNumber: ((userPhoneNumber == null) ? _missingFieldString : userPhoneNumber),
            kinectUserCount: kinectAllUserCount,
            kinectUserHeights: kinectTrackedUserHeights
        };

//        console.log("Cart Event");
//        console.log(logData);

        logDataToWebService('/logSessionData', logData);

    }

    function logDataToWebService(servicePath, logData) {
        try {
            $.ajax(

                _serviceHost + servicePath,
                {
                    type: 'POST',
                    dataType: "json",
                    data: { log: JSON.stringify(logData) },
                    success: function (items) {

                    },
                    error: function (xhr, ajaxOptions, thrownError) {
                        console.log("Logging error for service " + servicePath + ":" + thrownError);
                        console.log("Logging error response:  "+ xhr.responseText);
                    }
                });

        } catch(err) {

            console.log("Logging error for service " + servicePath + ": " + err);
        }



    }

}


function _makeLogTimer() {

    var _currentPageId = "NONE";
    var _eventCounters = {};
    var _productTimeTable = {};
    var _sessionStartMS = 0;
    var _miscEventTimeTable = {};
    var _pageTimers = {};
    var _pageHistoryArray = [];


    var  self = {
        setCurrentPage: setCurrentPage,
        getCurrentPage: getCurrentPage,
        getPageHistoryArray: getPageHistoryArray,
        startPageTimer: startPageTimer,
        endPageTimer: endPageTimer,
        peakPageTimer: peakPageTimer,
        getPageViewCount : getPageViewCount,
        getPageTotalTimeS: getPageTotalTimeS,
        resetPageTimer: resetPageTimer,
        resetAllPageTimers: resetAllPageTimers,
        incrementEventCounter:incrementEventCounter,
        getEventCounter: getEventCounter,
        resetEventCounter: resetEventCounter,
        resetAllEventCounters: resetAllEventCounters,
        startMiscEventTimer: startMiscEventTimer, //Misc event timing
        endMiscEventTimer: endMiscEventTimer, //Misc event timing
        peakMiscEventTimer: peakMiscEventsTimer, //Misc event timing
        resetMiscEventTimers: resetMiscEventTimers, //Misc event timing
        startSessionTimer: startSessionTimer,
        endSessionTimer: endSessionTimer,
        peakSessionTimer: peakSessionTimer,
        startProductTimer: startProductTimer,
        endProductTimer: endProductTimer,
        peakProductTimer: peakProductTimer,
        getProductViewsArray: getProductViewsArray,
        getTotalProductViewTimeS: getTotalProductViewTimeS,
        getTotalProductViewCount: getTotalProductViewCount,
        resetProductTimer: resetProductTimer,
        resetAllProductTimers: resetAllProductTimers,
        reset: reset

    };


    return self;

    // ******************
    // NO VARIABLE DECLARATIONS AFTER THIS LINE!!!! WILL NOT WORK!!!
    // no inline code execution either - only internal function definitions
    // ******************


    function setCurrentPage(currPageId) {

        _currentPageId = currPageId;
        _pageHistoryArray.push(currPageId);
    }

    function getCurrentPage() {

        return _currentPageId;
    }

    function getPageHistoryArray() {

        return _pageHistoryArray;
    }

    function startPageTimer(pageId) {
        if (!_pageTimers.hasOwnProperty(pageId)) {

            _pageTimers[pageId] = [];

        }

        _startTimeBlockTimer(_pageTimers[pageId]);

    }

    function endPageTimer(pageId, idleTimeS) {
        if (_pageTimers.hasOwnProperty(pageId)) {

            var actualIdleTime = idleTimeS;
            if(idleTimeS == null || idleTimeS == undefined) {
                actualIdleTime = 0;
            }
            return _endTimeBlockTimer(_pageTimers[pageId], actualIdleTime, true);

        }
        else {

            return 0;
        }

    }


    function peakPageTimer(pageId, totalTime) {

        if (_pageTimers.hasOwnProperty(pageId)) {

            if(totalTime) {
                return _getTotalTimeBlockTime(_pageTimers[pageId], 0, false);

            }
            else {
                return _endTimeBlockTimer(_pageTimers[pageId], 0, false);

            }

        }
        else {

            return 0;
        }

    }


    function getPageViewCount(pageId) {
        if (_pageTimers.hasOwnProperty(pageId)) {

            return _getTimeBlockCount(_pageTimers[pageId]);

        }
        else {

            return 0;
        }

    }

    function getPageTotalTimeS(pageId) {

        if (_pageTimers.hasOwnProperty(pageId)) {

            return _getTotalTimeBlockTime(_pageTimers[pageId], 0, false);

        }
        else {

            return 0;
        }



    }

    function resetPageTimer(pageId) {

        if (_pageTimers.hasOwnProperty(pageId)) {

            _pageTimers[pageId] = [];

        }

    }

    function resetAllPageTimers() {
        _pageTimers = {};
    }


    function incrementEventCounter(eventId) {

        if(_eventCounters.hasOwnProperty(eventId)) {

            _eventCounters[eventId] = _eventCounters[eventId] + 1;
        }
        else {

            _eventCounters[eventId] = 1;
        }

    }

    function getEventCounter(eventId) {

        if(_eventCounters.hasOwnProperty(eventId)) {

            return _eventCounters[eventId];
        }
        else {

            return 0;
        }

    }

    function resetEventCounter(eventId) {
        _eventCounters[eventId] = 0;

    }

    function resetAllEventCounters() {

        _eventCounters = {};
    }

    function startMiscEventTimer(eventId) {

        _miscEventTimeTable[eventId] = { startTime: (new Date()).getTime(), endTime: -1, totalTimeSeconds: -1 };
    }

    function peakMiscEventsTimer(eventId) {
        if (_miscEventTimeTable.hasOwnProperty(eventId)) {

            var currentTimeElement = _miscEventTimeTable[eventId];
            //In seconds
            return ((new Date()).getTime() - currentTimeElement.startTime)/1000;

        }
        else {

            return 0;
        }

    }
    function endMiscEventTimer(eventId, idleTimeS) {


        var actualIdleTime = idleTimeS;
        if(idleTimeS == null || idleTimeS == undefined) {
            actualIdleTime = 0;
        }

        if (_miscEventTimeTable.hasOwnProperty(eventId)) {

            var currentTimeElement = _miscEventTimeTable[eventId];

            if(currentTimeElement.endTime < 0) {

                //Timer not stopped, so we will stop the product timer now before adding up time
                currentTimeElement.endTime = (new Date()).getTime();

                //In seconds
                currentTimeElement.totalTimeSeconds = -1.0*actualIdleTime + (currentTimeElement.endTime - currentTimeElement.startTime)/1000;
                if (currentTimeElement.totalTimeSeconds < 0) {currentTimeElement.totalTimeSeconds = 0.0;}

            }

            return currentTimeElement.totalTimeSeconds;


        }
        else {

            return 0;
        }

    }

    function resetMiscEventTimers() {

        _miscEventTimeTable = {};

    }

    function startSessionTimer() {

        _sessionStartMS = (new Date()).getTime();

    }

    function endSessionTimer(idleTimeS) {

        var actualIdleTime = idleTimeS;
        if(idleTimeS == null || idleTimeS == undefined) {
            actualIdleTime = 0;
        }


        //In Seconds
        var sessionTimeS = -1.0*actualIdleTime + (((new Date()).getTime() - _sessionStartMS)/1000);
        if(sessionTimeS < 0.0) {sessionTimeS = 0.0;}

        return sessionTimeS;

    }


    function peakSessionTimer() {

        //In Seconds
        return ((new Date()).getTime() - _sessionStartMS)/1000;

    }

    //Internal functions are keeping track of time blocks (used for cart and checkout page timing)
    function _startTimeBlockTimer(timeBlockArray) {

        timeBlockArray.push({
            startTime: (new Date()).getTime(),
            endTime: -1,
            totalTimeSeconds: -1
        });

    }

    function _endTimeBlockTimer(timeBlockArray, idleTimeS, endTimer) {

        if (timeBlockArray.length > 0) {

            var lastElement = timeBlockArray[timeBlockArray.length - 1];


            if(endTimer) {

                lastElement.endTime = (new Date()).getTime();

                //In seconds
                lastElement.totalTimeSeconds = -1.0*idleTimeS + (lastElement.endTime - lastElement.startTime)/1000;
                if (lastElement.totalTimeSeconds < 0) {lastElement.totalTimeSeconds = 0.0;}
                return lastElement.totalTimeSeconds;

            }
            else {

                return -1.0*idleTimeS + ((new Date()).getTime() - lastElement.startTime)/1000
            }


        }
        else {

            return 0;
        }

    }

    function _getTotalTimeBlockTime(timeBlockArray, idleTimeS, endTimer) {

        var totalBlockTime = 0;

        //Add up all time chunks from the product views
        for(var i=0; i < timeBlockArray.length; i++) {

            var currentTimeElement = timeBlockArray[i];



            if(currentTimeElement.endTime < 0) {
                //We assume that this means we are at the latest time block which has not yet stopped

                if(endTimer) {

                    //Timer not stopped, so we will stop the product timer now before adding up time
                    currentTimeElement.endTime = (new Date()).getTime();

                    //In seconds
                    currentTimeElement.totalTimeSeconds = -1.0*idleTimeS + (currentTimeElement.endTime - currentTimeElement.startTime)/1000;
                    if (currentTimeElement.totalTimeSeconds < 0) {currentTimeElement.totalTimeSeconds = 0.0;}

                    totalBlockTime += currentTimeElement.totalTimeSeconds;
                }
                else {
                    //Do not stop the timer ourselves, only add up the time
                    totalBlockTime += -1.0*idleTimeS + ((new Date()).getTime() - currentTimeElement.startTime)/1000;

                }


            }
            else {

                totalBlockTime += currentTimeElement.totalTimeSeconds;
            }



        }

        return totalBlockTime;
    }

    function _getTimeBlockCount(timeBlockArray) {

        return timeBlockArray.length;
    }

    //End generic time block functions





    function startProductTimer(productId) {
        if (!_productTimeTable.hasOwnProperty(productId)) {

            _productTimeTable[productId] = [];

        }

        _startTimeBlockTimer(_productTimeTable[productId]);

    }

    function endProductTimer(productId, idleTimeS) {
        if (_productTimeTable.hasOwnProperty(productId)) {

            var actualIdleTime = idleTimeS;
            if(idleTimeS == null || idleTimeS == undefined) {
                actualIdleTime = 0;
            }


            return _endTimeBlockTimer(_productTimeTable[productId], actualIdleTime, true);

        }
        else {

            return 0;
        }

    }

    function peakProductTimer(productId, totalTime) {


        if (_productTimeTable.hasOwnProperty(productId)) {


            if(totalTime) {
                return _getTotalTimeBlockTime(_productTimeTable[productId], 0, false);

            }
            else {
                return _endTimeBlockTimer(_productTimeTable[productId], 0, false);

            }

        }
        else {

            return 0;
        }

    }


    function resetProductTimer(productId) {
        if (_productTimeTable.hasOwnProperty(productId)) {


            _productTimeTable[productId] = [];

        }

    }
    function resetAllProductTimers() {

        _productTimeTable = {};

    }


    function getTotalProductViewCount(productViewsArray) {
        var totalViewCount = 0;
        for(var i=0; i< productViewsArray.length; i++) {

            totalViewCount += productViewsArray[i].totalViews;

        }

        return totalViewCount;

    }

    function getTotalProductViewTimeS(productViewsArray) {

        var totalTimeS = 0;
        for(var i=0; i< productViewsArray.length; i++) {

            totalTimeS += productViewsArray[i].totalTimeS;

        }

        return totalTimeS;

    }


    function getProductViewsArray(endTimer) {

        var result = [];


        for(var productId in _productTimeTable) {

            var totalTimeSeconds = _getTotalTimeBlockTime(_productTimeTable[productId], 0, endTimer);
            var totalProductViews = _getTimeBlockCount(_productTimeTable[productId]);


            result.push({productId: productId, totalTimeS: totalTimeSeconds, totalViews: totalProductViews});
        }

        return result;

    }

    function reset() {
        resetAllPageTimers();
        resetAllEventCounters();
        resetAllProductTimers();
        resetMiscEventTimers();
        _sessionStartMS = 0;
        _pageHistoryArray = [];
        _currentPageId = "NONE";
    }

}
