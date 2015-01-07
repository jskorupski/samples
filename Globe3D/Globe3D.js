/* Interactive 3D Globe with extruded geographic shapes
 * @author James Skorupski (jskorupski@ebay.com)
 *
 * RenderDomNode - DOM Node to render Three.js/WebGL to
 * json
 *
 * opts:
 *   cameraDistance - number - view distance from globe
 *   globeRadius - number - radius of globe
 *   globeOpacity - number - transparency of globe 0 (transparent) to 1 (opaque)
 *   countryDepthBase - number - depth of country when not selected
 *   countryDepthSelected - number - depth of country when selected
 *   colorGlobe - string - CSS color value string of globe
 *   colorBackground - string - CSS color value string of background
 *   colorCountry - string -CSS color value string of country
 *   colorCountrySelected - string - CSS color value string of selected country
 *   colorCountryDisabled - string - CSS color value string of disabled country
 */
Globe3D = function(opts, RenderDomNode, countryBordersGeoJSON, countryCentersGeoJSON, initCallbackFunc) {

    /* Country codes from GO Trends data that we don't have GeoJSON outlines for:
         HK
         KO
         OTHER EA
         OTHER EAPAC
         OTHER EEMEA
         SG
         UK
         USA
     */
    this.eBayCCToISO2 = {"HK": "CN", "KO": "KR", "UK": "GB", "USA": "US", "SG": "MY"};
    this.iso2ToEBayCC = {"KR": "KO", "GB": "UK"};

    if(!jQuery) { console.error("ERROR: Globe3D requires jQuery, version 1.8.3 or higher"); return this;}
    if(!THREE) { console.error("ERROR: Globe3D requires Three.js, revision 66 or higher"); return this;}
    if(!d3) { console.error("ERROR: Globe3D requires d3 svg graphing library, version 3"); return this;}
    if(!RenderDomNode || !countryBordersGeoJSON || !countryCentersGeoJSON) {
        console.error("ERROR: Globe3D requires a DOM node to render to, and path to GeoJSON files for country" +
            " borders and country centers!");
        return this;
    }

    this.countryBordersDataPath = countryBordersGeoJSON;
    this.countryCentersDataPath = countryCentersGeoJSON;
    this.countryBordersData = null;
    this.countryCentersData = null;


    this.domNode$ = $(RenderDomNode);

    /* Geographic and map data */
    this.geoConfig = {};

    /* 2D Map projection configuration */
    this.projectionWidth = 1000;
    this.projectionHeight = 10000;




    /* Rendering components */
    this.octree = {};
    this.renderer = {};
    //this.rendererCSS = {};
    this.composer = null;
    this.camera = {};
    this.cameraControls = null;

    /* Postprocessing components */
    this.postProcessingConfig = {

        depthMaterial: null,
        depthTarget:null,
        effectFXAA: null,
        effectSSAO: null,
        effectBokeh: null,
        superSamplingMultiplier: 2
    };

    //Width and height of render viewport
    this.WIDTH       = $(this.domNode$).width();
    this.HEIGHT      = $(this.domNode$).height();


    /* Camera configuration */
    this.VIEW_ANGLE  = 45;
    this.NEAR        = 0.1;
    this.FAR         = 2000;

    var camDistValue = 220;
    if(opts.cameraDistance) {
        camDistValue = parseFloat(opts.cameraDistance);
        if(isNaN(camDistValue)) {
            console.log("Error: requested camerDistance value " + opts.cameraDistance + " is not a number");
            camDistValue = 220;
        }
    }

    this.cameraPos = (new THREE.Vector3(0, 100, -220)).setLength(THREE.Math.clampBottom(camDistValue, 1));
    this.cameraLookAt = new THREE.Vector3(0, 0, 0);

    /* Interaction Components */
    this.projector = {};
    this.raycaster = new THREE.Raycaster();
    this.INTERSECTED = null;

    /* Last stored Mouse/touch interaction point */
    this.mouse = { x: 0, y: 0 };
    this.interactionConfig = {
        countrySelection : true,
        markerSelection: true
    };

    /* Animation components */
    this.transitionTimeMS = 400;
    this.rotateGlobeFlag = true;

    this.animateCamera = false;
    this.globeMovement = {
        yAxisVelocity: 0,
        xAxisVelocity: 0,
        maxXRot:45,
        dampening: 0.4,
        defaultYRot: 0.0003
    };

    /* Generic Tween.js animation manager */
    this.propertyAnimator = new GlobePropertyAnimator();
    this.lastTimeStamp = new Date().getTime();


    /* Scene geometry and materials */
    this.worldMeshes = [];
    this.scene = new THREE.Scene();
    this.clouds = null;
    this.countryGroup = null;
    this.skyBox = null;
    this.earthSphere = null;
    this.globeGroup = new THREE.Object3D();
    this.globeMarkers = {};
    this.globeArcs = {};


    /* Geometry and country state storage */
    this.countryTable = {};
    this.verticesSortedByLatLon = [];
    this.currentlySelectedCountries = {};
    this.currentlyEnabledCountries = {};



    //Setup changeable configuration options:

    /********************* Globe Options *********************/
    this.globeRadius = 70;//35;
    if(opts.globeRadius) {
        var globeRadiusValue = parseFloat(opts.globeRadius);
        if (isNaN(globeRadiusValue)) {
            console.log("Error: requested globeRadius value " + opts.globeRadius + " is not a number");
        }
        else {
            this.globeRadius = THREE.Math.clampBottom(globeRadiusValue, 1);
        }
    }

    this.colorGlobe = new THREE.Color().setRGB(0.94,0.94,0.94);
    if(opts.colorGlobe) {
        this.colorGlobe = new THREE.Color(opts.colorGlobe);
    }

    this.globeOpacity = 0.85;
    if(opts.globeOpacity) {

        var globeOpacityValue = parseFloat(opts.globeOpacity);
        if(isNaN(globeOpacityValue)) {
            console.log("Error: requested globeOpacity value " + opts.globeOpacity + " is not a number");
        }
        else {
            this.globeOpacity = globeOpacityValue;
        }
    }


    /***************** Country Depths *********************/

    this.countryDepthBase = 1.5;
    if(opts.countryDepthBase) {
        var countryDepthBaseValue = parseFloat(opts.countryDepthBase);
        if(isNaN(countryDepthBaseValue)){
            console.log("Error: requested countryDepthBase value " + opts.countryDepthBase + " is not a number");
        }
        else {
            this.countryDepthBase = THREE.Math.clampBottom(countryDepthBaseValue, 0.5)
        }
    }


    this.countryDepthSelected = 4.5;
    if(opts.countryDepthSelected) {
        var countryDepthSelectedValue = parseFloat(opts.countryDepthSelected);
        if(isNaN(countryDepthSelectedValue)){
            console.log("Error: requested countryDepthBase value " + opts.countryDepthSelected + " is not a number");
        }
        else {
            this.countryDepthSelected = THREE.Math.clampBottom(countryDepthSelectedValue, this.countryDepthBase + 0.25);
        }
    }


    /***************** Country Colors *********************/
    this.colorEBayBlue = new THREE.Color(0x0064d3);
    this.colorEBayYellow = new THREE.Color().setHSL((43/360), (98/100),(48/100));
    this.colorEBayYellowHSL =  this.colorEBayYellow.getHSL();

    this.colorCountry = new THREE.Color().setHSL((224/360), (79/100),(50/100));
    if(opts.colorCountry) {
        this.colorCountry = new THREE.Color(opts.colorCountry);
    }
    this.colorCountryHSL = this.colorCountry.getHSL();



    this.colorCountrySelected = this.colorEBayYellow;
    if(opts.colorCountrySelected) {
        this.colorCountrySelected = new THREE.Color(opts.colorCountrySelected);
    }
    this.colorCountrySelectedHSL = this.colorCountrySelected.getHSL();


    this.colorCountryDisabled = new THREE.Color().setRGB(190/255, 190/255, 190/255);
    if(opts.colorCountryDisabled) {
        this.colorCountryDisabled = new THREE.Color(opts.colorCountryDisabled);
    }
    this.colorCountryDisabledHSL = this.colorCountryDisabled.getHSL();



    /***************** Background Colors *********************/
    //Offset background sky/stars color because it gets tinted by the SSAO shader slightly
    this.colorBackground = new THREE.Color().setRGB(42/255, 97/255, 171/255);//.offsetHSL(0, 0, 6/100);
    if(opts.colorBackground) {
        //Offset background sky/stars color because it gets tinted by the SSAO shader slightly
        this.colorBackground = new THREE.Color(opts.colorBackground);//.offsetHSL(0, 0, 6/100);
    }

    this.backgroundOpacity = 0.0;
    this.inputBackgroundOpacity = 0.0; //Store value passed in to handle switching on and off
    if(opts.backgroundOpacity) {

        var backgroundOpacityValue = parseFloat(opts.backgroundOpacity);
        if(isNaN(backgroundOpacityValue)) {
            console.log("Error: requested backgroundOpacity value " + opts.backgroundOpacity + " is not a number");
        }
        else {
            this.backgroundOpacity = backgroundOpacityValue;
            this.inputBackgroundOpacity = backgroundOpacityValue;
        }
    }

    /************************** Transaction Animation Parameters **************************/

    this.arcWidth = 2.2;
    if(opts.arcWidth) {
        var arcWidthValue = parseFloat(opts.arcWidth);
        if(isNaN(arcWidthValue)){
            console.log("Error: requested Arc Width value " + opts.arcWidth + " is not a number");
        }
        else {
            this.arcWidth = THREE.Math.clampBottom(arcWidthValue, 0.05);
        }
    }

    this.arcColorAuction = new THREE.Color(0xE7958A); //Reddish
    if(opts.arcColorAuction) {
        this.arcColorAuction = new THREE.Color(opts.arcColorAuction);
    }

    this.arcColorUnknown = new THREE.Color(0x9C589E); //Purpleish
    if(opts.arcColorUnknown) {
        this.arcColorUnknown = new THREE.Color(opts.arcColorUnknown);
    }

    this.arcColorFixedPrice = new THREE.Color(0x85DE84); //Greenish
    if(opts.arcColorFixedPrice) {
        this.arcColorFixedPrice = new THREE.Color(opts.arcColorFixedPrice);
    }


    this.arcPulseTimeMultiplier = 1.0;
    if(opts.arcPulseTimeMultiplier) {
        var arcPulseTimeValue = parseFloat(opts.arcPulseTimeMultiplier);
        if(isNaN(arcPulseTimeValue)){
            console.log("Error: requested Arc Pulse Time Multiplier value " + opts.arcPulseTimeMultiplier + " is not a number");
        }
        else {
            this.arcPulseTimeMultiplier = THREE.Math.clampBottom(arcPulseTimeValue, 0.0001);
        }
    }


    this.arcTravelTimeMultiplier = 1.0;
    if(opts.arcTravelTimeMultiplier) {
        var arcTravelTimeValue = parseFloat(opts.arcTravelTimeMultiplier);
        if(isNaN(arcTravelTimeValue)){
            console.log("Error: requested Arc Travel Time Multiplier value " + opts.arcTravelTimeMultiplier + " is not a number");
        }
        else {
            this.arcTravelTimeMultiplier = THREE.Math.clampBottom(arcTravelTimeValue, 0.0001);
        }
    }


    /********************** End of Options Initialization ***********************/


    this.init(this.countryBordersDataPath, this.countryCentersDataPath, initCallbackFunc);

    return this;
};


