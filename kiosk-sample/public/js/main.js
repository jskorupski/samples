var debug = true;
var socket = io.connect('http://127.0.0.1:3001');
var sessionid = "NONE";
var kioskID = "NONE";
var version;
var isOffline = false;

// loader canvas
var cl = new CanvasLoader('initLoader');
cl.setColor('#696969'); // default is '#000000'
cl.setDiameter(200); // default is 40
cl.setDensity(30); // default is 40
cl.setRange(0.7); // default is 1.3
cl.setSpeed(1); // default is 2
cl.setFPS(60); // default is 24
cl.show(); // Hidden by default
setTimeout(function(){
    $('#initLoader').css('opacity','0');
},500);
setTimeout(function(){
    $('#initLoader').css('display','none')
},1000);


// anon cb return jquery
var letsdothis = (function () {

    if(!debug) $('body').addClass('debug');

    // sub pub for callbacks
    var subs = {};

    $.subpub = function (id) {
        var callbacks,
            method,
            sub = id && subs[id];
        if (!sub) {
            callbacks = $.Callbacks();
            sub = {
                _pub: callbacks.fire,
                _sub: callbacks.add,
                _unsub: callbacks.remove
            };
            if (id) {
                subs[id] = sub;
            }
        }
        return sub;
    };

    // attract-o-mation for sound and lights going off at 3 minute intervals until someone interacts with the screen
    var _attractomation = function(){
        // store interval, timer and sound outside inner scope
        this._interval; this._timeout;
        this._snd = new Audio("../media/sound/pinballsound.wav");
        this.startAttract();
    }

    _attractomation.prototype.startAttract = function(){
        var _this = this;
        console.log('********** triggering attract-o-mation');
        // start main loop
        _this._interval = setInterval(function(){
            //lights and sound on
            _this._snd.play();
            $.subpub('lights')._pub({cmd:'effect'});
            // to set lights back to attract
            _this._timeout = setTimeout(function(){
                $.subpub('lights')._pub({cmd:'attract'});
            },6000);
        },9999999);
    }

    _attractomation.prototype.stopAttract = function(){
        // stop the sound, kill the loops
        this._snd.pause();
        clearInterval(this._interval);
        clearTimeout(this._timeout);
    }    
    
    

    // reset timer 
    var resetTimer;
    var resetTimeMS = 100000;
    var doReset = function () {
        if(!debug){
            clearTimeout(resetTimer);
            resetTimer = setTimeout(function () {
                $.subpub('lights')._pub({cmd:'attract'});
                console.log('resetting kiosk');

                //Trigger a fake button press in order to forward this event to our
                //centralized logging code (which looks at the source of the event
                $('#idlereset_btn').trigger('tap', 'fake');
                
            }, resetTimeMS);
        }
    };
    $.subpub('reset')._sub(function (d) {
        console.log('resetting timeout');
        doReset();
    });

    // outside scope transition function
    var Trans = function (d, prevId) {
        var curid = d[0],
            //previd = $('.page:visible').attr('id'),
            trans = $('.page:visible').attr('data-transition'),
            offset = 1080;
        $.subpub('transition')._pub({id: d[0], prevId: prevId[0]});
        console.log("previous page: " + prevId[0] + ", new page: " + d[0]);
        $('.page').map(function () {
            var item = ($(this).attr('id') !== curid) ? $(this).css('left', offset).removeClass('visible') : $(this).css('left', 0).addClass('visible');
        });
    };

    // main object
    var Main = function (opts, cb) {
        var _this = this;
        if (opts) _this.opts = opts;
        _this.opts.tmpl = {};
        _this.opts.siteData = {};
        _this.selectedProduct = {};
        _this.productsTotal = [];
        _this.lastViewedProduct = [];
        _this.addedNewItemToCart = false; //Total Hack: A object-level global to signal when we added something to cart
                                           //We need this for the logger to know what happened to the cart
                                           //Logging code will clear this back to false when it has been viewed

        // this is the totally wrong place to do this. overloading push method to update the cart data attr
        _this.productsTotal.push = function (){
            for( var i = 0, l = arguments.length; i < l; i++ ) { this[this.length] = arguments[i]; }
            var length = this.length;
            setTimeout(function(){
                $('.cart_btn').each(function(){
                    $(this).attr('data-length',length);
                })
            },500);
            return length;
        };

        //App vars for keeping track of last iscroll movements
        //to prevent accidental taps on touchfoil while dragging finger
        _this.lastScrollTime = 0;
        _this.scrollTapIgnoreTimeMS = 300;

        // cb to instance outside, returns the same context for reference
        if (_this.init) _this.init(function () {
            if (cb) cb.call(_this, null);
        });
    };

    Main.prototype.init = function (cb) {
        var _this = this;
        console.log('-- init: ' + this.opts.title);
        // do loads
        var loaders = [];

        //Initialize logging manager
        _logger.init(this.opts.port, _kinect);

        _this._attractomation = new _attractomation();

        //Initialize Kinect Tracker
        _kinect.init(_logger);

        // deffer all methods on load
        loaders.push(this.loadSiteData());
        loaders.push(this.loadSiteProducts());
        loaders.push(this.loadTemplates());
        loaders.push(this.bindAddress());
        loaders.push(this.bindLiveClicks());

        socket.on('init', function (data) {
            var session = socket.emit('connection',{});
            sessionid = session.socket.sessionid;

            //LOGGING CODE - START
            _logger.setSessionId(sessionid);
            //LOGGING CODE - END

            kioskID = data.kioskID.toLowerCase();

            // Normalize KioskID names to production code
            // names for mobile site tracking
            if(kioskID === "eb18th") {
                kioskID = 'wes';
            }
            else if(kioskID === "ebgans") {
                kioskID = 'gan';
            }
            else if(kioskID === "ebspri") {
                kioskID = 'spr';
            }
            else if(kioskID === "eborch") {
                kioskID = 'orc';
            }

            var data = data.init[0];
            if(typeof version == 'undefined') version = data;
            console.log('-- sockets connected');
            if(version !== data){
                setTimeout(function(){
                    window.location.href = 'http://localhost:3001/#';
                    location.reload(true);
                },2000);    
            }
        });

        socket.on('offline', function (data){
            //$.address.value('offline');
            isOffline = true;
            console.log('OFFLINE');
            //$('#cart .buttons .btn[data-link="order"]').addClass('disabled');
        });
        socket.on('online', function (data){
            isOffline = false;
            //$('#cart .buttons .btn[data-link="order"]').removeClass('disabled');
        });

        $.subpub('lights')._sub(function (d) {
            var onoff = function(val){
                return $.getJSON('/lights?cmd='+val,function(r){
                    return ret = r;
                });
            };
            var ret = onoff(d.cmd);
        });

        $.when.apply(this, loaders).done(function () {
            console.log('** done loading **');
            // render all the data
            _this.renderPages(_this.opts, function () {
                // bind controls
                setTimeout(function(){
                    _this.bindControls.init.call(_this, null);
                    $.subpub('lights')._pub({cmd:'attract'});
                },500);
                // bind hash nav
                $.subpub('address')._sub(function (d) {
                    var prevId = (typeof _this.opts.curPage === 'undefined') ? [null] : _this.opts.curPage;
                    _this.opts.curPage = d;
                    new Trans(d, prevId);

                    //LOGGING CODE - START
                    if(prevId[0] != null && prevId[0] !== 'passive') {

                        _logger.timer.endPageTimer(prevId[0], 0);
                    }
                    if(prevId[0] === 'passive') {

                        _logger.timer.startSessionTimer();
                    }
                    _logger.timer.setCurrentPage(d[0]);
                    if(prevId[0] != null) {
                        _logger.timer.startPageTimer(d[0]);
                    }

                    //If we are leaving product detail page, then end product timer
                    if(prevId[0] === "product_detail") {

                        var viewTimeS = _logger.timer.endProductTimer(_this.selectedProduct.upc, 0);
                        _logger.logProductView(_this.selectedProduct.upc,
                            _this.selectedProduct.style, _this.selectedProduct.color, _this.selectedProduct.colorDescription, _this.selectedProduct.size,
                            _this.selectedProduct.price, 1, viewTimeS);

                    }

                    //If we are going to cart pagethen stop product timer here
                    if(d[0] === 'cart') {

                        //Get cart data
                        var cartViewCount = _logger.timer.getPageViewCount('cart');
                        var cartTotalTimeS = _logger.timer.peakPageTimer('cart', true);
                        var totalCartPrice = 0;
                        var cartContentArray = [];
                        var totalCartCount = 0;
                        for(var i=0; i<_this.productsTotal.length; i++) {

                            totalCartPrice += (_this.productsTotal[i].quantity * parseFloat(_this.productsTotal[i].retail, 10));
                            totalCartCount += _this.productsTotal[i].quantity;
                            cartContentArray.push({
                                productId: _this.productsTotal[i].upc,
                                style: _this.productsTotal[i].style,
                                color: _this.productsTotal[i].color,
                                colorDescription: _this.productsTotal[i].color_description,
                                size: _this.productsTotal[i].size,
                                price: parseFloat(_this.productsTotal[i].retail, 10),
                                qty: _this.productsTotal[i].quantity,
                                title: _this.productsTotal[i].description
                            });

                        }

                        if(_this.addedNewItemToCart) {

                            //Now log adding a new item to cart:
                            _this.addedNewItemToCart = false;

                            _logger.logCartEvent('add', _this.selectedProduct.upc,  _this.selectedProduct.style,
                                _this.selectedProduct.color, _this.selectedProduct.colorDescription, _this.selectedProduct.size,
                                _this.selectedProduct.price, 1, cartViewCount, cartTotalTimeS, totalCartPrice,
                                totalCartCount, cartContentArray, null);

                        }
                        else {
                            //Cart just viewed
                            _logger.logCartEvent('viewed', null, null, null, null, null, null, null, cartViewCount, cartTotalTimeS, totalCartPrice,
                                totalCartCount, cartContentArray, null);
                        }
                    }
                    //LOGGING CODE - END
                });
                $.address.value(_this.opts.defaultPage);
            });

            // cb to constructor
            if (cb) cb();
        });
    };
    Main.prototype.randomBg = function(el){
        var _this = this;
        var rand = Math.ceil(Math.random()*3);
        $(el).removeClass('randbg1').removeClass('randbg2').removeClass('randbg3').addClass('randbg'+rand);
    };
    // lift controls then bind to themselves after render
    Main.prototype.bindControls = {
        init: function () {         
            var _this = this;
            _this.selectedProduct = {};
            $('[data-control="overlay"]').hide();
            $('[data-control="scroll_overlay"]').hide();
            for (control in _this.bindControls) {
                // bind to anything with a data-control attr
                var _control = $('[data-control=' + control + ']');
                // grab the data-options from the control
                var _options = _control.attr('data-options');
                
                // apply the jquery selector and data attr as json to the control name below
                if (control !== 'init') _this.bindControls[control].apply(_this, [
                	_control, (_options) ? JSON.parse(_options.replace(/"/g, '\"')) : {}
                ]);                
            }
            console.log('binding all controls');
        },
        video: function (obj, options) {

            var _video = $('video',obj)[0];
            function playAgain(e) {
                _video.currentTime = 0.1;
                _video.play();
                console.log('video stopped, playing again')
            }
            _video.addEventListener('ended', playAgain, false);

            console.log('video control init')
        },
        order: function(obj, options){
            var _this = this;

            $.subpub('address')._sub(function (d) {
                if (d[0] == 'order') {
                    _this.randomBg('#order');
                    if(isOffline) {

                        //Hide both info and retry messages, show offline message
                        $('#order').find('.message').hide().end().find('.again').hide().end().find('.notagain').hide().end().find('.offlineOrderMessage').show();
                        //We don't render any order control content, or bind any controls

                        //Clear out any existing UI elements that may be in the data-control DIV
                        $(obj).empty();
                    }
                    else {
                        if(typeof d[1] !== 'undefined'){
                            //LOGGING CODE - START
                            _logger.timer.incrementEventCounter('smsResendAction');
                            //LOGGING CODE - END
                            $('#order').find('.message').show().end().find('.again').show().end().find('.notagain').hide().end().find('.offlineOrderMessage').hide();
                        } else {
                            $('#order').find('.message').show().end().find('.notagain').show().end().find('.again').hide().end().find('.offlineOrderMessage').hide();
                        }
                        $(obj).html($.render.order_control({}));
                        _this.bindControls['qrcode'].call(_this, $('[data-control=qrcode]'));
                        _this.bindControls['phone'].call(_this, $('[data-control=phone]'));
                    }


                }
            });
        },
        cart: function(obj, options){
            var _this = this;
            console.log('cart init');
            var cart_scroll = new iScroll('cart_wrapper', {
                vScroll: true,
                hScroll: false,
                bounce: true,
                bounceLock: false,
                vScrollbar: false,
                fadeScrollbar: false,
                desktopCompatibility: true,
                onScrollMove: function() {
                    _this.lastScrollTime = (new Date()).getTime();
                }
                //onScrollEnd: function() {
                //}
            });
            $.subpub('address')._sub(function (d) {
                if (d[0] == 'cart') {
                    _this.randomBg('#cart');
                    if(_this.productsTotal.length){
                        $('#cart .buttons').removeClass('hidden');
                        $('#cart').find('#noitems').hide().end().find('.buttons').show();

                        $(obj).empty().html($.render.cart_item(_this.productsTotal));

                        $.map(_this.productsTotal,function(e,i){
                            if(e.img.length < 1){
                                $.getJSON('/img?id='+e.style+'_'+e.color+'&cart=true',function(d){
                                    $.map(d,function(img){
                                        if(/_S.png/.test(img)){
                                            $('.cart #'+e.upc+' .img').css('background-image','url("../img/product/cart/'+img+'")');
                                        }
                                    })
                                })
                            }
                        });
                        $('> div', obj).each(function(){
                            var quant = parseInt($('.quantity',this).attr('data-quant'));
                            var price = parseInt($('.price',this).attr('data-price'));
                            $('.total_price span',this).text(quant * price);   
                        });
                        setTimeout(function () {
                            cart_scroll.refresh();
                        }, 0);
                    } else {
                        $('#cart').find('#noitems').show();
                        $('#cart .buttons').addClass('hidden');
                    }
                }
            });
            $(obj).hammer().on('tap', '.inc', function (e) {
                var _obj = $(this).parents('.content').parent();
                var _objId = _obj.attr('id');
                var _dataObj = $.grep(_this.productsTotal, function(e) { return e.upc == _objId });
                var _quant = $('.quantity',_obj);
                var _num = $('.num',_quant);
                var newquant;
                if($(this).hasClass('up')){
                    newquant = parseInt(_num.text()) + 1;
                    _num.text(newquant);
                    $('.quantity',_obj).attr('data-quant',newquant);
                    _dataObj[0].quantity = newquant;
                } else {
                    newquant = parseInt(_num.text());
                    if(newquant > 1){
                        newquant = newquant - 1; 
                        _num.text(newquant);
                        $('.quantity',_obj).attr('data-quant',newquant);
                        _dataObj[0].quantity = newquant;
                    }
                }
                var price = parseInt($('.price',_obj).attr('data-price'));
                $('.total_price span',_obj).text(newquant * price);

            }).on('tap','.remove',function(e){
                var _obj = $(this).parents('.content').parent();
				if(!_obj.hasClass('outsie')) {					// don't kill twice
					_obj.addClass('outsie');						// marked for DEATH
					var id = _obj.attr('id');
					console.log(_this.productsTotal.length);
					if(_this.productsTotal.length != 0){
						if(_this.productsTotal.length == 1){
							$('#cart .buttons').addClass('hidden');
							$('#noitems').show();
						}

						$.map(_this.productsTotal,function(e,i){
							if(typeof e == 'object' && e.upc == id){


                                //LOGGING CODE - START
                                //Get cart data
                                var cartViewCount = _logger.timer.getPageViewCount('cart');
                                var cartTotalTimeS = _logger.timer.peakPageTimer('cart', true);
                                var totalCartPrice = 0;
                                var cartContentArray = [];
                                var totalCartCount = 0;
                                for(var j=0; j<_this.productsTotal.length; j++) {

                                    totalCartPrice += (_this.productsTotal[j].quantity * parseFloat(_this.productsTotal[j].retail, 10));
                                    totalCartCount += _this.productsTotal[j].quantity;
                                    cartContentArray.push({
                                        productId: _this.productsTotal[j].upc,
                                        style: _this.productsTotal[j].style,
                                        color: _this.productsTotal[j].color,
                                        colorDescription: _this.productsTotal[j].color_description,
                                        size: _this.productsTotal[j].size,
                                        price: parseFloat(_this.productsTotal[j].retail, 10),
                                        qty: _this.productsTotal[j].quantity,
                                        title: _this.productsTotal[j].description

                                    });

                                }

                                //Log cart deletion item before deleting item from cart


                                _logger.logCartEvent('delete', _this.productsTotal[i].upc, _this.productsTotal[i].style, _this.productsTotal[i].color, _this.productsTotal[i].color_description,
                                    _this.productsTotal[i].size, parseFloat(_this.productsTotal[i].retail, 10), _this.productsTotal[i].quantity, cartViewCount, cartTotalTimeS, totalCartPrice,
                                    totalCartCount, cartContentArray, null);

                                //LOGGING CODE - END


								_this.productsTotal.splice(i,1);
								_this.productsTotal.push();
								_obj.css({
									opacity:'0',
									'max-height': '0px',
                                    'margin-top': '0px',
                                    'margin-bottom': '0px'
								});
								// Remove from DOM after animation finishes
								// to make sure it doesn't interfere with UI events
								setTimeout(function() {
                                    _obj.remove();
                                    //Tell iscroll that we have resized the DIV
                                    setTimeout(function () {
                                        cart_scroll.refresh();
                                    }, 0);
                                }, 700);

							}
						});
					}
				}
            })
        },
        qrcode: function(obj){
            var _this = this;
            var url = buildUrl('http://kstexttest.herokuapp.com/?', $.param(_this.selectedProduct));
            $(obj).append($('<div class="qr"></div>').append($('<img />').attr('src','/qr?bcid=qrcode&eclevel=L&text='+url)));
        },
        phone: function (obj, options) {
			var _this = this;


			// close over some frequently referenced objects
			var _topItem = obj.html($.render.phone_control({}));
			_topItem.addClass("showNumber");
			var numfield = _topItem.find('.number');		// phone number display field
			var numfieldP = _topItem.find('.numberp');	// obscured phone field

			// get cleaned version of current phone text
			function getNum() {
				var cur = numfield.attr("value");
				return cur.replace(/-/g,'');
			}

			// replace the current phone text, inserting dashes where necessary
			function setNum(newNum) {
				// put the same text into both the obscured and non-obscured fields
				var dashed = newNum.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
				numfield.attr("value", dashed);
				numfieldP.attr("value", dashed);
			}

			function validNum(num) {
				var good = true;
				var reg = /\d{10}/;
				var good = reg.test(num);
				if(good) {
					_topItem.removeClass("badNum");
				} else {
					_topItem.addClass("badNum");
				}
				return good;
			}

            _topItem.hammer().on('tap', '.input a.digit', function (e) {
                var _thisItem = $(this);
                var txt = getNum();
				var out = txt + _thisItem.text().trim();
                if(out.length <= 10){
				    setNum(out);
                }
            })
			.on('tap', '.input a.delete', function (e) {
				var out = getNum();
				out = out.substring(0, out.length - 1);
				setNum(out);
			})
			.on('tap', '.input a.enter', function (e) {
				var num = getNum().trim();

				if(validNum(num)) {
					_this.selectedProduct.phone = num;
					var id_list = [];
                    var _item;
					$.map(_this.productsTotal,function(e,i){
                        if(e.quantity > 1){
                            //e.upc = e.upc + '_' + e.quantity;
                            for(var i = 1;i<=parseInt(e.quantity);i++){
                                id_list.push(e.upc);
                            }
                        } else {
                            id_list.push(e.upc);
                            _item = e;
                        }
						
					});
					console.log(id_list);
					// var topush = {
					// ph: num,
     //                p: id_list.join(','),   
     //                s: kioskID,
     //                sessionid: sessionid
					// };
                    var topush = {
                        ph: num,
                        title: _item.title || _item.description,
                        color: _item.color_description,
                        size: _item.size
                    };
                    console.log($.param(topush));
					$.getJSON('/sms?' + $.param(topush),function(r){
						console.log(r);
                        if(r.sent == false) {

                        }
                        else {

                            //LOGGER CODE - START

                            //Get cart data
                            var cartViewCount = _logger.timer.getPageViewCount('cart');
                            var cartTotalTimeS = _logger.timer.peakPageTimer('cart', true);
                            var totalCartPrice = 0;
                            var cartContentArray = [];
                            var totalCartCount = 0;
                            for(var i=0; i<_this.productsTotal.length; i++) {

                                totalCartPrice += (_this.productsTotal[i].quantity * parseFloat(_this.productsTotal[i].retail, 10));
                                totalCartCount += _this.productsTotal[i].quantity;
                                cartContentArray.push({
                                    productId: _this.productsTotal[i].upc,
                                    style: _this.productsTotal[i].style,
                                    color: _this.productsTotal[i].color,
                                    colorDescription: _this.productsTotal[i].color_description,
                                    size: _this.productsTotal[i].size,
                                    price: parseFloat(_this.productsTotal[i].retail, 10),
                                    qty: _this.productsTotal[i].quantity,
                                    title: _this.productsTotal[i].description

                                });

                            }


                            _logger.logCartEvent('sms', null, null, null, null, null, null, null, cartViewCount, cartTotalTimeS, totalCartPrice,
                                totalCartCount, cartContentArray, num);

                            //Keep track of logged event for later Session Completion logging
                            _logger.timer.incrementEventCounter('smsSent');
                            //LOGGER CODE.END

                        }
					});
					$.address.value('done');
				}

			})
			.on('tap', '.input a.passToggle', function (e) {
				var btn = $(this);
				switch (btn.text()) {
					case "SHOW DIGITS":
						btn.text("HIDE DIGITS");
						_topItem.addClass("showNumber");
						break;
					default:
						btn.text("SHOW DIGITS");
						_topItem.removeClass("showNumber");
						break;
				}
			});
            $.subpub('address')._sub(function (d) {
                if (d[0] == 'order') {
                    $('.number').text('');
                }
            });
            console.log('phone control init')
        },
        color: function(obj){
            var _this = this;
            var color = obj.attr('data-color');
            var desc = obj.attr('data-desc');
            var id = obj.attr('data-id');

            var tmp = {'colors': []};

            if(color){
                color = color.split(',');
                for(var i = 0; i <= color.length; i++){
                    // var colorActive = (color[i] == _this.selectedProduct.color) ? true : false;
 
                    if(typeof color[i] !== 'undefined'){
                        tmp.colors.push({
                            color: color[i],
                            desc: desc[i],
                            id: id.toUpperCase(),
                            active: (color[i] == _this.selectedProduct.color) ? true : false
                        });
                    }
                }

                var fakeFirstTap = true;

                $(obj).html($.render.color_control(tmp))
                    .hammer().on('tap','.circle',function(e, fakeTapString){

                        console.log(_this.selectedProduct);
                        $('.circle',obj).removeClass('active');
                        var _thisColor = $(this).attr('data-color');
                        $(this).addClass('active');
                        $('.thumbs').find('div').hide().end().find('div[data-color="'+_thisColor+'"],div[data-id$="gif"]').each(function(){
                            $(this).show();
                        }).first().trigger('tap', 'fake');

                        // check on soldout status and split the color to see if any sizes of $(this) color are sold out
                        var _soldOutOnSize = $('[data-control="size"]').attr('data-soldout');
                        _soldOutOnSize = _soldOutOnSize.split(',');
                        $('[data-control="size"] .size div[data-size]').each(function(){
                            $(this).attr('data-soldout','false');
                        });
                        var tmpSoldout = $.map(_soldOutOnSize,function(e,i){
                            var split = e.split('_');
                            if(split[0] == _thisColor){
                                $('[data-control="size"] .size div[data-size="'+split[1]+'"]').attr('data-soldout','true');
                            }
                        });
                        // trigger the size selected again to refresh if the size of a different color has been sold out
                        $('[data-control="size"] .size div.active').trigger('tap', 'fake');

                        //LOGGING CODE - Start
                        if((fakeTapString !== 'fake') &&_this.selectedProduct.color !== $(this).attr('data-color')) {

                            //Stop product timer of previous product before switching
                            var viewTimeS = _logger.timer.endProductTimer(_this.selectedProduct.upc, 0);
                            _logger.logProductView(_this.selectedProduct.upc,
                                _this.selectedProduct.style, _this.selectedProduct.color, _this.selectedProduct.colorDescription,_this.selectedProduct.size,
                                _this.selectedProduct.price, 1, viewTimeS);


                            //Update selected product details:
                            //$('.txt span',obj).text($(this).attr('data-title'));
                            _this.selectedProduct.color = $(this).attr('data-color');

                            var actualItem = _this.findItem(_this.selectedProduct.style, _this.selectedProduct.color, _this.selectedProduct.size);
                            if(actualItem) {
                                _this.selectedProduct.colorDescription  = actualItem.color_description;
                                _this.selectedProduct.title  = actualItem.description;
                                _this.selectedProduct.upc = actualItem.upc;
                                _this.selectedProduct.price = parseFloat(actualItem.retail, 10);

                                _logger.timer.startProductTimer(_this.selectedProduct.upc);


                            }


                        }

                        //LOGGING CODE - End

                        //console.log(_this.selectedProduct);
                    });
                $('.circle.active',obj).trigger('tap', 'fake');
                setTimeout(function(){
                    $('.thumbs div').filter(':visible').first().trigger('tap', 'fake');
                },100)
            }
            
            console.log('color control init');
        },
        image: function(obj){
            var _this = this;
            $(obj).hammer().on('tap', '.thumbs div', function (e) {
                var id = $(this).attr('data-id');
                var large = $('.large img',obj);
                large.addClass('on');
                setTimeout(function(){
                    var limg = large.attr('src').split('/');
                    limg[limg.length -1] = id;
                    large.attr('src',limg.join('/'));
                },100);
                setTimeout(function(){
                    large.removeClass('on');
                },500)
            })
        },
        size: function(obj){
            var _this = this;

            var size = obj.attr('data-size');
            size = (size) ? size.split(',') : size;
            var tmp = [];
           
            var soldout = obj.attr('data-soldout');
            soldout = (soldout) ? soldout.split(',') : soldout;

            function toggleSoldout(isOn){
                if(isOn == 'true'){
                    $('#product_detail')
                        .find('[data-control="detail"] .cart_btn').addClass('disabled').end()
                        .find('.soldout').show().css('opacity','1');
                } else {
                    $('#product_detail')
                        .find('[data-control="detail"] .cart_btn').removeClass('disabled').end()
                        .find('.soldout').css('opacity','0');
                        setTimeout(function(){
                            $('#product_detail').find('.soldout').hide()
                        },500)
                }
            }

            var soldouttmp = [];
            if(soldout){
                $.map(soldout,function(e,i){
                    soldouttmp.push(e.split('_')[1]);
                })
            }
            console.log('sold out items');

            // reorder sizes by bashing it with loops until it conforms
            var order = ['U','XS','S','M','L','1','2','3','4','5','6','7','8','9','10','4/4S'];
            var sizeTmp = [];
            var allNumberSizes = true;
            if(typeof size == 'object'){
                $.each(order, function(i,val) {
                    $.each(size,function(si,sv){
                        if(val == sv) {
                            sizeTmp.push(val);
                            if(isNaN(val)) {
                                //If this size is not a number,
                                //then one of our sizes must be a letter
                                allNumberSizes = false;
                            }
                        }
                    });
                });
            }


            //Don't show size guide for iPhone 'sizes'/device types
            var findIphone = new RegExp('iphone', 'i');
            var forIphone = findIphone.test(_this.selectedProduct.title);

            //MAJOR DATA ASSUMPTION: Any item with only numbers for sizes is a Shoe, and therefore
            //we don't need a size guide (since the size guide doesn't have shoe sizes)

            var showSizeGuide = !(allNumberSizes || forIphone);
            //We pass the template renderer a flag telling whether to show the size guide or not

            $(obj).html($.render.size_control({
                size: sizeTmp,
                showSizeGuide: showSizeGuide,
                soldout: soldouttmp
            }));

            $(obj).hammer().on('tap', '.size div:not(:first-child):not([data-sizeguide])', function (e, fakeTapString) {
                var size = $(this)
                    .siblings(':not(.txt)').removeClass('active').end().addClass('active')
                    .attr('data-size');

                toggleSoldout($(this).attr('data-soldout'));

                if((fakeTapString !== 'fake') && size !== _this.selectedProduct.size) {


                    //LOGGING CODE - Start
                    //Stop product timer of previous product before switching
                    var viewTimeS = _logger.timer.endProductTimer(_this.selectedProduct.upc, 0);
                    _logger.logProductView(_this.selectedProduct.upc,
                        _this.selectedProduct.style, _this.selectedProduct.color,  _this.selectedProduct.colorDescription, _this.selectedProduct.size,
                        _this.selectedProduct.price, 1, viewTimeS);
                    //LOGGING CODE - End

                    //Update selected product data
                    _this.selectedProduct.size = size;
                    var actualItem = _this.findItem(_this.selectedProduct.style, _this.selectedProduct.color, _this.selectedProduct.size);
                    if(actualItem) {
                        _this.selectedProduct.title  = actualItem.description;
                        _this.selectedProduct.upc = actualItem.upc;
                        _this.selectedProduct.price = parseFloat(actualItem.retail, 10);

                        //LOGGING CODE - START
                        _logger.timer.startProductTimer(_this.selectedProduct.upc);
                        //LOGGING CODDE - END

                    }

                    console.log(_this.selectedProduct);
                }

            });

        },
        quant: function(obj){
            var _this = this;
            var quant = obj.attr('data-quant');
            $(obj).html($.render.quant_control({}))
            .hammer().on('tap', '.quant div:not(:first-child)', function (e) {
                var quant = $(this)
                    .siblings(':not(.txt)').removeClass('active').end().addClass('active')
                    .text();
                _this.selectedProduct.quantity = quant;
                console.log(_this.selectedProduct);
            })

        },
        detail: function (obj, options) {
            var _this = this;
            var curPage = 0;
            var curColor = 0;
            $(obj).hammer()
                .on('tap', '.btn', function (e) {
                    var itemText = $('.text .title', $(obj)).text().trim();
                    _this.selectedProduct.id = curPage;
                    _this.selectedProduct.title = itemText;
                    if($(this).hasClass('cart_btn') && !$(this).hasClass('disabled')){

                        var tmpBeforeRealData = _this.findItem(curPage, _this.selectedProduct.color, _this.selectedProduct.size);


                        var dupe = false;
                        $.map(_this.productsTotal,function(e,i){
                            if(typeof e == 'object'){
                                if(tmpBeforeRealData.upc == e.upc){
                                    _this.productsTotal[i].quantity = parseInt(_this.productsTotal[i].quantity) + 1;
                                    dupe = true;
                                }
                            }
                        });
                        if(!dupe){
                            tmpBeforeRealData.quantity = 1;
                            _this.productsTotal.push(tmpBeforeRealData);
                        }
                        //console.log(_this.productsTotal);
                    } else {
                        console.log("Can't tap yet!")
                    }

                });
            $.subpub('address')._sub(function (d) {
                if (d[1] && d[0] == 'product_detail') {
                    _this.randomBg('#product_detail');

                    curPage = d[1];
                    curColor = d[2];
                    var soldout = [];
                    var tmp = {};
                    // loop through all items, push all key vals into one object
                    $.map(_this.opts.siteProducts,function(e,i){
                        if(e.style == curPage){
                            for(key in e){
                                if(tmp[key] == undefined) tmp[key] = [];
                                // check for sold out items
                                if(key == 'soldout' && e[key] == "TRUE"){
                                    soldout.push(e.color+'_'+e.size);
                                }
                                tmp[key].push(e[key]);
                            }
                        }
                    });
                    // filter out unique items
                    for(key in tmp){
                        tmp[key] = tmp[key].getUnique();
                        if(tmp[key].length == 1 && tmp[key] !== 'color'){
                            tmp[key] = tmp[key][0]
                        }
                    }
                    // var imgs =
					$.getJSON('/img?id='+tmp.style+'&large=true',function(d){
						var result = false;
						if(d.length > 0) {
							function sorter(a, b) {				// sort an array based on num value of names
								function thumbNum(name) {			// extract the num value from thumbnail file name
									var nameParts = name.split("_");
									var order = 10000; // default order num in case we can't parse (at the end)
									if(nameParts.length == 5) {
										order = nameParts[3];
									}
									return order;
								}
								return thumbNum(a) - thumbNum(b);
							}
							result = d.sort(sorter);
						}
						return result;

//                        return (d.length > 0) ? d : false;
                    }).done(function(d){
                        tmp.img = d;
                        tmp.soldout = soldout.join(',');
                        tmp.color = (typeof tmp.color == 'object') ? tmp.color.join(',') : tmp.color;
                        // render it all
                        $(obj).html($.render.dynamic_detail(tmp));
                        setTimeout(function(){
                            $(obj).find('.size div[data-size="'+tmp.size[0]+'"]').addClass('active');
                        },500)
                        
                        _this.bindControls['color'].call(_this, $('[data-control=color]'));
                        _this.bindControls['size'].call(_this, $('[data-control=size]'));
                        _this.bindControls['quant'].call(_this, $('[data-control=quant]'));
                        _this.bindControls['image'].call(_this, $('[data-control=image]'));
                    });

                    //Set our selected product info
                    _this.selectedProduct.style = tmp.style;
                    _this.selectedProduct.color = curColor;
                    _this.selectedProduct.size  = tmp.size[0];

                    //Find upc of viewed item
                    var actualItem = _this.findItem(_this.selectedProduct.style, _this.selectedProduct.color, _this.selectedProduct.size);

                    if(actualItem) {
                        _this.selectedProduct.colorDescription  = actualItem.color_description;
                        _this.selectedProduct.title  = actualItem.description;
                        _this.selectedProduct.upc = actualItem.upc;
                        _this.selectedProduct.price = parseFloat(actualItem.retail, 10);

                    }

                    //LOGGING CODE - START
                    _logger.timer.startProductTimer(_this.selectedProduct.upc);
                    //LOGGING CODDE - END
                }
            });
        },
        thanks: function(obj, options){
            var _this = this;
            $.subpub('address')._sub(function (d) {
                if (d[0] == 'thanks') {
                    _this.randomBg('#thanks');
                }
            })
        },
        tray: function (obj, options) {
            var _this = this;
            var products = _this.opts.siteProducts;
            //products = Array.prototype.slice.call(products);
            
            $(obj).each(function (i, v) {
                var _options = JSON.parse($(v).attr('data-options'));

                var parentPage = $(v).parent('.page').attr('id');
                //products = products.sort(function (a, b) {return Math.random() - 0.5;});
                var tmp = [];
                var reg = new RegExp('/'+_options.tray_id+'/g');
                $.map(products,function(e,i){
                    if((e.tray * 1) == _options.tray_id || reg.test(e.tray)){ 
                        tmp.push({
                            img: e.img[0],
                            style: e.style,
                            color: e.color,
                            data: e
                        })
                    }
                });
                //var _slicenum = _options.count.split(',');
                //var tmp = tmp.slice(_slicenum[0],(_slicenum[0]*1)+(_slicenum[1]*1));

                // insert about button randomly into the tray
                tmp.splice(Math.floor(Math.random() * tmp.length), 0, {
                    data: 'btn_onehour.png',
                    item: 'about',
                    id: _options.insert_id
                });


                //Duplicate our item list for each carousel row, N times, where N -> numberOfSets
                //This way we have 'infinite' scrolling
                var expandedTmp = [];
                var numberOfSets = 1;
                for(var j=0; j < numberOfSets; j++) {
                    expandedTmp.push.apply(expandedTmp, tmp);
                }
                tmp = expandedTmp;


                $(v).html($.render.tray_control({
                    data: tmp
                }));
                var widthToSet = 0;

                var thisTray = $('.trayControlContent', v);


                setTimeout(function () {
                    
                    thisTray.children('div').each(function () {
                        var width = $(this)[0].clientWidth;
                        widthToSet += (width);
                    }).end().css('width', (widthToSet + 50) + 'px');
                    var scroll = new iScroll($(v).attr('id'), {
                        vScroll: false,
                        hScroll: true,
                        bounce: true,
                        bounceLock: false,
                        hScrollbar: false,
                        fadeScrollbar: false,
                        desktopCompatibility: true,
                        onScrollMove: function() {
                            _this.lastScrollTime = (new Date()).getTime();
                        }
                        //onScrollEnd: function() {
                        //}
                    });


                    //Place carousel position in middle of all sets, and
                    //set up variables for "swing" animation when we first show it

                    //Calculate width of each set of items (we have repeated sets in one carousel
                    var widthOfEachSet = widthToSet/numberOfSets;

                    //Find middle group of items as our reference point
                    var offsetNumber = Math.max(1, Math.floor(numberOfSets/2.0));


                    //Pick new scroll distance based on tray id's (1, 2, 3)
                    var scrollSwingDistance = (_options.tray_id * 600);

                    //Can't scroll before or after edges of tray content

                    var leftScrollBorder = Math.max(scrollSwingDistance, widthOfEachSet*(offsetNumber-1) - scrollSwingDistance);
                    var rightScrollBorder = Math.min((widthToSet - 1080), widthOfEachSet*offsetNumber);

                    var rangeScale = 1.0;
                    //Set range to 1 for full range from left to right side of tray content, othersize set as a fraction of total size

                    //Random distance from leftmost item when finished swinging/spinning
                    var finalOffsetFromFirstItem = leftScrollBorder + Math.floor(Math.random() * rangeScale * (rightScrollBorder-leftScrollBorder));

                    //Calculate final offset location for iScroll to move to
                    //Make sure we never have a negative offset location
                    var offsetLocation = Math.max(0, (widthOfEachSet*(offsetNumber-1)) + finalOffsetFromFirstItem - scrollSwingDistance);

                    //Old scroll location set method:
                    //thisTray.css('-webkit-transform', 'translate(-' + (offsetLocation) + 'px, 0px) scale(1) translateZ(0px)');

                    scroll.scrollTo(-offsetLocation, 0, 0);
                    function swing(d){

                        //Only do swing animation if we went from the passive video to the product browsing page
                        if(d.id == parentPage && d.prevId === 'passive'){
                            //Old scroll method:
                            //var x = Math.floor(new WebKitCSSMatrix(thisTray.css("-webkit-transform")).e);
                            //var xTo = x+300;
                            //thisTray.css('-webkit-transform', 'translate(0px, 0px)');
                            //thisTray.css('-webkit-transform', 'translate('+xTo+'px, 0px)');
                            //scroll.refresh();
                            //scroll.scrollTo(x, 0, 1300);

                            //New relative scroll:
                            //Used previously calculated swing distance, but move relatively
                            scroll.scrollTo(scrollSwingDistance, 0, 1500, true);
                        }
                    }

                    $.subpub('transition')._sub(swing);

                }, 500);
            });
            console.log('tray control init');
        },

        rotate: function (obj, options) {
            var intervals = [],
                time = 2000;
            $.map(obj, function (e, i) {
                var ii = 0,
                    max = $('div', e).length;
              
                function rot() {
                    ii++;
                    ii = (ii == max) ? 0 : ii;
                    $('>*', e).filter(':not(:nth-child(' + (ii + 1) + '))').hide().end().eq(ii).show();
                }
                var inter = setInterval(rot, time);
                intervals.push[inter];
            });
            console.log('rotate control init');
        },
        scroll_overlay: function(obj, options) {
            var _this = this;
            var overlay_iscroll = new iScroll('scroll_overlay_wrapper', {
                vScroll: true,
                hScroll: false,
                bounce: true,
                bounceLock: false,
                vScrollbar: false,
                fadeScrollbar: false,
                desktopCompatibility: true,
                onScrollMove: function() {
                    _this.lastScrollTime = (new Date()).getTime();
                }
                //onScrollEnd: function() {
                //}
            });

            $(document).hammer().on('tap', '[data-scroll-overlay]', function (e) {

                var now = (new Date()).getTime();
                //Block taps while scrolling
                if(now - _this.lastScrollTime > _this.scrollTapIgnoreTimeMS) {

                    var _item = $(this);
                    _item.addClass("ovActive");
                    _item.addClass("active");
                    var opt = JSON.parse(_item.attr('data-scroll-overlay'));
                    var contentId = opt.contentid;
                    obj.addClass(contentId);
                    if(contentId){
                        $(obj).find('.content').html($.render[contentId]({}));
                        setTimeout(function () {
                            overlay_iscroll.refresh();
                            overlay_iscroll.scrollTo(0,0,0);
                        }, 0);
                    }
                    // using visibility to show so we don't have to know what type of display it is
                    $(obj).css("visibility", "visible");

                    setTimeout(function(){
                        $(obj).css('opacity','1');
                    },0);
                }
                else {
                    console.log("Tap blocked");
                }
            });
            $('[data-control="scroll_overlay"]').hammer().on('tap', function (e) {
                $(obj).css('opacity','0');
                $(".ovActive").removeClass("ovActive");
                setTimeout(function(){
                    $(obj).css("visibility", "hidden")
                        .attr('class','page');
                },250);
            });

        },
        overlay: function(obj, options){
            var _this = this;

            $(document).hammer().on('tap', '[data-overlay]', function (e) {

                var now = (new Date()).getTime();
                //Block taps while scrolling
                if(now - _this.lastScrollTime > _this.scrollTapIgnoreTimeMS) {

                    var _item = $(this);
					_item.addClass("ovActive");
					_item.addClass("active");
                    var opt = JSON.parse(_item.attr('data-overlay'));
                    var toswitch = opt.imgid;
                    obj.addClass(toswitch);
                    if(toswitch){
                        $(obj).find('.content img').attr('src','../img/overlay_'+toswitch+'.png');
                    }

                    //LOGGING CODE - START
                    if(_item.hasClass('help_btn')) {

                        _logger.timer.incrementEventCounter('globalHelpButton');


                    }
                    else if (_item.hasClass('item')) {

                        _logger.timer.incrementEventCounter('browseHelpCircle');

                    }
                    //LOGGING CODE - END

					// using visibility to show so we don't have to know what type of display it is
					$(obj).css("visibility", "visible");
                    
                    setTimeout(function(){
                        $(obj).css('opacity','1')
                    },0);
                }
                else {
                    console.log("Tap blocked");
                }
            });
            $('[data-control="overlay"]').hammer().on('tap', function (e) {
                $(obj).css('opacity','0');
				$(".ovActive").removeClass("ovActive");
                setTimeout(function(){
					$(obj).css("visibility", "hidden")
                    	.attr('class','page');
                },250);
            });
        },
        view_details: function(obj,options){
            var _this = this;
            var deets;
            $.get(this.opts.detailsDataUrl).done(function (data) {
                console.log('-- site details loaded');
                _this.opts.siteDetails = data;
                deets = _this.opts.siteDetails;
            });
            $('[data-control="detail"]').hammer().on('tap','.view_details_btn',function(e){
                var curId = $(this).attr('data-id');
                for(var i = 0;i<=deets.length;i++){
                    if(typeof deets[i] !== 'undefined'){
                        if(deets[i].id == curId){
                            //console.log(deets[i].desc);
                            var _deetsContainer = $('.view_details_container');
                            _deetsContainer
                                .attr('data-id',curId).find('ul')
                                .html($.render.view_details_control(deets[i].desc));

                            if(_deetsContainer.css('opacity') == '1'){
                                _deetsContainer.css('opacity','0');
                            } else {
                                _deetsContainer.css('opacity','1');
                            }
                        }
                    }
                }
            }).on('tap','.view_details_container',function(e){
                if($(this).css('opacity') == '1'){
                    $(this).css('opacity','0');
                }/* else {
                    $(this).css('opacity','1');
                }*/
            })

        }
    };

    // bind all live touches, before render
    Main.prototype.bindLiveClicks = function () {
        var _this = this;
        $('#container').hammer({
			drag: false,
			hold: false,
            tap_max_touchtime: 2000, // 750,
			tap_max_distance: 5
        })
            .on('tap', '[data-link]', function (e) {
                switch (e.type) {
                    case 'tap':
                        var now = (new Date()).getTime();
                        //Block taps while scrolling
                        if(now - _this.lastScrollTime > _this.scrollTapIgnoreTimeMS) {
                            var _datalink = $(this);
                            if(!_datalink.hasClass('disabled')){
                                if(_datalink.attr('data-link') == 'back'){
                                    console.log(_datalink.parent().parent());
                                    if(_datalink.parent().parent().attr('id') == 'cart'){
                                        if(typeof _this.lastViewedProduct == 'string' || _this.lastViewedProduct == '' || !_this.lastViewedProduct){
                                            history.back();
                                        } else {
                                            $.address.value(_this.lastViewedProduct.join('/'));    
                                        }
                                        
                                    } else {
                                        history.back();
                                    }
                                }
                                else if (_datalink.attr('data-link') === 'cart' && _datalink.hasClass('cart_add_btn')) {

                                    //TOTAL HACK: Let logger know that we tapped the specific Add to Bag button
                                    _this.addedNewItemToCart = true;
                                    $.address.value($(this).attr('data-link'));
                                }
                                else {
                                    $.address.value($(this).attr('data-link'));
                                }
                                console.log('-* live tap');
                            }
                        }
                        else {
                            console.log('Tap blocked');
                        }
                        break;
                }
            })
            .on('tap','[data-lights]',function(e){
                $.subpub('lights')._pub({cmd:$(this).attr('data-lights')});
                console.log('-* lights ' + $(this).attr('data-lights'));
            })
            .on('tap', '[data-reset]', function (e) {


                var _resetLink = $(this);

                //LOGGING CODE - START
                if(_logger.timer.peakSessionTimer() < 90000 && !_resetLink.hasClass('disabled')) {

                    //Prevent button spamming
                    _resetLink.addClass('disabled');

                    //If our session is over 25 hours, this is not possible and some weird refresh happened,
                    //so we don't log this session

                    var userStartOverHappened = _resetLink.hasClass('start_over_btn');
                    var userFinishHappened = _resetLink.hasClass('finished_btn');
                    var idleTimeoutHappened = _resetLink.hasClass('idlereset');

                    var idleTimeoutValue = 0;
                    if(idleTimeoutHappened) {
                        idleTimeoutValue = (resetTimeMS/1000);
                    }

                    var userPhoneNumber = _this.selectedProduct.phone ? _this.selectedProduct.phone : "";

                    //Example cartContentArray full of cart Objects:
                    //cartContentArray = [{productId: <number>, style: <string>, color: <string>, size: <string>, price: <number>, qty: <number>, title: <string> }, ... ];

                    //First Finish timings for whatever page we are on:
                    //If on PDP page:

                    if(_logger.timer.getCurrentPage() === 'product_detail') {
                        _logger.timer.endPageTimer('product_detail', idleTimeoutValue);

                        var viewTimeS = _logger.timer.endProductTimer(_this.selectedProduct.upc, 0);
                        _logger.logProductView(_this.selectedProduct.upc,
                            _this.selectedProduct.style, _this.selectedProduct.color,  _this.selectedProduct.colorDescription, _this.selectedProduct.size,
                            _this.selectedProduct.price, 1, viewTimeS);
                    }
                    else {
                        //Else, If on any other page:
                        _logger.timer.endPageTimer(_logger.timer.getCurrentPage(), idleTimeoutValue);
                    }

                    var smsSendCount = _logger.timer.getEventCounter('smsSent');
                    var sessionTotalTimeS = _logger.timer.endSessionTimer(idleTimeoutValue);
                    var sessionComplete = (smsSendCount > 0);
                    var lastVisitedPage = _logger.timer.getCurrentPage();
                    var browseViewCount = _logger.timer.getPageViewCount('product');
                    var browseTimeTotalS = _logger.timer.getPageTotalTimeS('product');
                    var browseHelpCircleViewCount = _logger.timer.getEventCounter('browseHelpCircle');
                    var productViewsArray = _logger.timer.getProductViewsArray(true);
                    var productViewCountTotal = _logger.timer.getTotalProductViewCount(productViewsArray);
                    var productViewTimeTotalS =  _logger.timer.getTotalProductViewTimeS(productViewsArray);
                    var cartViewCount = _logger.timer.getPageViewCount('cart');
                    var cartTotalTimeS  = _logger.timer.getPageTotalTimeS('cart');
                    var checkoutPageViewCount  = _logger.timer.getPageViewCount('order');
                    var checkoutPageTotalTimeS  = _logger.timer.getPageTotalTimeS('order');
                    var smsResendActionCount  = _logger.timer.getEventCounter('smsResendAction');
                    var confirmationPageViewCount = _logger.timer.getPageViewCount('done');
                    var confirmationPageTotalTimeS  = _logger.timer.getPageTotalTimeS('done');
                    var thankyouPageViewCount  = _logger.timer.getPageViewCount('thanks');
                    var thankyouPageTotalTimeS = _logger.timer.getPageTotalTimeS('thanks');
                    var globalHelpButtonViewCount = _logger.timer.getEventCounter('globalHelpButton');
                    var pageHistoryArray = _logger.timer.getPageHistoryArray();
                    var screenTapsSinceLastSession = _logger.timer.getEventCounter('screenTaps');


                    //Get cart data
                    var cartTotalPrice = 0;
                    var cartContentArray = [];
                    var cartTotalCount = 0;
                    for(var i=0; i<_this.productsTotal.length; i++) {

                        cartTotalPrice += (_this.productsTotal[i].quantity * parseFloat(_this.productsTotal[i].retail, 10));
                        cartTotalCount += _this.productsTotal[i].quantity;
                        cartContentArray.push({
                            productId: _this.productsTotal[i].upc,
                            style: _this.productsTotal[i].style,
                            color: _this.productsTotal[i].color,
                            colorDescription: _this.productsTotal[i].color_description,
                            size: _this.productsTotal[i].size,
                            price: parseFloat(_this.productsTotal[i].retail, 10),
                            qty: _this.productsTotal[i].quantity,
                            title: _this.productsTotal[i].description

                        });

                    }
                    //Example cartContentArray full of cart Objects:
                    //cartContentArray = [{productId: <number>, style: <string>, color: <string>, size: <string>, price: <number>, qty: <number>, title:<string>}, ... ];

                    //Do the logging
                    _logger.logSessionCompletion(sessionTotalTimeS, sessionComplete, browseViewCount, browseTimeTotalS, browseHelpCircleViewCount,
                        productViewCountTotal, productViewTimeTotalS, productViewsArray, cartViewCount,
                        cartTotalTimeS, cartTotalCount, cartTotalPrice, cartContentArray, checkoutPageViewCount, checkoutPageTotalTimeS,
                        smsResendActionCount,confirmationPageViewCount, confirmationPageTotalTimeS,
                        thankyouPageViewCount, thankyouPageTotalTimeS, idleTimeoutHappened, (resetTimeMS/1000), lastVisitedPage,
                        userFinishHappened,  userStartOverHappened, userPhoneNumber, smsSendCount, globalHelpButtonViewCount, pageHistoryArray, screenTapsSinceLastSession);


                }
                //LOGGING CODE - END

                //Slight pause to let logging code send off log event
                setTimeout(function() {location.reload(true);}, 600);
            })
            .on('tap', '[pinball]',function(e){
                if(!debug){
                    var snd = new Audio("../media/sound/pinballsound.wav");
                    snd.play();
                }
            })
            .on('tap', '[clear-attractomation]', function(e){

                console.log('attractomation cleared');
                _this._attractomation.stopAttract();

            })
            .on('tap',function(e, fakeString){
                $.subpub('reset')._pub({});

                //LOGGING CODE - START

                if(fakeString !== 'fake') {
                    _logger.timer.incrementEventCounter('screenTaps');
                }


                //LOGGING CODE - END

                //Don't play sound if this is a programmatic click, or the element is
                //tagged as having no sound, OR we are in debug mode
                if(fakeString !== 'fake' && !$(this).hasClass('nosound') && !debug){
                    var snd = new Audio("../media/sound/click.wav");
                    snd.play();
                }
                
            })
            .live('click dragstart', function (e) {
                return false;
            });
		//	.on('release', ".btn", function(){alert("released");});
		$("#container").on("touchstart", ".tapimg, .taplite, .btn, .digit, .inc", function(e) {
			$(e.target).addClass("tapactive");
		})
		.on("touchend", function(e) {
			// we could just remove tapactive from the button that received the touchend - this works fine -
			// but we're going to remove .tapactive from anything that has it instead
			// this gives us an extra level of safety so that we never get a "stuck highlight"
			$(".tapactive").removeClass("tapactive");
		});
    };

    // load main site data json
    Main.prototype.loadSiteData = function () {
        var dfd = $.Deferred();
        var _this = this;

        return $.when($.get(this.opts.siteDataUrl)).done(function (data) {
            console.log('-- site data loaded');
            _this.opts.siteData = data;
            return dfd.promise();
        });
    };

    // load the products json
    Main.prototype.loadSiteProducts = function () {
        
        var _this = this;

        return $.when($.get(this.opts.siteProductsUrl)).done(function (data) {
            console.log('-- site products loaded');
            var tmp = [];
            var imgs = false;
            return $.when(
                $.map(data,function(e,i){
                    if(e.enabled == 'TRUE'){
                        //if(tmp[e.style] == undefined) tmp[e.style] = [];
                        return $.getJSON('/img?id='+e.style+'_'+e.color,function(d){
                            imgs = (d.length > 0) ? d : false;
                            return imgs;
                        }).done(function(imgs){
                            if(imgs){
                                e.img = imgs;
                            }
                            tmp.push(e);
                        });
                    }
                })
            ).done(function(){
                _this.opts.siteProducts = tmp;   
            })
        });
    };
    // load template file and pre-render to the jsrender global
    Main.prototype.loadTemplates = function (cb) {
        var _this = this;
        var dfd = $.Deferred();
        var tmpl = this.opts.tmpl;
        //load the template file
        var cachebust = new Date().getTime();
        return $.when($.get(this.opts.tmplDataUrl + '?t=' + cachebust)).done(function (tmplData) {
            // when done, itterate
            var data = $(tmplData);
            data.each(function (k, v) {
                // grab the html
                var _item = $(v)[0];
                // set internal tmpl with key as the id, value as the html
                if (_item.nodeName == 'SCRIPT') {
                    tmpl[_item.id.replace('#', '')] = _item.innerHTML.trim();
                }
            });
            // bind the templates to jsrender
            $.templates(tmpl);
            console.log('-- templates loaded');
            return dfd.promise();
        });

    };

    // bind all hash changes
    Main.prototype.bindAddress = function () {
        var _this = this;
        $.address.change(function (e) {
            e.pathNames = (e.pathNames.length == 0) ? [_this.opts.defaultPage] : e.pathNames;
            if(e.pathNames[0] == 'product_detail'){
                _this.lastViewedProduct = e.pathNames;
            }
            $.subpub('address')._pub(e.pathNames);
        });
    };

    // do actual page rendering
    Main.prototype.renderPages = function (opts, cb) {
        var _this = this;
        // map the pages data
        $.map(this.opts.siteData.pages, function (k, v) {
            // render templates according to the page id (matches template)
            $(_this.opts.selectors.main).append($($.render[k.id]({
                id: k.id,
                data: k.data
            }))
            // add the page selector onto each
            .addClass(_this.opts.selectors.page.replace('.', '')));
        });
        if (cb) cb();
        console.log('-- all pages rendered');
    };

    //Utility to find our unique product item based on style/color/size

    Main.prototype.findItem = function (style, color, size) {

        var _this = this;


        //Find upc of viewed item
        var foundItem = null;

        if(_this.opts.siteProducts) {
            for(var i=0; i< _this.opts.siteProducts.length; i++) {

                if( _this.opts.siteProducts[i].color === color &&
                    _this.opts.siteProducts[i].size ===  size &&
                    _this.opts.siteProducts[i].style === style) {

                    foundItem = _this.opts.siteProducts[i];
                    break;
                }
            }
        }

        return foundItem;
    };

    // jsrender helpers
    $.views.helpers({
        temp: function (val) {
            var ret = '../img/product/tempproduct.jpg';
            return ret;
        },
        mediapath: function (val) {
            return '../media/' + val;
        },
        urlpath: function (val) {
            return '../img/' + val;
        },
        colorpath: function (id,color) {
            return '../img/swatches/S_'+id+'_'+color+'.jpg';
        },
        productpath: function (val) {
            return '../img/product/' + val;
        },
        productLarge: function(val){
            return '../img/product/large/'+val;
        },
        productCart: function(val){
            return '../img/product/cart/'+val;
        },
        productThumb: function(val){
            return '../img/product/thumb/'+val;
        },
        tostring: function (val) {
            return (typeof val == 'object' || typeof val == 'array') ? JSON.stringify(val) : String(val);
        },
        sizes: function(val){
            return val.replace(/-/g,'').replace('510','shoe');
        },
        splitForStyle: function(val){
            return val.split('_')[1];
        },
        splitForColor: function(val){
            return val.split('_')[2];
        },
        formatSize: function(val){
            return (val == 'U') ? 'ONE SIZE' : val;
        },
        checkForSame: function(item,items){
            if(items.indexOf(item) !== -1){
                return true;
            } else {
                return false;
            }
        },
        log: function (val) {
            console.log(val);
            return val;
        }
    });

    // make instance of main object and pass options
    var ks = new Main({
        port: '3001', // change this if using foreman or something else
        title: 'kate spade',
        defaultPage: 'passive',
        selectors: {
            main: '#container',
            page: '.page'
        },
        tmplDataUrl: 'templates/main.tmpl.html',
        siteDataUrl: 'js/siteData.json',
        siteProductsUrl: 'js/assortment629.json',
        detailsDataUrl: 'js/details67-colorNamesRemoved.json'
    }, function () {
        //console.log('outside');
    });

    // catch all top level
    $('body').on('touchstart touchmove touchend touchcancel', function (e) {
        e.preventDefault();
    });

})(jQuery)