/**
 * Created by jskorupski@ebay.com
 */

Globe3DArcs = function(sceneGL, globeObjectGroup, globeCenter, globeRadius, propertyAnimator) {



    this.arcObjectGroup = new THREE.Object3D();
    this.globeGroup = globeObjectGroup;
    this.globeGroup.renderDepth = 1;
    this.arcObjectGroup.renderDepth = 100000;
    this.globeGroup.add(this.arcObjectGroup);
    this.ARCCOUNT = 500;
    this.activeArcs = [];
    this.inactiveArcs = [];
    this.globeCenter = globeCenter;
    this.sceneGL = sceneGL;
    this.globeRadius = globeRadius;
    this.propertyAnimator = propertyAnimator;



    for(var i=0; i < this.ARCCOUNT; i++) {
        this.inactiveArcs.push(new Arc('arc' + i));
    }


    this.getArcGroup = function() { return this.arcObjectGroup; };


    function Arc(arcId) {


        this.id = arcId;
        this.positions = [];
        this.rotations = [];

        this.startPos = null;
        this.endPos = null;

        this.pathControlPoints = {x:[], y:[], z:[]};

        this.arcColor               =  new THREE.Color(0xD3D3D3);
        this.arcHalfWidth				= 1.5;
        this.arcLength				= 50;
        this.geom				= new THREE.PlaneGeometry(0.001, 0.001, 1, this.arcLength-1);
        this.geomBack		    = new THREE.PlaneGeometry(0.001, 0.001, 1, this.arcLength-1);
        //this.color = Math.random()*0xFFFFFF;
        this.material			= new THREE.MeshLambertMaterial( { color:  this.arcColor, ambient: this.arcColor/*, alphaTest: false*/} );
        this.material.side = THREE.FrontSide;
        this.mesh               = new THREE.Mesh(this.geom, this.material);
        this.meshBack		    = new THREE.Mesh(this.geomBack, this.material);
        this.mesh.dynamic		= true;
        this.meshArray = [this.mesh, this.meshBack];
        this.arcOrthgonalVector = new THREE.Vector3();
        this.distanceBetweenTargets = 0;

        this.getTHREEObjects = function () { return this.meshArray; };

        this.init = function (fromVec3, toVec3, arcHeight, arcColor, arcWidth, globeCenterVec3, globeRadius) {

            this.arcHalfWidth = (arcWidth/2.0);
            this.arcColor.set(arcColor);
            this.mesh.material.ambient.set(arcColor);
            this.mesh.material.color.set(arcColor);
            this.mesh.material.needsUpdate = true;

            this.meshBack.material.ambient.set(arcColor);
            this.meshBack.material.color.set(arcColor);
            this.meshBack.material.needsUpdate = true;

            this.clearKeyFrames();
            this.resetPositionsAndLocations(fromVec3);

            this.startPos = fromVec3;
            this.endPos = toVec3;

            this.generateArcKeyFrames(fromVec3, toVec3, globeCenterVec3, globeRadius, arcHeight);



        };

        this.clearKeyFrames = function() {

            for (var locArrayName in this.pathControlPoints) {
                var targetArray = this.pathControlPoints[locArrayName];
                while (targetArray.length > 0) {
                    targetArray.pop();
                }
            }


        };

        this.resetPositionsAndLocations = function(fromVec3) {


            if(this.positions.length == 0 && this.rotations.length == 0) {
                //First time initialization
                for (var i=0; i<this.arcLength; i++) {
                    //this.positions.push(fromVec3.clone());


                    this.positions.push(new THREE.Vector3(0, 0, 0));

                    this.rotations.push(new THREE.Vector3(0, 0, 0));

                    //Reset Geometry vertex locations
                    var v1 = this.geom.vertices[i*2];
                    var v2 = this.geom.vertices[i*2+1];

                    var v1back = this.geomBack.vertices[i*2];
                    var v2back = this.geomBack.vertices[i*2+1];

                    v1.x = v1.y = v1.z = v1back.x = v1back.y = v1back.z = 0.0;
                    v2.x = v2.y = v2.z = v2back.x = v2back.y = v2back.z = 0.0;

                }


            }
            else {
                for (var i=0; i<this.arcLength; i++) {
                    this.positions[i].x = fromVec3.x;
                    this.positions[i].y = fromVec3.y;
                    this.positions[i].z = fromVec3.z;
//                    this.positions[i].x = 0;
//                    this.positions[i].y = 0;
//                    this.positions[i].z = 0;

                    this.rotations[i].x = this.rotations[i].y = this.rotations[i].z = 0.0;

                    //Reset Geometry vertex locations
                    var v1 = this.geom.vertices[i*2];
                    var v2 = this.geom.vertices[i*2+1];

                    var v1back = this.geomBack.vertices[i*2];
                    var v2back = this.geomBack.vertices[i*2+1];

                    v1.x = v2.x = v1back.x = v2back.x = fromVec3.x;
                    v1.y = v2.y = v1back.y = v2back.y = fromVec3.y;
                    v1.z = v2.z = v1back.z = v2back.z = fromVec3.z;

//                    v1.x = v1.y = v1.z = 0.0;
//                    v2.x = v2.y = v2.z = 0.0;

                }
            }

        };

        function getMidPoint(aVec3, bVec3) {

            return new THREE.Vector3((aVec3.x + bVec3.x)/2.0, (aVec3.y + bVec3.y)/2.0, (aVec3.z + bVec3.z)/2.0);
        }

        this.generateArcKeyFrames = function(fromVec3, toVec3, globeCenterVec3, globeRadius, arcHeight) {


            var fromToVec = (new THREE.Vector3()).subVectors(toVec3, fromVec3);
            var distanceApart = fromToVec.length();
            fromToVec = fromToVec.normalize();

            var distanceToDiameterRatio = distanceApart/(globeRadius*2.0);

            var actualArcHeight = arcHeight * Math.max(0.3, distanceToDiameterRatio);

            var midPoint = getMidPoint(fromVec3, toVec3);
            var firstQuarterPoint = getMidPoint(fromVec3, midPoint);
            var thirdQuarterPoint = getMidPoint(midPoint, toVec3);

            var firstEighthPoint = getMidPoint(fromVec3, firstQuarterPoint); 
            var thirdEighthPoint = getMidPoint(firstQuarterPoint, midPoint); 
            var fifthEighthPoint = getMidPoint(midPoint, thirdQuarterPoint); 
            var seventhEighthPoint = getMidPoint(thirdQuarterPoint, toVec3); 

            var centerToMidVec = (new THREE.Vector3()).subVectors(midPoint, globeCenterVec3).normalize();
            var centerToFirstQuarterVec = (new THREE.Vector3()).subVectors(firstQuarterPoint, globeCenterVec3).normalize();
            var centerToThirdQuarterVec = (new THREE.Vector3()).subVectors(thirdQuarterPoint, globeCenterVec3).normalize();

            var centerToFirstEighth = (new THREE.Vector3()).subVectors(firstEighthPoint, globeCenterVec3).normalize();
            var centerToThirdEighth = (new THREE.Vector3()).subVectors(thirdEighthPoint, globeCenterVec3).normalize();
            var centerToFifthEighth = (new THREE.Vector3()).subVectors(fifthEighthPoint, globeCenterVec3).normalize();
            var centerToSeventhEighth = (new THREE.Vector3()).subVectors(seventhEighthPoint, globeCenterVec3).normalize();


            //Randomly offset our arc up to Math.PI/16.0 (11.25 degrees) in each direction around the axis between the target and source location
            var randomRotationOffsetAngle = (Math.random()*(Math.PI/8.0)) - (Math.PI/16.0);
            centerToFirstEighth.applyAxisAngle(fromToVec, randomRotationOffsetAngle*0.4);
            centerToFirstQuarterVec.applyAxisAngle(fromToVec, randomRotationOffsetAngle*0.75);
            centerToThirdEighth.applyAxisAngle(fromToVec, randomRotationOffsetAngle*0.95);
            centerToMidVec.applyAxisAngle(fromToVec, randomRotationOffsetAngle);
            centerToFifthEighth.applyAxisAngle(fromToVec, randomRotationOffsetAngle*0.95);
            centerToThirdQuarterVec.applyAxisAngle(fromToVec, randomRotationOffsetAngle*0.75);
            centerToSeventhEighth.applyAxisAngle(fromToVec, randomRotationOffsetAngle*0.4);

            //Now Calculate the vector that is orthogonal to the arc upvector (centerToMidVec) and the vector from source to target
            var orthogonalToPath = (new THREE.Vector3()).crossVectors(centerToMidVec, fromToVec);
            this.arcOrthgonalVector.set(orthogonalToPath.x, orthogonalToPath.y, orthogonalToPath.z);


            var arcFirstEighthPoint = (new THREE.Vector3()).addVectors(globeCenterVec3, centerToFirstEighth).multiplyScalar(globeRadius + (actualArcHeight * 0.4));
            var arcFirstQuarterPoint = (new THREE.Vector3()).addVectors(globeCenterVec3, centerToFirstQuarterVec).multiplyScalar(globeRadius + (actualArcHeight * 0.75));
            var arcThirdEighthPoint = (new THREE.Vector3()).addVectors(globeCenterVec3, centerToThirdEighth).multiplyScalar(globeRadius + (actualArcHeight * 0.95));
     
            var arcMidPoint = (new THREE.Vector3()).addVectors(globeCenterVec3, centerToMidVec).multiplyScalar(globeRadius + actualArcHeight);
            var arcFifthEighthPoint = (new THREE.Vector3()).addVectors(globeCenterVec3, centerToFifthEighth).multiplyScalar(globeRadius + (actualArcHeight * 0.95));

            var arcThirdQuarterPoint = (new THREE.Vector3()).addVectors(globeCenterVec3, centerToThirdQuarterVec).multiplyScalar(globeRadius + (actualArcHeight * 0.75));
        
            var arcSeventhEighthPoint = (new THREE.Vector3()).addVectors(globeCenterVec3, centerToSeventhEighth).multiplyScalar(globeRadius + (actualArcHeight * 0.4));



            //Load points into our keyframe arrays
            this.pathControlPoints.x.push(fromVec3.x);
            this.pathControlPoints.x.push(arcFirstEighthPoint.x);
            this.pathControlPoints.x.push(arcFirstQuarterPoint.x);
            this.pathControlPoints.x.push(arcThirdEighthPoint.x);
            this.pathControlPoints.x.push(arcMidPoint.x);
            this.pathControlPoints.x.push(arcFifthEighthPoint.x);
            this.pathControlPoints.x.push(arcThirdQuarterPoint.x);
            this.pathControlPoints.x.push(arcSeventhEighthPoint.x);
            this.pathControlPoints.x.push(toVec3.x);

            this.pathControlPoints.y.push(fromVec3.y);
            this.pathControlPoints.y.push(arcFirstEighthPoint.y);
            this.pathControlPoints.y.push(arcFirstQuarterPoint.y);
            this.pathControlPoints.y.push(arcThirdEighthPoint.y);
            this.pathControlPoints.y.push(arcMidPoint.y);
            this.pathControlPoints.y.push(arcFifthEighthPoint.y);
            this.pathControlPoints.y.push(arcThirdQuarterPoint.y);
            this.pathControlPoints.y.push(arcSeventhEighthPoint.y);
            this.pathControlPoints.y.push(toVec3.y);

            this.pathControlPoints.z.push(fromVec3.z);
            this.pathControlPoints.z.push(arcFirstEighthPoint.z);
            this.pathControlPoints.z.push(arcFirstQuarterPoint.z);
            this.pathControlPoints.z.push(arcThirdEighthPoint.z);
            this.pathControlPoints.z.push(arcMidPoint.z);
            this.pathControlPoints.z.push(arcFifthEighthPoint.z);
            this.pathControlPoints.z.push(arcThirdQuarterPoint.z);
            this.pathControlPoints.z.push(arcSeventhEighthPoint.z);
            this.pathControlPoints.z.push(toVec3.z);
        };



        //timePosition - number from 0.0 to 1.0 (start to finish)
        this.updatePositions = function(timePosition) {

            for(var posIndex = this.arcLength - 1; posIndex >= 0; posIndex--) {

                var currentSegmentPos = this.positions[posIndex];

                var distFromFront = (this.arcLength - 1) - posIndex; //integer

                var segmentTimePosition = Math.min(1.0, 2.0*Math.max(0.0, timePosition - 0.5*(distFromFront * (1.0/this.arcLength))));

                if(segmentTimePosition > 0.00001) {

                    currentSegmentPos.x =  TWEEN.Interpolation.CatmullRom(this.pathControlPoints.x, segmentTimePosition);
                    currentSegmentPos.y =  TWEEN.Interpolation.CatmullRom(this.pathControlPoints.y, segmentTimePosition);
                    currentSegmentPos.z =  TWEEN.Interpolation.CatmullRom(this.pathControlPoints.z, segmentTimePosition);

                }
                else {

                    currentSegmentPos.x = this.startPos.x;
                    currentSegmentPos.y = this.startPos.y;
                    currentSegmentPos.z = this.startPos.z;

                }

            }


        };

        //timePosition - number from 0.0 to 1.0 (start to finish)
        this.updateRotations = function(timePosition) {




            for(var rotIndex = 0; rotIndex < this.arcLength; rotIndex++) {

                var currentRotation = this.rotations[rotIndex];
                var fractionalPositionInArc = (rotIndex/this.arcLength);

                var directionAxis = null;
                if(rotIndex == 0) {
                    //First point direction is determined by vector of firstPoint -> secondPoint
                    directionAxis = (new THREE.Vector3()).subVectors(this.positions[rotIndex + 1], this.positions[rotIndex]).normalize();
                }
                else {
                    //All other directions are determined by vector of lastPoint -> currentPoint
                    directionAxis = (new THREE.Vector3()).subVectors(this.positions[rotIndex], this.positions[rotIndex - 1]).normalize();
                }

                //Calculate vector that is orthogonal to the direction the arc is traveling and the vector from the center of the globe to the midpoint
                var orthogonalRotVector = (new THREE.Vector3()).crossVectors(directionAxis, this.arcOrthgonalVector);

                var widthCurve = Math.max(0.10, Math.sin(fractionalPositionInArc*Math.PI));

                orthogonalRotVector.applyAxisAngle(directionAxis, (Math.PI/2.0) + (timePosition+fractionalPositionInArc)*Math.PI);
                orthogonalRotVector.multiplyScalar(this.arcHalfWidth*widthCurve);

                currentRotation.set(orthogonalRotVector.x, orthogonalRotVector.y, orthogonalRotVector.z);


            }
        };



        this.update = function(timePosition)
        {

            this.updatePositions(timePosition);
            this.updateRotations(timePosition);

            for (var i=0; i<this.arcLength; i++)
            {

                //frontside
                var v1				= this.geom.vertices[i*2];
                var v2				= this.geom.vertices[i*2+1];

                v1.x		= this.positions[i].x + (this.rotations[i].x);
                v1.y		= this.positions[i].y + (this.rotations[i].y);
                v1.z		= this.positions[i].z + (this.rotations[i].z);
                v2.x		= this.positions[i].x - (this.rotations[i].x);
                v2.y		= this.positions[i].y - (this.rotations[i].y);
                v2.z		= this.positions[i].z - (this.rotations[i].z);


                //backside, vertex locations v1 and v2 are swapped

                var v1back				= this.geomBack.vertices[i*2];
                var v2back				= this.geomBack.vertices[i*2+1];

                v1back.x		= this.positions[i].x - (this.rotations[i].x);
                v1back.y		= this.positions[i].y - (this.rotations[i].y);
                v1back.z		= this.positions[i].z - (this.rotations[i].z);
                v2back.x		= this.positions[i].x + (this.rotations[i].x);
                v2back.y		= this.positions[i].y + (this.rotations[i].y);
                v2back.z		= this.positions[i].z + (this.rotations[i].z);
            }


            this.geom.verticesNeedUpdate = true;
            this.geom.normalsNeedUpdate = true;

            this.geomBack.verticesNeedUpdate = true;
            this.geomBack.normalsNeedUpdate = true;

        };

        return this;
    }

    this.launchArc = function(fromVec3, toVec3, color, width, startDelay, timeMS) {


        var _this = this;
        if(this.inactiveArcs.length > 0) {

            var newArc = this.inactiveArcs.pop();

            newArc.init(fromVec3, toVec3, 50, color, width, this.globeCenter, this.globeRadius);

            var meshes = newArc.getTHREEObjects();
            this.arcObjectGroup.add(meshes[0]);
            this.arcObjectGroup.add(meshes[1]);

            var updateArc = function() {

                var _interpolatedObj = this;

                newArc.update(_interpolatedObj.t);

            };

            var arcComplete = function() {

                var meshes = newArc.getTHREEObjects();
                _this.arcObjectGroup.remove(meshes[0]);
                _this.arcObjectGroup.remove(meshes[1]);
                _this.inactiveArcs.push(newArc);
            };

            this.propertyAnimator.startAnimation(newArc.id, 'position',
                {//From
                    t:0.0
                },
                {//To
                    t:1.0
                }, updateArc, arcComplete, timeMS, startDelay, TWEEN.Easing.Linear.None, false, true);

        }
        else {
            //console.log("Out of arcs to launch, ignoring ...");
        }


    };


    return this;
};