/* Inherit methods and vars from Three.js EventDispatcher, to handle and dispatch events */
Globe3D.prototype = Object.create( THREE.EventDispatcher.prototype );


Globe3D.prototype.initD3 = function() {


    var projection = d3.geo.mercator()
        .scale((this.projectionWidth + 1) / (2.0 * Math.PI))
        .translate([this.projectionWidth/2.0, this.projectionHeight/2.0])
        .precision(.001);


    //d3.geo.mercator().precision(0.001);
    var path = d3.geo.path().projection(projection);




    this.geoConfig = {
        projection: projection,
        path: path
    };
};



Globe3D.prototype.initWebGL = function() {

        if( Detector.webgl ){
            this.renderer = new THREE.WebGLRenderer({
                antialias : true,
                //logarithmicDepthBuffer: true,
                alpha: true
            });

            //this.renderer = new THREE.WebGLDeferredRenderer( { width: this.WIDTH, height: this.HEIGHT, scale: 1, antialias: true } );

            //this.renderer.setClearColor( this.colorBackground.getHex(), 0 );
            this.renderer.setClearColor( 0x000000, 0 )
        } else {
            this.renderer = new THREE.CanvasRenderer();
        }





        this.renderer.setSize( this.WIDTH, this.HEIGHT );

        this.projector = new THREE.Projector();

        // append renderer to dom element
        this.domNode$.append(this.renderer.domElement);

        this.octree = new THREE.Octree({
            radius: this.globeRadius, // optional, default = 1, octree will grow and shrink as needed
            undeferred: false, // optional, default = false, octree will defer insertion until you call octree.update();
            depthMax: Infinity, // optional, default = Infinity, infinite depth
            objectsThreshold: 8, // optional, default = 8
            overlapPct: 0.5 // optional, default = 0.15 (15%), this helps sort objects that overlap nodes
          //  scene: this.scene // optional, pass scene as parameter only if you wish to visualize octree
        } );

};


Globe3D.prototype.setupCamera = function(scene) {
    // put a camera in the scene
    this.camera = new THREE.PerspectiveCamera(this.VIEW_ANGLE, this.WIDTH / this.HEIGHT, this.NEAR, this.FAR);

    this.camera.position.set(this.cameraPos.x, this.cameraPos.y, this.cameraPos.z);

    this.camera.lookAt( { x: this.cameraLookAt.x, y: this.cameraLookAt.y, z: this.cameraLookAt.z} );

    this.cameraControls = new THREE.OrbitControlsCustom( this.camera, this.domNode$[0] );

    this.cameraControls.noZoom = true;
    this.cameraControls.noPan = true;

    this.cameraControls.rotateSpeed = 0.4;
    this.cameraControls.zoomSpeed = 0.2;
    this.cameraControls.minPolarAngle = 0 + Math.PI/4;
    this.cameraControls.maxPolarAngle = Math.PI - (Math.PI/4);
    this.cameraControls.momentumDampingFactor = 0.85;


    this.cameraControls.target.set(this.cameraLookAt.x, this.cameraLookAt.y, this.cameraLookAt.z);


   this.cameraControls.addEventListener( 'change', this.render );


    scene.add(this.camera);
};

Globe3D.prototype.initProstprocessing = function() {

    this.renderer.sortObjects = false;

    // depth


    var depthShader = THREE.ShaderLib[ "depthRGBA" ];
    var depthUniforms = THREE.UniformsUtils.clone( depthShader.uniforms );

    this.postProcessingConfig.depthMaterial = new THREE.ShaderMaterial( { fragmentShader: depthShader.fragmentShader, vertexShader: depthShader.vertexShader, uniforms: depthUniforms } );
    this.postProcessingConfig.depthMaterial.blending = THREE.NoBlending;

    // postprocessing


    var renderTarget = new THREE.WebGLRenderTarget( this.WIDTH*this.postProcessingConfig.superSamplingMultiplier, this.HEIGHT*this.postProcessingConfig.superSamplingMultiplier, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, stencilBuffer: false } );
    this.composer = new THREE.EffectComposer( this.renderer , renderTarget);

    //Normal render pass

    var clearColor = (new THREE.Color()).setHex(0x000000);
    var renderPass = new THREE.RenderPass(this.scene, this.camera, null,  clearColor/*this.colorEBayBlue*/, 0);
    //renderPass.renderToScreen = true;
    this.composer.addPass(renderPass);

    //Depth target for SSAO shader
    this.postProcessingConfig.depthTarget = new THREE.WebGLRenderTarget( this.WIDTH*this.postProcessingConfig.superSamplingMultiplier, this.HEIGHT*this.postProcessingConfig.superSamplingMultiplier, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat } );


    //Setup SSAO shader pass, tweak the various uniform input values to config the algorithm
    this.postProcessingConfig.effectSSAO = new THREE.ShaderPass( THREE.SSAOShaderCustom );
    this.postProcessingConfig.effectSSAO.uniforms[ 'tDepth' ].value = this.postProcessingConfig.depthTarget;
    this.postProcessingConfig.effectSSAO.uniforms[ 'size' ].value.set( this.WIDTH*this.postProcessingConfig.superSamplingMultiplier, this.HEIGHT*this.postProcessingConfig.superSamplingMultiplier );
    this.postProcessingConfig.effectSSAO.uniforms[ 'cameraNear' ].value = this.camera.near;
    this.postProcessingConfig.effectSSAO.uniforms[ 'cameraFar' ].value = this.camera.far;
    this.postProcessingConfig.effectSSAO.uniforms[ 'maxDistance' ].value = 4; //Magic number that splits the background star/sky box from the globe
    this.postProcessingConfig.effectSSAO.uniforms[ 'onlyAO' ].value = 0;
    this.postProcessingConfig.effectSSAO.uniforms[ 'aoClamp' ].value = 0.3;
    this.postProcessingConfig.effectSSAO.uniforms[ 'lumInfluence' ].value = 0.9;
    ////this.postProcessingConfig.effectSSAO.needsSwap = true;
    this.postProcessingConfig.effectSSAO.renderToScreen = true;
    this.composer.addPass( this.postProcessingConfig.effectSSAO );




};


Globe3D.prototype.createEarthSphere = function(radius, segments) {
    return new THREE.Mesh(
        new THREE.SphereGeometry(radius, segments, segments),
        new THREE.MeshPhongMaterial({
            color: this.colorGlobe,
            ambient: this.colorGlobe,
            opacity: this.globeOpacity,
            transparent: true
           
        })
    );
};


Globe3D.prototype.createClouds =  function(radius, segments) {
    return new THREE.Mesh(
        new THREE.SphereGeometry(radius + 0.3, segments, segments),
        new THREE.MeshPhongMaterial({
            map:         THREE.ImageUtils.loadTexture('assets/image/fair_clouds_4k-dark.png'),
            transparent: true,
            depthWrite: false
        })

    );
};

