/**
 * Created by jskorupski@ebay.com
 */

Globe3DMarkers = function(camera, sceneGL, globeObjectGroup, octree, renderWidth, renderHeight, superSamplingFactor, domId) {




    this.camera = camera;
    this.pixelsPerWebGLUnit = 4; //How many pixels per WebGL unit
    this.renderScale = this.pixelsPerWebGLUnit*superSamplingFactor;

    this.markers = [];

    this.octree = octree;
    this.globeGroupGL = globeObjectGroup;

    this.markerGroupGL = new THREE.Object3D();
    this.globeGroupGL.add(this.markerGroupGL);



    this.markerGroupCSS3D = new THREE.Object3D();




    this.sceneCSS = new THREE.Scene();
    this.sceneCSS.add(this.markerGroupCSS3D);
    this.markerGroupGL.position = this.markerGroupCSS3D.position;



    this.sceneGL = sceneGL;

    this.rendererCSS = new THREE.CSS3DRendererCustom(document.getElementById(domId));


    this.rendererCSS.setSize( renderWidth, renderHeight );


    function _latLongToVector3(lat, lon, radius) {


        var phi = (90 - lat) * Math.PI / 180;
        var theta = (180 - lon) * Math.PI / 180;


        var x = radius * Math.sin(phi) * Math.cos(theta);
        var y = radius * Math.cos(phi);
        var z = radius * Math.sin(phi) * Math.sin(theta);

        return new THREE.Vector3(x, y, z);

    }



    this.activeMarkers = function() {

        return this.markers.length;
    }


    this.addMarker = function(id, lat, lon, distance, glWidth, glHeight) {
        //Setup CSS3D markers


        var markerPosition = _latLongToVector3(lat, lon, distance);

        var lookAtPosition = markerPosition.clone().multiplyScalar(2.0);



        if(this.markers[id]) {

            console.log("Warning: Attempted to Add Repeated Marker with ID: " + id);
            return;
        }



        //Material with no blending - shows through to underlying DOM elements
        var material   = new THREE.MeshBasicMaterial();
        material.color.set('black');
        material.opacity   = 0;
        material.blending  = THREE.NoBlending;
        material.side = THREE.FrontSide; //THREE.DoubleSide;

        //WebGL Object
        var objectSize = 50;
        // create the plane mesh
     
        var geometry = new THREE.CircleGeometry((glWidth + glHeight)/4.0, 20);
        var markerObjectGL= new THREE.Mesh( geometry, material );
        markerObjectGL.position.x = markerPosition.x;
        markerObjectGL.position.y = markerPosition.y;
        markerObjectGL.position.z = markerPosition.z;

        markerObjectGL.lookAt(lookAtPosition);
        markerObjectGL.name = id;
        markerObjectGL.userData = {visible: true, markerId:id};
        // add it to the WebGL scene
        this.markerGroupGL.add(markerObjectGL);
        this.octree.add(markerObjectGL);


        //CSS object, with synchronized position and rotation
        var markerObjectCSSDiv = document.createElement( 'div' );
        markerObjectCSSDiv.setAttribute('id', id);
        markerObjectCSSDiv.style.width =  (this.renderScale*glWidth) + "px";
        markerObjectCSSDiv.style.height = (this.renderScale*glHeight) + "px";

        markerObjectCSSDiv.style.backgroundColor = "white";



        // Fill in with temp image
        var markerContent = document.createElement('img');
        //markerContent.innerHTML = '<span>' + id + '</span>';
        markerContent.src = 'assets/image/epic_logo.png';
        markerContent.style.width =  (this.renderScale*glWidth) + "px";
        markerContent.style.height = (this.renderScale*glHeight) + "px";
        markerObjectCSSDiv.appendChild(markerContent);


        // create the object3d for this element
        var markerObjectCSS3DWrapper = new THREE.CSS3DObject( markerObjectCSSDiv );
        markerObjectCSS3DWrapper.userData = {visible:true, markerId: id};
        // we reference the same position and rotation - the GL object is always the position reference
        markerObjectCSS3DWrapper.position = markerObjectGL.position;

        markerObjectCSS3DWrapper.lookAt(lookAtPosition);
        markerObjectCSS3DWrapper.name = id;
        //Scale the CSS to match the rendering scale of the Three.js scene
        markerObjectCSS3DWrapper.scale.multiplyScalar(1/this.renderScale);
        // add it to the css scene


        this.markerGroupGL.add(markerObjectGL);

        this.markerGroupCSS3D.add(markerObjectCSS3DWrapper);


        this.markers[id] = {
            visible: true,
            id: id,
            glObject: markerObjectGL,
            domNode: markerObjectCSSDiv,
            css3DObject: markerObjectCSS3DWrapper
        };

        this.hideMarker(id);



    };

    this.setPosition = function(markerId, x, y, z) {


    };


    this.hideMarkers = function(markerIdArray) {

        for(var i=0; i<markerIdArray.length; i++) {
            this.hideMarker(markerIdArray[i]);
        }
    };


    this.hideMarker = function(markerId) {

        var marker = this.markers[markerId];

        if(marker && marker.visible) {


            marker.glObject.scale.set(0.001, 0.001, 0.001);
            marker.domNode.style.display = 'none';
            marker.css3DObject.userData.visible = false;
            marker.glObject.userData.visible = false;

            marker.visible = false;


        }
        else if (!marker) {
            console.log("Warning: Attempted to Hide Missing Marker with ID: " + markerId);
        }


    };

    this.showMarkers = function(markerIdArray) {

        for(var i=0; i<markerIdArray.length; i++) {
            this.showMarker(markerIdArray[i]);
        }
    };

    this.showMarker = function(markerId) {

        var marker = this.markers[markerId];

        if(marker && !marker.visible) {

            marker.glObject.scale.set(1, 1, 1);

            marker.domNode.style.display = 'inline';
            marker.css3DObject.userData.visible = true;
            marker.glObject.userData.visible = true;

            marker.visible = true;



        }
        else if (!marker){
            console.log("Warning: Attempted to Show Missing Marker with ID: " + markerId);
        }
    };

    this.render = function(globalCamera) {

        if(this.activeMarkers() == 0) {
            return;
        }


        this.rendererCSS.render(this.sceneCSS, globalCamera);
    };

    this.interact = function(webglObject, interactionType) {

        console.log("Tapped Marker ID: " + webglObject.userData.markerId);

    };

    this.resizeRenderer = function(width, height) {

        this.rendererCSS.setSize( width, height );

    };

    this.findNearCamera = function(cameraPosWorld, maxRadius) {

        var results = {};

        for(var markerId in this.markers) {

            var markerGlObject = this.markers[markerId].glObject;
            var markerPosLocal = markerGlObject.position.clone();
            var markerPositionWorld = markerGlObject.localToWorld( markerPosLocal );



            var distanceToCamera = markerPositionWorld.distanceTo(cameraPosWorld);

            if(distanceToCamera <= maxRadius) {
                results[markerId] = true;
            }
        }

        return results;

    };

    this.update = function() {
        if(this.activeMarkers() == 0) {
            return;
        }


        this.markerGroupCSS3D.rotation.x = this.globeGroupGL.rotation.x;
        this.markerGroupCSS3D.rotation.y = this.globeGroupGL.rotation.y;
        this.markerGroupCSS3D.rotation.z = this.globeGroupGL.rotation.z;


        var camPosLocal = camera.position.clone();
        var cameraPositionWorld = camera.localToWorld(camPosLocal);


        var globeGroupPosLocal = this.globeGroupGL.position.clone();
        var globeGroupPositionWorld = this.globeGroupGL.localToWorld(globeGroupPosLocal);
        var distanceToCamera = cameraPositionWorld.distanceTo(globeGroupPositionWorld);




        var enableMarkers = this.findNearCamera(cameraPositionWorld, distanceToCamera*0.75);

        this.showMarkers(Object.keys(enableMarkers));

        //Find markers to disable that were not included in enable set above
        var disableMarkerArray = [];
        for(var markerId in this.markers) {

            //If not set to be visible and already visible, then we should hide
            if(!enableMarkers[markerId] && this.markers[markerId].visible) {
                disableMarkerArray.push(markerId);
            }
        }

        this.hideMarkers(disableMarkerArray);




    };



    return this;
};
