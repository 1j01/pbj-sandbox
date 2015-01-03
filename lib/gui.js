//missspalled
function Modal(_gui){
	var gui=_gui||window.gui;
	if(!gui.element || !gui.element instanceof HTMLElement){
		console.warn("gui.element not initialized. Creating the default overlay.",gui.element);
		gui.overlay();
	}
	var that=this;
	gui.modals.push(this);
	
	this.$m=document.createElement("div"); this.$m.className="modal";
	this.$c=document.createElement("div"); this.$c.className="content";
	this.$tb=document.createElement("div"); this.$tb.className="titlebar";
	this.$t=document.createElement("span"); this.$t.className="title";
	this.$x=document.createElement("span"); this.$x.className="close-x";
	
	this.$tb.appendChild(this.$t);
	this.$tb.appendChild(this.$x);
	this.$m.appendChild(this.$tb);
	this.$m.appendChild(this.$c);
	gui.element.appendChild(this.$m);
	
	this.$m.style.zIndex=++gui.z;
	this.$m.style.opacity=0;
	setTimeout(function(){
		that.$m.style.opacity=1;
	},1);
	
	this.x=0;
	this.y=0;
	this.ox=0;
	this.oy=0;
	this.className="";
	
	this.onmove=null;
	this.onclose=null;
	
	var windowMouseMove=function(e){that.position(e.clientX-that.ox,e.clientY-that.oy);};
	var bringToFront=function(e){
		that.$m.style.zIndex=++gui.z;
	};
	var prevent=function(e){
		e.preventDefault();
	};
	var xClick=function(e){
		if(e.button!==0)return;
		that.close(true);
	};
	var xMouseDown=function(e){
		that.$m.className=(that.className+" modal").trim();
		that.ox=0;
		that.oy=0;
		removeEventListener('mousemove', windowMouseMove, true);
	};
	var tbMouseDown=function(e){
		if(e.button!==0)return;
		e.preventDefault();
		that.$m.className=(that.className+" modal dragging").trim();
		that.ox=e.clientX-that.$m.offsetLeft;
		that.oy=e.clientY-that.$m.offsetTop;
		addEventListener('mousemove', windowMouseMove, true);
	};
	var mouseUp=function(e){
		that.$m.className=(that.className+" modal").trim();
		that.ox=0;
		that.oy=0;
		removeEventListener('mousemove', windowMouseMove, true);
	};
	addEventListener('mouseup', mouseUp, true);
	this.$tb.addEventListener('mousedown', tbMouseDown, true);
	this.$m.addEventListener('mousedown', bringToFront, true);
	this.$m.addEventListener('contextmenu', prevent, true);
	this.$x.addEventListener('click', xClick, true);
	this.$x.addEventListener('mousedown', xMouseDown, true);
	
	this.position=function(x,y){
		if(typeof x!=="undefined"){
			if(typeof x=="string"){
				var thoust=this;
				setTimeout(function(){
					var gw=gui.element.clientWidth;
					var gh=gui.element.clientHeight;
					var mw=thoust.$m.scrollWidth;
					var mh=thoust.$m.scrollHeight;
					if(x=="random"){
						thoust.x=10+Math.random()*(gw-mw-20);
						thoust.y=10+Math.random()*(gh-mh-20);
					}else{
						if(x.match(/top|bottom|center/)) thoust.x=gw/2-mw/2;
						if(x.match(/left|right|center/)) thoust.y=gh/2-mh/2;
						if(x.match(/top/)) thoust.y=10;
						if(x.match(/bottom/)) thoust.y=gh-mh-10;
						if(x.match(/left/)) thoust.x=10;
						if(x.match(/right/)) thoust.x=gw-mw-10;
						thoust.x=Math.max(Math.min(thoust.x,gw-mw-10),10);
						thoust.y=Math.max(Math.min(thoust.y,gh-mh-10),10);
						//thoust.y=Math.min(Math.max(thoust.y,10),gh-mh-10);
					}
					thoust.$m.style.left=(thoust.x-thoust.ox)+"px";
					thoust.$m.style.top=(thoust.y-thoust.oy)+"px";
					this.onmove&&this.onmove();
				},1);
			}else{
				if(x)this.x=x;
				if(y)this.y=y;
					var gw=gui.element.clientWidth;
					var gh=gui.element.clientHeight;
					var mw=this.$m.scrollWidth;
					var th=this.$tb.scrollHeight;
						this.x=Math.max(Math.min(this.x,gw-mw-2),2);
						this.y=Math.max(Math.min(this.y,gh-th-5),2);
				this.$m.style.left=(this.x)+"px";
				this.$m.style.top=(this.y)+"px";
				this.onmove&&this.onmove();
			}
			return this;
		}
		return {x:this.x,y:this.y};
	};
	this.content=function(html){
		if(typeof html=="string"){
			this.$c.innerHTML=html;
			return this;
		}else if(html instanceof HTMLElement){
			this.$c.appendChild(html);
		}
		return this.$c.innerHTML;
	};
	this.title=function(text){
		if(typeof text=="string"){
			if(text===""){
				this.$t.innerHTML="<div style='color:transparent'>[]</div>";
			}else{
				this.$t.textContent=text;
				this.$t.innerText=text;
			}
			return this;
		}
		return this.$t.textContent||this.$t.innerText;
	};
	this.resizable=function(bool){
		//WARNING: this method is unstable.
		if(bool===undefined)bool=true;
		//this.$c.style.resize = bool?"both":"none"; 
		//this.$c.style.overflow = bool?"auto":"default";
		this.$c.className = "content"+(bool?" resizable":"");
		
		var resizeTimer = 0;
		this.$c.onresize = function(){
			this.$m.className = "modal dragging resizing";
			if(resizeTimer)
				clearTimeout(resizeTimer);
			
			resizeTimer = setTimeout(function(){
				this.$m.className = "modal reset";
			}, 500);
		};
		return bool;
	};
	this.close=function(useEvent){
		if(useEvent && this.onclose && !this.onclose()) return;
		
		removeEventListener('mouseup', mouseUp, true);
		this.$tb.removeEventListener('mousedown', tbMouseDown, true);
		this.$m.removeEventListener('mousedown', bringToFront, true);
		this.$m.removeEventListener('contextmenu', prevent, true);
		this.$x.removeEventListener('click', xClick, true);
		this.$x.removeEventListener('mousedown', xMouseDown, true);
		
		var $m=this.$m;
		$m.classList.add("closing");
		$m.style.webkitTransition="all .3s ease-out";
		$m.style.opacity="0";
		$m.style.webkitTransform="scale(0.9)";
		
		setTimeout(function(){
			$m.parentElement&&$m.parentElement.removeChild($m);
		},5100);
		gui.modals.splice(gui.modals.indexOf(this),1);
		return $m;
	};
	/*this.style=function(css){
		this.$c.style.cssText=css;
	};*/
	this.finishAnimating=function(){
		this.$m.style.webkitTransition="none";
		this.$m.style.transition="none";
		var thoust=this;
		setTimeout(function(){
			thoust.$m.style.webkitTransition="opacity, left, right .2s ease-in-out";
			thoust.$m.style.transition="opacity, left, right .2s ease-in-out";
			thoust.$m.style.opacity=1;
		},50);
		return this;
	};
	this.setClassName=function(cn){
		if(typeof cn=="string"){
			this.className=cn;
			return this;
		}else throw new TypeError("String");
	};
	
	this.$=function(q){return this.$m.querySelector(q);};
	this.$$=function(q){return this.$m.querySelectorAll(q);};
	return this;
}