Globe3D.prototype.createSkyBox = function(radius, segments) {


    return new THREE.Mesh(
        new THREE.SphereGeometry(radius, segments, segments),
        new THREE.MeshBasicMaterial({
            color: this.colorBackground,
            transparent: true,
            opacity: this.backgroundOpacity,
            depthWrite: false,
            //map:  THREE.ImageUtils.loadTexture('assets/image/galaxy_starfield.png'),
            side: THREE.BackSide
        })
    );
};


Globe3D.prototype.addLight = function(x, y, z, intensity, color) {


    var ambientColor = ((new THREE.Color()).setRGB(1, 1, 1));
    this.scene.add(new THREE.AmbientLight(ambientColor.getHex()));

    this.pointLight = new THREE.DirectionalLight(0xffffff, 0.25);
    this.pointLight.position.set(x,y,z);
    //this.scene.add(this.pointLight);

};

Globe3D.prototype.addPlane = function(x, y, z, color) {
        var planeGeo = new THREE.CubeGeometry(x, y, z);
        var planeMat = new THREE.MeshLambertMaterial({color: color});
        var plane = new THREE.Mesh(planeGeo, planeMat);

        // rotate it to correct position
        plane.rotation.x = -Math.PI/2;
        plane.translateZ(-800);
        this.scene.add(plane);
    };

Globe3D.prototype.latLongToVector3 = function(lat, lon, radius) {


    radius = radius ? radius : this.globeRadius;

    var phi = (90 - lat) * Math.PI / 180;
    var theta = (180 - lon) * Math.PI / 180;




    var x = radius * Math.sin(phi) * Math.cos(theta);
    var y = radius * Math.cos(phi);
    var z = radius * Math.sin(phi) * Math.sin(theta);




    return new THREE.Vector3(x, y, z);
    
};


 //Source based on: https://developers.google.com/maps/documentation/javascript/examples/map-coordinates
Globe3D.prototype.pointToLatLong = function (vec2Vertex, projectionWidth, projectionHeight) {

    var pixelOriginX = (projectionWidth / 2.0);
    var pixelOriginY = (projectionHeight / 2.0);
    var pixelsPerLonDegree = projectionWidth / 360.0;
    var pixelsPerLonRadian = projectionWidth / (2 * Math.PI);


    var longitude = (vec2Vertex.x - pixelOriginX) / pixelsPerLonDegree;
    var latRadians = (vec2Vertex.y - pixelOriginY) / (-1.0*(pixelsPerLonRadian));
    var latitude = 180.0/Math.PI * (2.0 * Math.atan(Math.exp(latRadians)) - Math.PI / 2.0);

    return {latitude: latitude, longitude: longitude};

};


Globe3D.prototype.warpToSphere = function(countryData, extrudeGeometry, mapBoundingBox, radius) {



    for (var i=0; i<extrudeGeometry.vertices.length; i++) {


        var vertex = extrudeGeometry.vertices[i];

   

        var latLong = this.pointToLatLong(vertex, this.projectionWidth, this.projectionHeight);


        var magicLatitudeThreshold = 85.05112878;
        var snapThreshold = 90 - magicLatitudeThreshold; //Magic mercator projection limit number from stack overflow:
        //http://stackoverflow.com/questions/14329691/covert-latitude-longitude-point-to-a-pixels-x-y-on-mercator-projection

        //Very bottom and top of globe projection leave a hole, so we snap to the bottom to fill it in

        var borderWidth = 0.02;
        var stretchRange = 90 - (85.05112878 - borderWidth);


        if( latLong.latitude < (-90.0+(snapThreshold + borderWidth))) {
            //Within stretching region

            var fractionOfBorderWidth = (latLong.latitude - (-magicLatitudeThreshold))/(borderWidth);
            latLong.latitude = Math.max(-90, -90.0 + (fractionOfBorderWidth)* stretchRange);



        }
        //Handle case of snapping any geometry at the very top of the globe (there is no landmass there, so typically no geometry will be there
        else if( latLong.latitude > (90.0-(snapThreshold + borderWidth))) {



            var fractionOfBorderWidth = (latLong.latitude - magicLatitudeThreshold)/(borderWidth);
            latLong.latitude = Math.min(90, 90.0 - (fractionOfBorderWidth)* stretchRange);



        }


        var spherePoint = this.latLongToVector3(latLong.latitude, latLong.longitude, radius);

        var origDepth = vertex.z - mapBoundingBox.minZ;

        //Handle special case of country within another country
        if(countryData.iso_3 === "LSO") {
            origDepth += 0.02;
        }


        if(origDepth < 0) {
            origDepth = 0.0;
        }
        var normalOnSphere = new THREE.Vector3();
        //Sphere points are centered around origin, and are therefore scaled normals at that point on the globe
        normalOnSphere.copy(spherePoint).normalize();


        var offsetPoint = new THREE.Vector3();
        offsetPoint.addVectors(spherePoint, normalOnSphere.multiplyScalar(origDepth));

        this.verticesSortedByLatLon.push({
            latitude: latLong.latitude,
            longitude: latLong.longitude,
            flatLocation : extrudeGeometry.vertices[i].clone(),
            sphereLocation: offsetPoint.clone(),
            vertexRef : extrudeGeometry.vertices[i]

        });
        extrudeGeometry.vertices[i].x = offsetPoint.x;
        extrudeGeometry.vertices[i].y = offsetPoint.y;
        extrudeGeometry.vertices[i].z = offsetPoint.z;


    }


   //extrudeGeometry.computeCentroids();
    extrudeGeometry.computeFaceNormals();
    extrudeGeometry.computeBoundingSphere();
    extrudeGeometry.computeBoundingBox();
    extrudeGeometry.computeVertexNormals();

    return extrudeGeometry;


};

Globe3D.prototype.get_total_bounding_box= function(countries) {

    var maxX = null;
    var maxY = null;
    var minX = null;
    var minY = null;
    var maxZ = null;
    var minZ = null;

    for(var i=0; i<countries.length; i++) {
        for (var j=0; j<countries[i].shape3d.vertices.length; j++) {


            var vertex = countries[i].shape3d.vertices[j];

            if(maxX == null || vertex.x > maxX) {
                maxX = vertex.x;

            }
            if(maxY == null || vertex.y > maxY) {
                maxY = vertex.y;

            }
            if(maxZ == null || vertex.z > maxZ) {
                maxZ = vertex.z;

            }
            if(minX == null || vertex.x < minX) {
                minX = vertex.x;

            }
            if(minY == null || vertex.y < minY) {
                minY = vertex.y;

            }
            if(minZ == null || vertex.z < minZ) {
                minZ = vertex.z;

            }

        }
    }


    var rangeX = maxX - minX;
    var rangeY = maxY - minY;
    var rangeZ = maxZ - minZ;


    var center = new THREE.Vector3(minX + (rangeX/2.0), minY + (rangeY/2.0), minZ + (rangeZ/2.0));

    return {
        maxX: maxX,
        maxY: maxY,
        minX: minX,
        minY: minY,
        maxZ: maxZ,
        minZ: minZ,
        rangeX: rangeX,
        rangeY: rangeY,
        rangeZ: rangeZ,
        center: center
    };
};

Globe3D.prototype.exportScene = function ( exporterClass ) {

    var exporter = new exporterClass();

    var output = exporter.parse( this.globeGroup );

    if ( exporter instanceof THREE.ObjectExporter ) {

        output = JSON.stringify( output, null, '\t' );
        output = output.replace( /[\n\t]+([\d\.e\-\[\]]+)/g, '$1' );

    }

    var blob = new Blob( [ output ], { type: 'text/plain' } );
    var objectURL = URL.createObjectURL( blob );

    window.open( objectURL, '_blank' );
    window.focus();

};


Globe3D.prototype.createScene = function(countryBordersDataObject, countryCentersDataObject) {

    this.setupCamera(this.scene);


    this.generateCountries(countryBordersDataObject);

    //Setup CSS3d renderer for data overlays
    this.globeMarkers = new Globe3DMarkers(this.camera, this.scene, this.globeGroup, this.octree, this.WIDTH, this.HEIGHT, this.postProcessingConfig.superSamplingMultiplier, "globeCSS3D");

    //Setup Arc render manager
    this.globeArcs = new Globe3DArcs(this.scene, this.globeGroup, this.earthSphere.position, this.globeRadius, this.propertyAnimator);

    //this.exportScene(THREE.ObjectExporter);
    this.createMarkers(countryCentersDataObject);

    this.addLight(500, 0, 200, 1.0, 0xFFFFFF);
    //this.addPlane(1400, 1400, 20, 0xEEEEEE);



};


//Country markers
Globe3D.prototype.createMarkers = function(countryCentersDataObject) {


    return;
    //this.addMarker("what", 38, -97, 80, 20, 20);
    for(var cc in countryCentersDataObject.countries ) {

        var lat = parseFloat(countryCentersDataObject.countries[cc].lat);
        var lon = parseFloat(countryCentersDataObject.countries[cc].lon);
        this.globeMarkers.addMarker(cc, lat, lon, this.globeRadius + this.countryDepthSelected + 0.25, 5, 5);
    }


    //this.globeMarkers.


};

