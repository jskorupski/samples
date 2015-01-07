var _kinect = _makeKinectManager();



function _makeKinectManager() {

    var self = {
        init: init,
        getUserHeight: getUserHeight,
        getPrimaryUser: getPrimaryUser,
        getTrackedUserHeights: getTrackedUserHeights,
        getAllUserArray: getAllUserArray,
        getEngagedUserArray: getEngagedUserArray

    }

    //Kinect user variables
    var _engagedUserArray = [];
    var _allUserArray = [];
    var _primaryUser = null;
    var _engagerObject = null;


    var _kinectGetUserHeight = function(user){ return -1};
    var _kinectGetTrackedUserHeights = function() {return [];};

    var _FEET_PER_MM = 0.00328084;
    var _HEIGHT_ACCURACY_ADDER = 1.4;

    var _logManager = null;


    return self;

    // ******************
    // NO VARIABLE DECLARATIONS AFTER THIS LINE!!!! WILL NOT WORK!!!
    // no inline code execution either - only internal function definitions
    // ******************


    function init(logManager) {


        if(logManager) { _logManager = logManager; }
        zig.embed();

        zig.addEventListener('userfound', addUser);
        zig.addEventListener('userlost', lostUser);

        _engagerObject = zig.EngageUsersWithSkeleton(3);
        _engagerObject.addEventListener('userengaged', engageNewUser);
        _engagerObject.addEventListener('userdisengaged', disengageUser);
        zig.addListener(_engagerObject);


    }



    function getPrimaryUser() {

        return _primaryUser;
    }

    function findUser(id, userArray) {

        for (var i=0; i<userArray.length; i++) {

            if(id == userArray[i].id) {
                return userArray[i];
            }
        }

        return null;
    }

    function removeUser(id, userArray) {

        var foundIndex = -1;

        for (var i=0; i<userArray.length; i++) {

            if(id == userArray[i].id) {
                foundIndex = i;
                break;
            }
        }

        if(foundIndex > -1) {
            userArray.splice(foundIndex,1);
        }
        else {
            console.log("Could not find Kinect User id "+ id + " to remove.");
        }


    }


    function validDistanceFromScreen(posX, posY, posZ) {

        if(posZ != null) {
            return (posZ > 200) && (posZ < 3500);
        }
        else {
            return true;
        }

    }


    function addUser(user) {

        _allUserArray.push(user);
        //console.log('Total tracked users: ' + _allUserArray.length);

        //Metrics
        user.userTrackStartTimeMS = (new Date()).getTime();
        //if(_logManager) { _logManager.logNewUserData(user); }




    }

    function lostUser(user) {

        removeUser(user.id, _allUserArray);


        //Metrics
        user.userTrackEndTimeMS = (new Date()).getTime();
        user.userTrackTotalTimeSeconds = (user.userTrackEndTimeMS - user.userTrackStartTimeMS)/1000;
        if(_logManager) { _logManager.logLostUserData(user); }

        //console.log('Total time (s) for lost user: ' + user.truTotalTimeSeconds + ', Total tracked users: ' + _allUserArray.length);

    }


    function engageNewUser(user) {
        // console.log('User engaged: ' + user.id);

        _engagedUserArray.push(user);

        //Metrics
        user.skeletonTrackStartTimeMS = (new Date()).getTime();
        //if(_logManager) { _logManager.logNewTrackedUserData(user); }


        //console.log('Total skeletons: ' + _engagedUserArray.length);

        var headJoint = user.skeleton[zig.Joint.Head];

        var posX = (headJoint && headJoint.position) ? headJoint.position[0] : null;
        var posY = (headJoint && headJoint.position) ? headJoint.position[1] : null;
        var posZ = (headJoint && headJoint.position) ? headJoint.position[2] : null;

        if(validDistanceFromScreen(posX, posY, posZ)) {

            //Only change active user is previous is gone
            if(_primaryUser == null ) {
                _primaryUser = user;
            }
        }

        user.addEventListener('userupdate', userUpdate);



    }

    function userUpdate(user) {

        if(!user.skeletonTracked) {return;}

        if( user.skeleton != null && user.skeleton[zig.Joint.Head] != undefined && user.skeleton[zig.Joint.Head] != null) {
            var headJoint = user.skeleton[zig.Joint.Head];

            var posX = (headJoint && headJoint.position) ? headJoint.position[0] : null;
            var posY = (headJoint && headJoint.position) ? headJoint.position[1] : null;
            var posZ = (headJoint && headJoint.position) ? headJoint.position[2] : null;

            if(_primaryUser == null && validDistanceFromScreen( posX,  posY,  posZ)) {
                //_engagedUserArray.push(user);
                _primaryUser = user;
            }
            else if (_primaryUser == user && !validDistanceFromScreen( posX,  posY,  posZ)) {
                _primaryUser = null;
            }
        }


        //console.log('Head position: ' + user.skeleton[zig.Joint.Head].position);
        // console.log("Body position: " + user.position);

    }

    function disengageUser(user) {


        //console.log('User disengaged: ' + user.id);

        removeUser(user.id, _engagedUserArray);

        //Metrics
        user.skeletonTrackEndTimeMS = (new Date()).getTime();
        user.skeletonTrackTotalTimeSeconds = (user.skeletonTrackEndTimeMS - user.skeletonTrackStartTimeMS)/1000;
        if(_logManager) { _logManager.logLostTrackedUserData(user);}

        //console.log('Total time (s) for lost skeleton: ' + user.truSkeletonTotalTimeSeconds + ', Total tracked skeletons: ' + _engagedUserArray.length);


        if(user == _primaryUser) {
            //If we lost our primary user

            if(_engagedUserArray.length > 0) {
                //Get next person in array
                _primaryUser = _engagedUserArray[0];
            }
            else {
                //Clear engaged user variable
                _primaryUser = null;
            }

        }

    }

    //Height tracking code, based on: http://www.codeproject.com/Articles/380152/Kinect-for-Windows-Find-user-height-accurately

    function jointLength(p1, p2) {

        if(p1 && p1.position && p2 && p2.position) {
            return Math.sqrt(
                    Math.pow(p1.position[0] - p2.position[0], 2) +
                    Math.pow(p1.position[1] - p2.position[1], 2) +
                    Math.pow(p1.position[2] - p2.position[2], 2));
        }
        else {
            return 0;
        }


    }

    function multiJointLength(joints) {
        var length = 0;

        for (var index = 0; index < joints.length - 1; index++) {
            length += jointLength(joints[index], joints[index + 1]);
        }


        return length;
    }

//    function kinectNumberOfTrackedJoints(joints) {
//        var trackedJoints = 0;
//
//        for (var index = 0; index < joints.length; index++) {
//            if (joint.TrackingState == JointTrackingState.Tracked) {
//                trackedJoints++;
//            }
//        }
//
//
//        return trackedJoints;
//    }

  

    function getUserHeight(user) {


        if(user == undefined || user == null) {return -1;}


        //var USER_Z_NORMALIZED = (user.position[2] - 1600)/1000;
        //var _HEIGHT_OFFSET_FACTOR = _HEIGHT_ACCURACY_ADDER - (USER_Z_NORMALIZED);

//
//        console.log("USER_Z:" + user.position[2]);
//        console.log("USER_Z_NORMALIZED:" + USER_Z_NORMALIZED);
//        console.log("_HEIGHT_OFFSET_FACTOR:" + _HEIGHT_OFFSET_FACTOR);



        var HEAD_DIVERGENCE = 0.1;

        var head = user.skeleton[zig.Joint.Head];
        var neck = user.skeleton[zig.Joint.Neck];
        var spine = user.skeleton[zig.Joint.Torso];
        var waist = user.skeleton[zig.Joint.Waist];
        var hipLeft = user.skeleton[zig.Joint.LeftHip];
        var hipRight = user.skeleton[zig.Joint.RightHip];
        var kneeLeft = user.skeleton[zig.Joint.LeftKnee];
        var kneeRight = user.skeleton[zig.Joint.RightKnee];
        var ankleLeft = user.skeleton[zig.Joint.LeftAnkle];
        var ankleRight = user.skeleton[zig.Joint.RightAnkle];
        var footLeft = user.skeleton[zig.Joint.LeftFoot];
        var footRight =  user.skeleton[zig.Joint.RightFoot];


        var skeletonTopHalf = [head, neck, spine, waist];
        //var skeletonTopTest = [head, neck, waist];
        var skeletonBottomHalfLeft = [hipLeft, kneeLeft, ankleLeft, footLeft];
        //var skeletonBottomHalfRight = [hipRight, kneeRight, ankleRight, footRight];

        //Find which leg is tracked more accurately.
        //var legLeftTrackedJoints = kinectNumberOfTrackedJoints([hipLeft, kneeLeft, ankleLeft, footLeft]);
        //var legRightTrackedJoints = kinectNumberOfTrackedJoints([hipRight, kneeRight, ankleRight, footRight]);


        var leftLegLength = multiJointLength(skeletonBottomHalfLeft);

        var totalHeight =  (_FEET_PER_MM * (multiJointLength(skeletonTopHalf) + leftLegLength + HEAD_DIVERGENCE));

        //console.log("Left Leg length: " + leftLegLength);
        //console.log("Top Half length: " + (_FEET_PER_MM* multiJointLength(skeletonTopHalf)));
        //console.log("Top Half test length: " + (_FEET_PER_MM*multiJointLength(skeletonTopTest)));
        //console.log("User height: " +totalHeight);

        return totalHeight;
    }



    function getTrackedUserHeights() {

        var result = [];

        for (var i=0; i<_engagedUserArray.length; i++) {

            result.push(getUserHeight(_engagedUserArray[i]));
        }

        return result;
    }

    function getAllUserArray() {

        return _allUserArray;
    }

    function getEngagedUserArray() {

        return _engagedUserArray;
    }


}