gui = {
	element: null,
	modals: [],
	z: 1337,
	overlay: function(){
		this.element = document.createElement("div");
		document.body.appendChild(this.element);
		this.element.id = "gui-overlay";
	},
	err: function(err, _url, _line){
		/*eg:
		try{foo();bar("baz");}catch(e){gui.err(e);}
		window.onerror=function(err,url,line){gui.err(err,url,line);};
		*/
		if(!err){
			err = new Error("Error, no error, :(?idk!:.");
		}
		var lineNumber = _line || err.lineNumber;
		var fileName = _url || err.fileName;
		var name = err.name || "Error";
		var message = err.message || err;
		if(typeof message !== "string"){
			message = "Additionally, an error occured when trying to display the error. idfk";
		}
		
		var mb=new Modal();
		mb.position("center");
		if(lineNumber && fileName){
			mb.title(name+" in "+fileName+" on line "+lineNumber);
		}else{
			mb.title(name);
		}
		mb.content(message.toString().replace(/\n/g,"<br>")+"<br><button class='ok'>OK</button><button class='not-ok'>NOT OK</button>");
		mb.$(".ok").focus();
		mb.$(".ok").onclick=function(){
			mb.close();
		};
		mb.$(".not-ok").onclick=function(){
			mb.close();
		};
		return mb;
	},
	msg: function(title,content,_callback){
		if(!content){
			content=title;
			title="Message";
		}
		content=content.toString().replace(/\n/g,"<br>");
		var mb=new Modal();
		mb.position("center");
		mb.title(title);
		mb.content(content+"<br><button class='ok'>OK</button>");
		mb.$(".ok").focus();
		mb.$(".ok").onclick=function(){
			mb.close();
			if(_callback)_callback();
		};
		return mb;
	},
	yn: function(title,content,callback){
		if(!content){
			content=title;
			title="Question";
		}
		content=content.toString().replace(/\n/g,"<br>");
		var mb=new Modal();
		mb.position("center");
		mb.title(title);
		mb.content(content+"<br><button class='yes'>Yes</button><button class='no'>No</button>");
		mb.$(".yes").focus();
		mb.$(".yes").onclick=function(){
			mb.close();
			callback(true);
		};
		mb.$(".no").onclick=function(){
			mb.close();
			callback(false);
		};
		return mb;
	},
	confirm: function(title,content,callback){
		if(!callback){
			callback=content;
			content=title;
			title="Confirm";
		}
		content=content.toString().replace(/\n/g,"<br>");
		var mb=new Modal();
		mb.position("center");
		mb.title(title);
		mb.content(content+"<br><button class='ok'>OK</button><button class='cancel'>Cancel</button>");
		mb.$(".ok").focus();
		mb.$(".ok").onclick=function(){
			mb.close();
			callback(true);
		};
		mb.$(".cancel").onclick=function(){
			mb.close();
			//callback(false);
		};
		return mb;
	},
	prompt: function(title,defaultString,callback){
		var mb=new Modal();
		mb.position("center");
		mb.title(title);
		mb.content("<input type=text value='"+defaultString+"'><br><button class='ok'>OK</button>");
		mb.$("input").focus();
		mb.$("input").onkeypress=function(e){
			var val=mb.$("input").value;
			
			if(e.keyCode===13){
				mb.close();
				callback(val);
			}
		};
		mb.$(".ok").onclick=function(){
			var val=mb.$("input").value;
			
			mb.close();
			callback(val);
		};
		return mb;
	}
};

/*
//Tons and tons of alternate names for some functions:
gui.message = gui.msg;
gui.error = gui.err;
gui.yesno = gui.yesNo = gui.yn;
var boxtypes="prompt confirm yn yesno yesNo msg message err error".split(" ");
for(var t in boxtypes){
	gui[boxtypes[t]+"box"]=
	gui[boxtypes[t]+"Box"]=gui[boxtypes[t]];
}
*/