Globe3D.prototype.jitterDupeTimes = function(firstTimeStampMS, totalTimeIntervalMS, transactionArray) {

    //Assume already sorted transactionArray, from earliest time to latest

    //No need to jitter one transaction
    if(transactionArray.length == 1) {
        return transactionArray;
    }

    var timeStampGroups = _.groupBy(transactionArray, function(transaction){ return transaction.TimeStamp});


    //for each group, find the difference between last and next group - we will jitter forward or back in time within this window
    var timeStampKeys = Object.keys(timeStampGroups);

    var timeGapTable = {};
    if(timeStampKeys.length == 1) {

        var currentTimeStamp = timeStampGroups[timeStampKeys[0]][0].TimeStamp;
        //For single batch of transactions at a single time stamp, use entire time range as our jitter range
        timeGapTable[timeStampKeys[0]] = {
            prevGap : currentTimeStamp - firstTimeStampMS,
            nextGap : (firstTimeStampMS + totalTimeIntervalMS) - currentTimeStamp

        };
    }
    else {
        //We have at least two timestamp groups
        for(var i=0; i<timeStampKeys.length; i++) {

            var currentTimeStamp = timeStampGroups[timeStampKeys[i]][0].TimeStamp;
            var prevGap;
            var nextGap;
            //Use timestamp of first timestamp group in each time group as the reference timestamp (since timestamps are identical within each group)
            if(i == 0) {
                //First timestamp group - use all of the previous time range from the beginning of our interval and only half
                //of the time gap to the next timestamp
                prevGap = (currentTimeStamp - firstTimeStampMS);
                nextGap = (timeStampGroups[timeStampKeys[i + 1]][0].TimeStamp - currentTimeStamp)/2.0;

            }
            else if( i > 0 && i < timeStampKeys.length - 1) {
                //Middle timestamp group - use half of the gap size between time ranges for jitter
                prevGap = (currentTimeStamp - timeStampGroups[timeStampKeys[i - 1]][0].TimeStamp)/2.0;
                nextGap =  (timeStampGroups[timeStampKeys[i + 1]][0].TimeStamp - currentTimeStamp)/2.0;
            }
            else {
                //last timestamp group - use half the time gap to our previous timestamp,
                // and ALL of the rest of the time to the end of our time interval
                prevGap = (currentTimeStamp - timeStampGroups[timeStampKeys[i - 1]][0].TimeStamp)/2.0;
                nextGap = (firstTimeStampMS + totalTimeIntervalMS) - currentTimeStamp;
            }


            //Add our new time range info to our time gap table
            timeGapTable[timeStampKeys[i]] = {
                prevGap:  prevGap,
                nextGap: nextGap
            };
        }

    }

    for(var timeStamp in timeStampGroups) {

        var timeGroup = timeStampGroups[timeStamp];

        //Only need to jitter if we have duplicates at the same time stamp
        if(timeGroup.length > 1) {

            //Get time gap from current time group to next (already determined above)
            var timeGap = timeGapTable[timeStamp];

            //Jitter all elements, even the first one
            for(var j=0; j<timeGroup.length; j++) {

                //Jitter to a random position within the previous and next time gaps we previous calculated
                timeGroup[j].TimeStamp = Math.round((timeGroup[j].TimeStamp - timeGap.prevGap) + Math.random()*(timeGap.prevGap + timeGap.nextGap));

            }

        }
    }



   return transactionArray;


};

//Arcs
Globe3D.prototype.createArcs = function(firstTimeStampMS, lastTimeStampMS, timeIntervalMS, playBackTimeMS, transactionArray) {

    //this.postProcessingConfig.effectSSAO.enabled = false;
    var pulseTime = this.arcPulseTimeMultiplier * (Math.abs(playBackTimeMS)/7.0);
    var arcTimeMS = this.arcTravelTimeMultiplier * (Math.abs(playBackTimeMS)/7.0) * 2.0;

    var timeMultiplier = Math.abs(playBackTimeMS/timeIntervalMS);



    //var jitteredTransactions = this.jitterDupeTimes(firstTimeStampMS, timeIntervalMS, transactionArray);
    var jitteredTransactions = transactionArray;

    function finishCondition(index) {
        if(playBackTimeMS >= 0) {
            return index < jitteredTransactions.length;
        }
        else {
            return index >= 0;
        }
    }

    function nextStep(index) {
        if(playBackTimeMS >= 0) {
            return index + 1;
        }
        else {
            return index - 1;
        }

    }

    function firstIndex() {
        if(playBackTimeMS >= 0) {
            return 0;
        }
        else {
            return jitteredTransactions.length - 1;
        }

    }

    function getStartDelay(transTimeStamp) {
        if(playBackTimeMS >= 0) {
            return (transTimeStamp - firstTimeStampMS) * timeMultiplier;
        }
        else {
            return (lastTimeStampMS - transTimeStamp) * timeMultiplier;
        }

    }


    var i = firstIndex();
    while(finishCondition(i)) {

        var transaction = jitteredTransactions[i];
        var startDelay = getStartDelay(transaction.TimeStamp);
        var fromVec3 = this.latLongToVector3(transaction.SellerLat, transaction.SellerLon, this.globeRadius + (0.75*this.countryDepthBase));
        var toVec3 = this.latLongToVector3(transaction.BuyerLat, transaction.BuyerLon, this.globeRadius + (0.75*this.countryDepthBase));


        var sellerCC = this.formatEBayCCForISO2(transaction.SellerCC);
        var buyerCC = this.formatEBayCCForISO2(transaction.BuyerCC);
        var sellerCountryObj = this.countryTable[sellerCC];
        var buyerCountryObj = this.countryTable[buyerCC];


        var arcColor;
        if(transaction.SaleType === 'fixedprice') {
            arcColor = this.arcColorFixedPrice;
        }
        else if (transaction.SaleType === 'auction') {
            arcColor = this.arcColorAuction;
        }
        else {
            //Unknown
            arcColor = this.arcColorUnknown;
        }
        this.globeArcs.launchArc(fromVec3, toVec3, arcColor, this.arcWidth, startDelay, arcTimeMS);

        //this.globeArcs.launchArc(fromVec3, toVec3, startDelay, pulseTime*2.0);

        //Same country, use special animation style
        if(sellerCountryObj && buyerCountryObj && (buyerCountryObj == sellerCountryObj)) {


            //Single animation only
            this.animateCountryColor(sellerCountryObj, sellerCountryObj.color, sellerCountryObj.selectedColor, true, 1, true, startDelay, pulseTime*2.0, false);
            this.animateCountryHeight(sellerCountryObj, this.countryDepthBase, this.countryDepthSelected, true, 1, true, startDelay, pulseTime*2.0, false);

        }
        else {
            if(sellerCountryObj) {


                if(playBackTimeMS >= 0) {
                    this.animateCountryColor(sellerCountryObj, sellerCountryObj.color, sellerCountryObj.selectedColor, true, 1, true, startDelay, pulseTime, false);
                    this.animateCountryHeight(sellerCountryObj, this.countryDepthBase, this.countryDepthSelected, true, 1, true, startDelay, pulseTime, false);
                }
                else {
                    //Reverse order of animations
                    this.animateCountryColor(sellerCountryObj, sellerCountryObj.color, sellerCountryObj.selectedColor, true, 1, true, startDelay + (arcTimeMS/2.0), pulseTime, false);
                    this.animateCountryHeight(sellerCountryObj, this.countryDepthBase, this.countryDepthSelected, true, 1, true, startDelay + (arcTimeMS/2.0), pulseTime, false);
                }
            }
            else {
                //console.log("Invalid Seller CC for transaction: " + transaction.SellerCC);

            }

            if(buyerCountryObj) {

                if(playBackTimeMS >= 0) {
                    this.animateCountryColor(buyerCountryObj, buyerCountryObj.color, buyerCountryObj.selectedColor, true, 1, true, startDelay + (arcTimeMS/2.0), pulseTime, false);
                    this.animateCountryHeight(buyerCountryObj, this.countryDepthBase, this.countryDepthSelected, true, 1, true, startDelay + (arcTimeMS/2.0), pulseTime, false);
                }
                else {
                    //Reverse order of animations
                    this.animateCountryColor(buyerCountryObj, buyerCountryObj.color, buyerCountryObj.selectedColor, true, 1, true, startDelay, pulseTime, false);
                    this.animateCountryHeight(buyerCountryObj, this.countryDepthBase, this.countryDepthSelected, true, 1, true, startDelay, pulseTime, false);
                }

            }
            else {
                //console.log("Invalid Buyer CC for transaction: " + transaction.BuyerCC);

            }
        }


        i = nextStep(i);
    }

};


Globe3D.prototype.generateCountries = function(data) {



    var allCountryShapes = [];
    var i, j;

    // convert to threejs meshes
    for (i = 0 ; i < data.features.length ; i++) {

        //Bermuda causing vis issues with stretched geometry across globe
        if(data.features[i].id === "BMU") {
            continue;
        }
        var geoFeature = data.features[i];
        var properties = geoFeature.properties;
        var feature = this.geoConfig.path(geoFeature);

        // we only need to convert it to a three.js path
        var path = transformSVGPathExposed(feature);




        // add to our table of country objects
        for (j = 0 ; j < path.length ; j++) {

            var countryData = properties;
            countryData.iso_3 = data.features[i].id.toUpperCase();


            countryData.iso_2 = data.features[i].iso_2.toUpperCase();

            var countryObj = {data: countryData, path: path[j], shape3d: null, mesh: null};
            allCountryShapes.push(countryObj);

            if(!this.countryTable[countryData.iso_2]) {
                this.countryTable[countryData.iso_2] = {
                    id: countryData.iso_2,
                    depth: this.countryDepthBase,
                    color: this.getCountryColor(countryData),
                    selectedColor: this.getSelectedCountryColor(countryData),
                    disabledColor: this.getDisabledCountryColor(countryData),
                    objects:[]};

                //Enable every country
                this.currentlyEnabledCountries[countryData.iso_2] = this.countryTable[countryData.iso_2];

            }
            this.countryTable[countryData.iso_2].objects.push(countryObj);

        }
    }

    //Extrude all meshes
    for(i=0;i<allCountryShapes.length; i++) {

        // extrude mesh
        var shape3d = allCountryShapes[i].path.extrude({
            amount: -1*this.countryDepthBase,
            bevelEnabled: false
        });

        shape3d.dynamic = true;
        allCountryShapes[i].shape3d = shape3d;

    }


    //Get bounding box for original, un-warped flat version of map
    var mapBoundingBox = this.get_total_bounding_box(allCountryShapes);

    //Create meshes and add to scene

    //Setup globe
    // Earth params
    var radius   = 0.5,
        segments = 48,
        rotation = -Math.PI;


    //Create Background
    this.skyBox = this.createSkyBox((this.globeRadius*2)*5, 64);
    this.scene.add(this.skyBox);

    this.earthSphere = this.createEarthSphere(this.globeRadius-0.05, segments);
    this.earthSphere.name = "Earth";
    this.earthSphere.rotation.y = rotation;
    this.globeGroup.add(this.earthSphere);
    this.octree.add( this.earthSphere );



    //this.globeGroup.rotation.x = Math.PI/2;
    this.globeGroup.scale.x = this.globeGroup.scale.y = this.globeGroup.scale.z = 1;
    this.globeGroup.translateX(0);
    this.globeGroup.translateZ(0);
    this.globeGroup.translateY(0);

    var countryGroup = new THREE.Object3D();
    this.countryGroup = countryGroup;

    this.globeGroup.add(countryGroup);




//    this.earthSphere = this.createEarthSphere(this.globeRadius-0.05, segments);
//    this.earthSphere.name = "Earth";
//    this.earthSphere.rotation.y = rotation;
//    this.globeGroup.add(this.earthSphere);
//    this.octree.add( this.earthSphere );


    this.worldMeshes.push(this.globeGroup);

    //For each geometry component of each country, create a new 3D object/mesh, tesslate, and warp it to sphere
    for(var countryKey in this.countryTable) {


        var currentCountryInfo = this.countryTable[countryKey];

        for(var k=0; k<currentCountryInfo.objects.length; k++) {


            var currentObject = currentCountryInfo.objects[k];


            var materialLambert = new THREE.MeshLambertMaterial({
                color: currentCountryInfo.color,
                ambient: currentCountryInfo.color,
                opacity:1.0
            });

            materialLambert.side = THREE.DoubleSide;
//            material.side = THREE.DoubleSide;


            var wireframeMaterial = new THREE.MeshBasicMaterial( {  color: currentCountryInfo.color, wireframe: true, transparent: true } );

            //Tesselate for more vertices to warp, resulting in smooth geometry (and no triangle intersection with globe sphere)
            var tessellateModifier = new THREE.TessellateModifier( 4 );

            for ( var i = 0; i < 7; i ++ ) {

                tessellateModifier.modify( currentObject.shape3d );

            }


            //warp mercator 3d geometry to sphere
            var shape3dwarped = this.warpToSphere(currentObject.data, currentObject.shape3d, mapBoundingBox, this.globeRadius);


            currentObject.shape3d = shape3dwarped;


            // create a mesh based on material and extruded shape
            var toAdd = new THREE.Mesh(shape3dwarped, materialLambert);
            currentObject.mesh = toAdd;

            //set name of mesh
            toAdd.name = currentObject.data.iso_2;


            this.worldMeshes.push(toAdd);
            // add to scene
            countryGroup.add(toAdd);
            this.octree.add(toAdd);

        }
    }

    //Get refs to all vertices
    this.verticesSortedByLatLon.sort(function(a,b){

        return (a.longitude - b.longitude);
    });

    //console.log(this.verticesSortedByLatLon.length);

    this.clouds = this.createClouds(this.globeRadius+(this.countryDepthBase*1.08), segments);
    //this.clouds = this.createClouds(this.globeRadius+(this.countryDepthBase*5), segments);

    this.clouds.name = "Clouds";
    this.clouds.rotation.y = rotation;
    this.globeGroup.add(this.clouds);


    this.scene.add(this.globeGroup);





};


Globe3D.prototype.extrudeAll = function(countryTableObject, extrusionDepth) {


    if(countryTableObject.id === "LS") {
        //Offset to rise above geometry of South Africa
        extrusionDepth += 5;
    }

    //Multiplier for the new length
    var extrusionRatio = (extrusionDepth + this.globeRadius)/(countryTableObject.depth + this.globeRadius);

    for(var i=0; i<countryTableObject.objects.length; i++) {
        this.extrudeDepth(countryTableObject.objects[i].mesh, extrusionRatio);
    }
    //Set new extrusion depth to store
    countryTableObject.depth = extrusionDepth;
};

Globe3D.prototype.extrudeDepth = function(countryMesh, extrusionRatio) {


    for(var i=0; i<countryMesh.geometry.vertices.length; i++) {

        /////var vertex = countryMesh.geometry.vertices[i];


        var length = countryMesh.geometry.vertices[i].length(); //distance from globe local origin

        //console.log('variation from target:' +Math.abs(length - (this.globeRadius + extrusionDepth)) );

        if((Math.abs(length - this.globeRadius) > 0.1)) {
            //We have a point that is away from the surface of the sphere, so we can extrude this point

            /////var normalOnSphere = new THREE.Vector3();
            //Sphere points are centered around origin, and are therefore scaled normals at that point on the globe
            /////normalOnSphere.copy(vertex).normalize();
            //Get unit vector
            //normalOnSphere.subVectors(spherePoint, mapBoundingBox.center).normalize();

            //var offsetPoint = new THREE.Vector3();
            //////normalOnSphere.multiplyScalar(this.globeRadius + extrusionDepth);
            //////countryMesh.geometry.vertices[i].x = normalOnSphere.x;
            //////countryMesh.geometry.vertices[i].y = normalOnSphere.y;
            //////countryMesh.geometry.vertices[i].z = normalOnSphere.z;

            countryMesh.geometry.vertices[i].x *= extrusionRatio;
            countryMesh.geometry.vertices[i].y *= extrusionRatio;
            countryMesh.geometry.vertices[i].z *= extrusionRatio;

        }

    }



    countryMesh.geometry.verticesNeedUpdate = true;
    countryMesh.geometry.computeBoundingBox();

};

Globe3D.prototype.getCountryColor = function(data) {


    var color = new THREE.Color( 0xffffff );
    var newColor = this.getCountryColorHSL(data, this.colorCountryHSL, 0.4, 0.8);
    color.setHSL(newColor.h, newColor.s, newColor.l);

    //return multiplier*0xffffff;
    return color;
};

Globe3D.prototype.getSelectedCountryColor = function(data) {
    var color = new THREE.Color( 0xffffff );
    var newColor = this.getCountryColorHSL(data, this.colorCountrySelectedHSL, 0.4, 0.8);
    color.setHSL(newColor.h, newColor.s, newColor.l);

    //return multiplier*0xffffff;
    return color;

};


Globe3D.prototype.getDisabledCountryColor = function(data) {
    var color = new THREE.Color( 0xffffff );
    var newColor = this.getCountryColorHSL(data, this.colorCountryDisabledHSL, 0.7, 0.9);
    color.setHSL(newColor.h, newColor.s, newColor.l);

    //return multiplier*0xffffff;
    return color;

};

Globe3D.prototype.getCountryColorHSL = function(data, baseColorHSL, minLuminance, maxLuminance) {
    var multiplier = 0;
    var lumRange = maxLuminance - minLuminance;


    //Calculate unique value that sums the charcode values of each letter of the 3 character country code
    //and weighs each code value by the position in the country code, to provide a larger range of values
    for(var i = 0; i < 3; i++) {
        multiplier += ((i+1)*data.iso_3.charCodeAt(i));
    }



    //zero to one resulting value
    multiplier = (multiplier - 390)/(540-390); //Code "AAA" is min value of 390, and "ZZZ" is max value of 540


    return {
      h: baseColorHSL.h,
      s: baseColorHSL.s,
      l: minLuminance+(lumRange*(multiplier))
    };

};



Globe3D.prototype.moveCameraLinear = function() {

    if(this.animateCamera == false) {
        return;
    }
    var speed = 0.2;
    var target_x = (this.cameraPos.x - this.camera.position.x) * speed;
    var target_y = (this.cameraPos.y - this.camera.position.y) * speed;
    var target_z = (this.cameraPos.z - this.camera.position.z) * speed;

    this.camera.position.x += target_x;
    this.camera.position.y += target_y;
    this.camera.position.z += target_z;

    this.camera.lookAt( {x: this.cameraLookAt.x, y: this.cameraLookAt.y, z: this.cameraLookAt.z } );


    if(this.camera.position.distanceTo(this.cameraPos) < 0.1) {
        this.animateCamera = false;
    }
};

Globe3D.prototype.clearGeo = function() {

    for ( var i=0; i< this.worldMeshes.length; i++ ) {

        this.scene.remove(this.worldMeshes[i]);
    }

};

Globe3D.prototype.rotateGlobe = function(rotate) {

    this.rotateGlobeFlag = rotate;
}

Globe3D.prototype.selectCountries = function(countryCodeArray, animate) {

    this.enableOrSelectCountries(countryCodeArray, animate, true);

};


Globe3D.prototype.enableCountries = function (countryCodeArray, animate) {

    this.enableOrSelectCountries(countryCodeArray, animate, false);

};


Globe3D.prototype.setCountryHeights = function (countryCodeToHeightTable, animate, timeMultiplier, yoyo, delay) {

    var formattedCountryCodeToHeight = this.formatEBayCCForISO2(countryCodeToHeightTable);


    for(var cc in formattedCountryCodeToHeight) {

        if(this.countryTable[cc]) {

            this.animateCountryHeight(this.countryTable[cc], null, formattedCountryCodeToHeight[cc], animate, timeMultiplier, yoyo, delay);
        }
        else {
            console.log("Warning: Attempted to Set Height on unknown country code: " + cc);
        }


    }

};

Globe3D.prototype.resetCountryHeights = function (countryCodeToHeightTable, animate) {


    var formattedCountryCodeToHeight = this.formatEBayCCForISO2(countryCodeToHeightTable);


    var defaultHeight = this.countryDepthBase;



    for(var cc in formattedCountryCodeToHeight) {
        if(this.countryTable[cc]) {

            this.animateCountryHeight(this.countryTable[cc], null, defaultHeight, animate, 1.0, false);
        }
        else {
            console.log("Warning: Attempted to Reset Height on unknown country code: " + cc);
        }
    }


};

Globe3D.prototype.setAllCountryHeights = function (desiredHeight, animate) {


    for(var cc in this.countryTable) {

       this.animateCountryHeight(this.countryTable[cc], null, desiredHeight, animate);

    }


};

Globe3D.prototype.formatISO2ForEBayCC = function(iso2CountryCode) {
    //Fix country codes coming from GeoJSON iso2 data that don't match eBay Country Codes


    //Check for array instance first, since Arrays will also be instances of Objects (so second condition will match)
    if(iso2CountryCode instanceof Array) {
        var result = [];
        for(var i=0; i<iso2CountryCode.length; i++) {

            if(this.iso2ToEBayCC[iso2CountryCode[i]]) {
                result.push(this.iso2ToEBayCC[iso2CountryCode[i]]);
            }
            else {
                result.push(iso2CountryCode[i]);
            }
        }
        return result;

    }
    else if(iso2CountryCode instanceof Object) {
        //Create new object with new country code attributes, same values
        var result = {};

        for(var cc in iso2CountryCode) {

            if(this.iso2ToEBayCC[cc]) {

                result[this.iso2ToEBayCC[cc]] = iso2CountryCode[cc];
            }
            else {
                result[cc] = iso2CountryCode[cc];
            }
        }
        return result;

    }
    else if(this.iso2ToEBayCC[iso2CountryCode]) {
        iso2CountryCode = this.eBayCCToISO2[iso2CountryCode];
        return iso2CountryCode;
    }
    else {
        return iso2CountryCode;
    }



};

Globe3D.prototype.formatEBayCCForISO2 = function(eBayCountryCode) {
    //Fix country codes coming from eBay data that don't match GeoJSON iso2 codes exactly

    //Check for array instance first, since Arrays will also be instances of Objects (so second condition will match)
    if(eBayCountryCode instanceof Array) {

        var result = [];

        for(var i=0; i<eBayCountryCode.length; i++) {

            if(this.eBayCCToISO2[eBayCountryCode[i]]) {
                result.push(this.eBayCCToISO2[eBayCountryCode[i]]);
            }
            else {
                result.push(eBayCountryCode[i]);
            }
        }
        return result;
    }
    else if(eBayCountryCode instanceof Object) {
        //Create new object with new country code attributes, same values
        var result = {};

        for(var cc in eBayCountryCode) {

            if(this.eBayCCToISO2[cc]) {

                result[this.eBayCCToISO2[cc]] = eBayCountryCode[cc];
            }
            else {
                result[cc] = eBayCountryCode[cc];
            }
        }

        return result;

    }
    else if(this.eBayCCToISO2[eBayCountryCode]) {
        eBayCountryCode = this.eBayCCToISO2[eBayCountryCode];
        return eBayCountryCode;
    }
    else {
        return eBayCountryCode;
    }



};

Globe3D.prototype.enableOrSelectCountries = function (countryCodeArray, animate, select) {


    countryCodeArray = this.formatEBayCCForISO2(countryCodeArray);

    var targetCountryTable = this.currentlyEnabledCountries;
    if(select) {
        //If we are selecting/deselecting, we will be modifying the currently selected country table

        targetCountryTable = this.currentlySelectedCountries;

    }

    //Create a table of new countries to enabl/selecte that are not already disabled
    var countriesToEnable = {};

    for(var i=0; i<countryCodeArray.length; i++) {


        var alreadyEnabledCountry = targetCountryTable[countryCodeArray[i]];
        if(!alreadyEnabledCountry) {

            var newCountryToEnable = this.countryTable[countryCodeArray[i]];

            if(newCountryToEnable) {
                countriesToEnable[countryCodeArray[i]] = newCountryToEnable;

            }
            else {
                console.log("Warning: Attempted to Enable/Select unknown country code: " + countryCodeArray[i]);
            }

        }
    }


    //Now make a list of countries to disable/deselect that are already Enabled and not included in the new Enabled list
    var countriesToDisable = {};

    for( var countryCode in targetCountryTable) {



        var countryShouldBeDisabled = true;

        //Look at input country code list and see if the code of this enabled country is in there
        for(var j=0; j<countryCodeArray.length; j++) {


            if(countryCodeArray[j] === countryCode) {
                countryShouldBeDisabled = false;
                break;

            }
        }


        if(countryShouldBeDisabled) {

            countriesToDisable[countryCode] = targetCountryTable[countryCode];

            delete targetCountryTable[countryCode];

        }


    }


    //Enable/Select countries
    for(var countryCodeToEnable in countriesToEnable) {

        var countryObjToEnable = countriesToEnable[countryCodeToEnable];

        if(select) {
            this.animateCountrySelection(countryObjToEnable, true, animate);
            this.currentlySelectedCountries[countryCodeToEnable] = countryObjToEnable;
        }
        else {
            this.animateCountryColor(countryObjToEnable, null, countryObjToEnable.color, animate, 1.0, false); //Set to enabled base color of country, already precalculated
            this.currentlyEnabledCountries[countryCodeToEnable] = countryObjToEnable;
        }


    }

    //Disable/Deselect countries
    for (var countryCodeToDisable in countriesToDisable) {

        var countryObjToDisable = countriesToDisable[countryCodeToDisable];

        if(select) {
            this.animateCountrySelection(countryObjToDisable, false, animate);
            delete this.currentlySelectedCountries[countryCodeToDisable];

        }
        else {
            this.animateCountryColor(countryObjToDisable, null, countryObjToDisable.disabledColor, animate, 1.0, false ); //Set to disabled color
            delete this.currentlyEnabledCountries[countryCodeToDisable];
        }

    }
};

Globe3D.prototype.transitionGlobe = function (flatOrGlobe) {

    if(!flatOrGlobe){return;}

    flatOrGlobe = flatOrGlobe.toUpperCase();

    var changeToGlobe = true;
    if(flatOrGlobe  === "FLAT") {

        changeToGlobe = false;
        this.earthSphere.material.opacity = 0;

    }
    else if (flatOrGlobe === "GLOBE") {
        changeToGlobe = true;
        this.earthSphere.material.opacity = 1;
    }
    else {
        return;
    }


    var _this = this;

    var updateVert = function() {

        var _interpolatedObj = this;



        console.log(_interpolatedObj.time);


        for(var i=0; i<_this.verticesSortedByLatLon.length; i++) {

            var targetVertexData = _this.verticesSortedByLatLon[i];

            var fromLoc, toLoc;

            if(changeToGlobe) {

                fromLoc = targetVertexData.flatLocation;
                toLoc = targetVertexData.sphereLocation;
            }
            else {
                fromLoc = targetVertexData.sphereLocation;
                toLoc = targetVertexData.flatLocation;
            }

            var newX = fromLoc.x + _interpolatedObj.time * (toLoc.x - fromLoc.x);
            var newY = fromLoc.x + _interpolatedObj.time * (toLoc.y - fromLoc.y);
            var newZ = fromLoc.x + _interpolatedObj.time * (toLoc.z - fromLoc.z);
            targetVertexData.vertexRef.set(newX, newY, newZ);



        }



    };



    this.propertyAnimator.startAnimation('allverts', 'position',
        {//From
            //vertex: targetVertexData.vertexRef,
            time: 0
        },
        {//To
            time: 1
        }, updateVert, null, 5000, 0, TWEEN.Easing.Cubic.InOut, false, true);




};

Globe3D.prototype.animateCountryColor = function (countryObject, oldColor, newColor, animate, timeMultiplier, yoyo, delay, animTime, interrupt) {

    timeMultiplier = (timeMultiplier ? timeMultiplier : 1.0);
    yoyo = (yoyo === undefined ? false : yoyo); //This looks weird/redundant, but it handles the case of an undefined boolean parameter
    delay = (delay ? delay: 0);
    animTime = (animTime ? animTime : this.transitionTimeMS);
    interrupt = (interrupt === undefined ? true : interrupt);

    //If no old color provided, pull original color from first geometry object for country
    oldColor  = oldColor ? oldColor : countryObject.objects[0].mesh.material.color;

    if(!animate) { //Instantly change to new color, no animation

        var objectList = countryObject.objects;
        for(var i=0; i< objectList.length; i++) {
            objectList[i].mesh.material.color.setRGB(newColor.r, newColor.g, newColor.b);
            objectList[i].mesh.material.ambient.setRGB(newColor.r, newColor.g, newColor.b);

        }
    }
    else {

        var updateColor = function() {

            var _interpolatedObj = this;

            var objectList = countryObject.objects;
            for(var i=0; i< objectList.length; i++) {
                objectList[i].mesh.material.color.setRGB(_interpolatedObj.r, _interpolatedObj.g, _interpolatedObj.b);
                objectList[i].mesh.material.ambient.setRGB(_interpolatedObj.r, _interpolatedObj.g, _interpolatedObj.b);

            }


        };


        this.propertyAnimator.startAnimation(countryObject.id, 'color',
            {//From
                //countryObject: countryObject,
                r: oldColor.r,
                g: oldColor.g,
                b: oldColor.b
            },
            {//To
                r: newColor.r,
                g: newColor.g,
                b: newColor.b
            }, updateColor, null, animTime * timeMultiplier, delay, TWEEN.Easing.Cubic.InOut, yoyo, interrupt);


    }



};

Globe3D.prototype.toggleCountrySelection = function(countryId) {


    var _this = this;


    var targetCountryInfo = this.countryTable[countryId];


    var selectCountry = true;

    if(this.currentlySelectedCountries[countryId]) {

        selectCountry = false;

        //Remove element from selection list
        delete this.currentlySelectedCountries[countryId];


    }
    else {
        this.currentlySelectedCountries[countryId] = targetCountryInfo;
    }



    this.animateCountrySelection(targetCountryInfo, selectCountry, true);



    if(selectCountry) {

        this.dispatchEvent({type:"select", country:this.formatISO2ForEBayCC(countryId)});
    }
    else {
        this.dispatchEvent({type:"deselect", country:this.formatISO2ForEBayCC(countryId)});
    }


    this.dispatchEvent({type:"selectionChanged", countries:this.formatISO2ForEBayCC(Object.keys(this.currentlySelectedCountries))});


};

Globe3D.prototype.animateCountryHeight = function(countryInfoObject, oldHeight, desiredHeight, animate, timeMultiplier, yoyo, delay, animTime, interrupt) {

    var _this = this;

    timeMultiplier = (timeMultiplier ? timeMultiplier : 1.0);
    yoyo = (yoyo === undefined ? false : yoyo);
    delay = (delay ? delay: 0);
    animTime = (animTime ? animTime : this.transitionTimeMS);
    interrupt = (interrupt === undefined ? true : interrupt);

    //If no old color provided, pull current height
    oldHeight  = oldHeight ? oldHeight : countryInfoObject.depth;

    var updateExtrude = function () {

        var _interpolatedObj = this;
        _this.extrudeAll(countryInfoObject, _interpolatedObj.depth);

    };

    this.propertyAnimator.startAnimation(countryInfoObject.id, 'extrude',
        {//From
            //countryObj: countryInfoObject,
            depth: oldHeight
        },
        {//To
            depth: desiredHeight
        }, updateExtrude, null, (animate ? (animTime * timeMultiplier) : 10), delay, TWEEN.Easing.Cubic.InOut, yoyo, interrupt);


};


Globe3D.prototype.animateCountrySelection = function(countryInfoObject, select, animate, timeMultiplier, yoyo, delay) {

    var desiredHeight = select ? this.countryDepthSelected : this.countryDepthBase;

    var newColor;

    var oldColor;

    if(select) {

        oldColor = countryInfoObject.color;
        newColor = countryInfoObject.selectedColor;

    }
    else {
        oldColor = countryInfoObject.selectedColor;
        newColor = countryInfoObject.color;

    }
    this.animateCountryHeight(countryInfoObject, null, desiredHeight, animate, timeMultiplier, yoyo, delay);
    this.animateCountryColor(countryInfoObject, oldColor, newColor, animate, timeMultiplier, yoyo, delay);


};

//Enable or disable marker selection
Globe3D.prototype.enableMarkerSelection = function(enableBoolean) {
    this.interactionConfig.markerSelection = enableBoolean;

    if(enableBoolean) {
        this.backgroundOpacity = 1.0;

    }
    else {
        this.backgroundOpacity = this.inputBackgroundOpacity;
        this.skyBox.material.opacity = this.backgroundOpacity;
        this.skyBox.material.needsUpdate = true;
    }
};

//Enable or disable country selection
Globe3D.prototype.enableCountrySelection = function(enableBoolean) {
    this.interactionConfig.countrySelection = enableBoolean;
};

Globe3D.prototype.setGlobeColor = function(newColorString, newOpacity) {

    var oldColor  = this.earthSphere.material.color;
    var oldOpacity = this.earthSphere.material.opacity;

    var newColor = new THREE.Color(newColorString);
    //If no opacity passed in, just set to the old opacity
    newOpacity = newOpacity || oldOpacity;

    var _this = this;
    var updateColor = function() {

        var _interpolatedObj = this;

        _this.earthSphere.material.color.setRGB(_interpolatedObj.r, _interpolatedObj.g, _interpolatedObj.b);
        _this.earthSphere.material.ambient.setRGB(_interpolatedObj.r, _interpolatedObj.g, _interpolatedObj.b);
        _this.earthSphere.material.opacity = _interpolatedObj.opacity;

    };

    this.propertyAnimator.startAnimation('globe', 'color',
        {//From
            r: oldColor.r,
            g: oldColor.g,
            b: oldColor.b,
            opacity: oldOpacity
        },
        {//To
            r: newColor.r,
            g: newColor.g,
            b: newColor.b,
            opacity: newOpacity
        }, updateColor, null, this.transitionTimeMS * 2, 0, TWEEN.Easing.Cubic.InOut, false, true);

};

Globe3D.prototype.setCameraZoomLevel = function(targetZoomLevel) {


    if(targetZoomLevel <= 0) {
        console.log("Warning: Attempted to Set Globe Camera Zoom level to Zero or Negative value: " + targetZoomLevel);
        return;
    }
    var _this = this;


    //Cancel any camera movement
    this.cameraControls.cancelMovement();

    var updateCamZoom = function() {

        var _interpolatedObj = this;
        _this.cameraControls.setZoom(_interpolatedObj.zoomLevel);


    };

    this.propertyAnimator.startAnimation("camera", "zoom",
        {//From
            zoomLevel: _this.cameraControls.getZoom()
        },
        {//To
            zoomLevel: targetZoomLevel
        }, updateCamZoom, null, this.transitionTimeMS * 2, 0, TWEEN.Easing.Cubic.InOut, false, true);


};


Globe3D.prototype.interact = function(interactionType) {

    if(!this.projector) {
        console.log("no projector");
        return;
    }
    var vector = new THREE.Vector3( this.mouse.x, this.mouse.y, 1 );

    this.projector.unprojectVector( vector, this.camera );
    // var raycaster = new THREE.Raycaster( _this.camera.position, vector.sub( _this.camera.position ).normalize(), this.NEAR, this.FAR );

    this.raycaster.set(this.camera.position, vector.sub( this.camera.position ).normalize());

    var octreeResults = this.octree.search( this.raycaster.ray.origin, this.raycaster.far, true, this.raycaster.ray.direction );
    var intersects = this.raycaster.intersectOctreeObjects( octreeResults );


    //Sort Octtree intersections by distance
    intersects.sort(function(a,b){

        return a.distance - b.distance;
    });

    //Debug print out of intersection list
    //    var nameList = "";
    //    for(var j=0;j<intersects.length; j++) {
    //        nameList += intersects[j].object.name + ":" + intersects[j].distance.toFixed(2) + ",";
    //    }
    //    if(nameList !== "") {
    //        console.log(nameList);
    //    }


    //var intersects = _this.raycaster.intersectObjects( _this.globeGroup.children , true);

    //var objects = _this.countryGroup.children;



    if ( intersects.length > 0 ) {



        this.INTERSECTED = intersects[ 0 ].object;

        if(this.INTERSECTED.userData.markerId && this.interactionConfig.markerSelection) {


            this.globeMarkers.interact(this.INTERSECTED, interactionType);
        }
        else if (interactionType === "tap") {

            if(this.countryTable[this.INTERSECTED.name] && this.interactionConfig.countrySelection && this.currentlyEnabledCountries[this.INTERSECTED.name]) {

                this.toggleCountrySelection(this.INTERSECTED.name);

                //Testing warp transition
                //this.transitionGlobe("flat");

            }
        }
        else if (interactionType === "pressAndHold") {

            if(this.countryTable[this.INTERSECTED.name] && this.interactionConfig.countrySelection && this.currentlyEnabledCountries[this.INTERSECTED.name]) {


                this.dispatchEvent({type: "pressAndHold", country: this.formatISO2ForEBayCC(this.INTERSECTED.name)});

            }
        }

    }
    else {
        this.INTERSECTED = null;
    }
};

Globe3D.prototype.animate = function(deltaTMS) {


    //Custom camera movement function
    //this.moveCameraLinear();

    this.propertyAnimator.update(deltaTMS);


    this.globeMovement.yAxisVelocity = this.globeMovement.defaultYRot + (this.globeMovement.yAxisVelocity * this.globeMovement.dampening);


    var distFromMaxXRot = (this.globeMovement.maxXRot - Math.abs(this.globeGroup.rotation.x));

    this.globeMovement.xAxisVelocity = this.globeMovement.xAxisVelocity * this.globeMovement.dampening;

    if(this.rotateGlobeFlag) {
        this.globeGroup.rotation.y += this.globeMovement.yAxisVelocity;
        this.globeGroup.rotation.x += (this.globeMovement.dampening * this.globeMovement.xAxisVelocity);
    }

    this.clouds.rotation.y += 0.0003;

    //this.markerGroupCSS.rotation.y += 0.0003;
    //Moving geometry means we need to rebuild the oct tree
    this.octree.rebuild();


    this.globeMarkers.update(deltaTMS);
    //this.globeArcs.update(deltaTMS);


    //this.interact();

};

Globe3D.prototype.render = function() {

    // actually render the scene

    if(this.renderer) {

        this.scene.overrideMaterial = this.postProcessingConfig.depthMaterial;
        this.renderer.render( this.scene, this.camera, this.postProcessingConfig.depthTarget );

        //this.renderer.shadowMapCullFace = THREE.CullFaceNone;

        //this.renderer.clear(false, true, false);

        this.scene.overrideMaterial = null;
        this.composer.render();



        //this.renderer.render(this.scene, this.camera);

        if(this.octree.objectsDeferred.length > 0) {
            this.octree.update();
        }

        this.globeMarkers.render(this.camera);

    }


};

Globe3D.prototype.tick = function(timeStampMS) {

    var _this = this;

    function localTick(timeStampMS) {


        var deltaTMS = timeStampMS  - this.lastTimeStampMS;
        this.lastTimeStampMS = timeStampMS;
        _this.animate(deltaTMS);
        _this.cameraControls.update(deltaTMS);
        _this.render(deltaTMS);

        window.requestAnimationFrame(localTick);

    }

    return localTick;

};


Globe3D.prototype.init = function(countryBordersDataPath, countryCentersDataPath, initCallbackFunc) {
    var _this = this;


    $.when(	$.getJSON(countryBordersDataPath), $.getJSON(countryCentersDataPath)).then(function(countryBordersData, countryCentersData){

        _this.countryBordersData = countryBordersData[0];
        _this.countryCentersData = countryCentersData[0];


        _this.initD3();
        _this.initWebGL();

        _this.createScene(_this.countryBordersData, _this.countryCentersData);


        _this.initProstprocessing();

        _this.initEventListeners();


        if(initCallbackFunc) {
            initCallbackFunc.apply(_this, null);
        }

        _this.dispatchEvent({type:"init"},{});

        window.requestAnimationFrame(_this.tick());

    });
};

Globe3D.prototype.initEventListeners = function() {

    var _this = this;



    function onTap ( event ) {

        event.preventDefault();

        var relativeX = event.gesture.touches[0].clientX - event.currentTarget.offsetLeft;
        var relativeY = event.gesture.touches[0].clientY - event.currentTarget.offsetTop;
        //console.log(relativeX + "," + relativeY+ ",w:" + _this.WIDTH + ",h:" + _this.HEIGHT);

        _this.mouse.x = ( relativeX/ _this.WIDTH ) * 2 - 1;
        _this.mouse.y = - ( relativeY / _this.HEIGHT ) * 2 + 1;

        _this.interact("tap");
    }

    function onHold(event) {

        if(event.gesture.deltaTime && event.gesture.deltaTime < 750) {
            return;
        }



        event.preventDefault();
        event.gesture.stopDetect();



        var relativeX = event.gesture.touches[0].clientX - event.currentTarget.offsetLeft;
        var relativeY = event.gesture.touches[0].clientY - event.currentTarget.offsetTop;
        //console.log(relativeX + "," + relativeY+ ",w:" + _this.WIDTH + ",h:" + _this.HEIGHT);

        _this.mouse.x = ( relativeX/ _this.WIDTH ) * 2 - 1;
        _this.mouse.y = - ( relativeY / _this.HEIGHT ) * 2 + 1;



        _this.interact("pressAndHold");



    }

    function onWindowResize() {
        _this.WIDTH = _this.domNode$.width();
        _this.HEIGHT = _this.domNode$.height();

        _this.camera.aspect = _this.WIDTH / _this.HEIGHT;



        if(_this.postProcessingConfig.effectFXAA) {_this.postProcessingConfig.effectFXAA.uniforms['resolution'].value.set(1 / (_this.WIDTH), 1 / (_this.HEIGHT)); }
        _this.postProcessingConfig.effectSSAO.uniforms[ 'size' ].value.set(
            _this.WIDTH*_this.postProcessingConfig.superSamplingMultiplier, _this.HEIGHT*_this.postProcessingConfig.superSamplingMultiplier );

        if(_this.postProcessingConfig.effectBokeh) {_this.postProcessingConfig.effectBokeh.uniforms[ 'aspect' ] = _this.camera.aspect; }

        _this.camera.updateProjectionMatrix();

        _this.composer.setSize(
            _this.WIDTH*_this.postProcessingConfig.superSamplingMultiplier , _this.HEIGHT*_this.postProcessingConfig.superSamplingMultiplier);
        _this.renderer.setSize( _this.WIDTH , _this.HEIGHT );

        _this.globeMarkers.resizeRenderer(_this.WIDTH, _this.HEIGHT);
    }


    var origYRot = 0;
    var origXRot = 0;
    var oldUserYRot = 0;
    var newUserYRot = 0;

    function onDragEvent(ev) {

        ev.gesture.preventDefault();

        switch(ev.type) {
            case 'dragstart':
                origYRot = _this.globeGroup.rotation.y;
                origXRot = _this.globeGroup.rotation.x;
                break;
            case 'dragright':
            case 'dragleft':



                oldUserYRot = newUserYRot;
                var amount = (ev.gesture.deltaX/_this.WIDTH);

                _this.globeGroup.rotation.y = origYRot + (amount*2);
                newUserYRot = _this.globeGroup.rotation.y;

                //_this.octree.rebuild();


                break;

            case 'dragup':
            case 'dragdown':


                //oldUserYRot = newUserYRot;
                var amount = (ev.gesture.deltaY/_this.HEIGHT);

                _this.globeGroup.rotation.x = origXRot + (amount*2);

                _this.globeGroup.rotation.x = constrainVal(_this.globeGroup.rotation.x, -Math.PI/4, Math.PI/4);
                //_this.octree.rebuild();
                //newUserYRot = _this.globeGroup.rotation.y;


                break;
            case 'dragend':
                // more then 50% moved, navigate
                _this.globeMovement.yAxisVelocity = 10*(newUserYRot - oldUserYRot);

                oldUserYRot = newUserYRot = 0;

                break;
        }


    }


    function constrainVal(v, min, max){
        if( v < min )
            v = min;
        else
        if( v > max )
            v = max;
        return v;
    }

    function handleMWheel( delta ) {

        var targetToCameraVec = new THREE.Vector3();
        targetToCameraVec.subVectors(_this.camera.position, _this.cameraLookAt);

        var distanceFromTarget = targetToCameraVec.length();
        targetToCameraVec = targetToCameraVec.normalize();

        var targetDist = distanceFromTarget + (delta * -15);
        targetDist = constrainVal( targetDist, _this.globeRadius + 50,  _this.globeRadius + 400);

        targetToCameraVec.multiplyScalar(targetDist);

        _this.cameraPos.set(_this.cameraLookAt.x + targetToCameraVec.x,
                            _this.cameraLookAt.y + targetToCameraVec.y,
                            _this.cameraLookAt.z + targetToCameraVec.z);


        //Flag animate loop to update camera position
        _this.animateCamera = true;

    }

    function onTransform(event) {


    }

    function onMouseWheel( event ){

        event.preventDefault();
        event.stopPropagation();

        var delta = 0;

        if ( event.originalEvent.wheelDelta ) { // WebKit / Opera / Explorer 9

            delta = event.originalEvent.wheelDelta / 120;

        } else if ( event.originalEvent.detail ) { // Firefox

            delta = - event.originalEvent.detail / 3;

        }

        handleMWheel(delta);
        event.returnValue = false;
    }



    this.domNode$.hammer({
            tap_max_touchtime : 200,
            tap_max_distance  : 5
        }).on('tap', onTap);

    this.domNode$.hammer({}).on('hold', onHold);

    window.addEventListener( 'resize', onWindowResize, false );

	$(window).on('touchstart touchend touchmove', function(ev) { ev.preventDefault();});

};



