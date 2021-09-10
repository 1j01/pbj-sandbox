function serialize(points, connections, isSelection) {
	return ARSON.stringify({
		format: "pbp2d",
		formatVersion: 0.1,
		isSelection: !!isSelection,
		points: points,
		connections: connections
	});
}
function deserialize(serialized) {
	return ARSON.parse(serialized);
}

function getState() {
	return serialize(points, connections);
}
function setState(serialized) {
	var state = deserialize(serialized);
	points = state.points;
	connections = state.connections;
	deselect();
}

function undoable() {
	undos.push(getState());
	redos = [];
}
function undo() {
	if (undos.length < 1) return false;
	redos.push(getState());
	setState(undos.pop());
	return true;
}
function redo() {
	if (redos.length < 1) return false;
	undos.push(getState());
	setState(redos.pop());
	return true;
}
function deselect() {
	selection.points = [];
	selection.connections = [];
}
function copySelected() {
	serializedClipboard = serialize(selection.points, selection.connections, true);
	// console.log(deserialize(serializedClipboard));
}
function deleteSelected() {
	for (var i = selection.points.length - 1; i >= 0; i--) {
		var p = selection.points[i];
		for (var j = connections.length - 1; j >= 0; j--) {
			var c = connections[j];
			if (c.p1 === p || c.p2 === p) {
				// console.log(c, j);
				connections.splice(j, 1);
			}
		}
		points.splice(points.indexOf(p), 1);
		// ctx.lineWidth = 10;
		// ctx.strokeStyle = "rgba(255,0,0,0.5)";
		// ctx.beginPath();
		// ctx.arc(p.x, p.y, 3, 0, Math.PI * 2, false);
		// ctx.stroke();
	}
	deselect();
}
function main() {
	gui.overlay();

	canvas = document.createElement("canvas");
	document.body.appendChild(canvas);
	canvas.border = 0;

	mouse = { x: 0, y: 0, d: 0 };
	mousePrevious = { x: 0, y: 0, d: 0 };
	keys = {};

	ntm = null;
	sd2m = 1000;
	connections = [];
	points = [];

	play = true;
	collision = true;
	slowmo = false; // TODO: generalize to a time scale
	autoConnect = false;
	gravity = 0.1;
	audioEnabled = false;
	audioStyle = 1;
	audioViz = false;

	tool = "create-points";
	selection = {
		points: [],
		connections: []
	};
	undos = [];
	redos = [];
	serializedClipboard = null;

	canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
	addEventListener('keydown', function (e) {
		if (e.defaultPrevented) {
			return;
		}
		if (
			document.activeElement instanceof HTMLInputElement ||
			document.activeElement instanceof HTMLTextAreaElement ||
			!window.getSelection().isCollapsed
		) {
			return; // don't prevent interaction with inputs or textareas, or copying text in windows
		}
		if (!keys[e.keyCode]) {
			keys[e.keyCode] = true;
			// console.log(String.fromCharCode(e.keyCode) + ": ", e.keyCode);
			if (e.keyCode === 46) { // delete
				undoable();
				deleteSelected();
			} else switch (String.fromCharCode(e.keyCode)) {
				case "P"://pause/play
					play = !play;
					break;
				case "Z"://undo (+shift=redo)
					if (e.shiftKey) { redo(); } else { undo(); }
					break;
				case "Y"://redo
					redo();
					break;
				case "A"://select all
					selection.points = Array.from(points);
					selection.connections = Array.from(connections);
					break;
				case "D"://deselect all
					deselect();
					break;
				case "C"://copy selection
					if (selection.points.length > 0) {
						copySelected();
					}
					break;
				case "X"://cut selection
					if (selection.points.length > 0) {
						copySelected();
						undoable();
						deleteSelected();
					}
					break;
				case "V"://pasta
					undoable();
					if (serializedClipboard) {
						var clipboard = deserialize(serializedClipboard);
						var minX = Infinity, minY = Infinity;
						for (var i = 0; i < clipboard.points.length; i++) {
							var p = clipboard.points[i];
							minX = Math.min(minX, p.x);
							minY = Math.min(minY, p.y);
						}
						for (var i = 0; i < clipboard.points.length; i++) {
							var p = clipboard.points[i];
							p.x -= minX - mouse.x;
							p.y -= minY - mouse.y;
						}
						points = points.concat(clipboard.points);
						connections = connections.concat(clipboard.connections);
					}
					break;
				case "S":
					selectTool("selection-tool");
					break;
				case "Q":
					selectTool("create-points-fast-tool");
					break;
				case "W":
					selectTool("create-points-tool");
					break;
				case "G":
					selectTool("glue-tool");
					break;
				default:
					return; // don't prevent default
			}
		}
		e.preventDefault();
	});
	addEventListener('keypress', function (e) {
		if (String.fromCharCode(e.keyCode) === "A") {
			return false;
		}
	});
	addEventListener('keyup', function (e) { delete keys[e.keyCode]; });
	var removeSelectionAndBlur = function () {
		if (window.getSelection) {
			if (window.getSelection().empty) {  // Chrome
				window.getSelection().empty();
			} else if (window.getSelection().removeAllRanges) {  // Firefox
				window.getSelection().removeAllRanges();
			}
		} else if (document.selection) {  // IE?
			document.selection.empty();
		}
		document.activeElement.blur();
	};
	var moveMouse = function (pageX, pageY) {
		mouse.x = pageX - canvas.getBoundingClientRect().left;
		mouse.y = pageY - canvas.getBoundingClientRect().top;
	};
	canvas.addEventListener('mousedown', function (e) {
		moveMouse(e.pageX, e.pageY);
		if (e.button == 0) {
			mouse.left = true;
		} else {
			mouse.right = true;
		}
		e.preventDefault();
		removeSelectionAndBlur();
	});
	canvas.addEventListener('touchstart', function (e) {
		moveMouse(e.changedTouches[0].pageX, e.changedTouches[0].pageY);
		mouse.left = true;
		removeSelectionAndBlur();
		e.preventDefault();
	});
	addEventListener('mouseup', function (e) {
		if (e.button == 0) {
			mouse.left = false;
		} else {
			mouse.right = false;
		}
		e.preventDefault();
	});
	addEventListener('touchend', function (e) {
		mouse.left = false;
		mouse.right = false;
	});
	addEventListener('touchcancel', function (e) {
		mouse.left = false;
		mouse.right = false;
	});
	addEventListener('mousemove', function (e) {
		moveMouse(e.pageX, e.pageY);
	}, false);
	addEventListener('touchmove', function (e) {
		moveMouse(e.changedTouches[0].pageX, e.changedTouches[0].pageY);
	}, false);

	/*(onresize = function () {
		//canvas.width=document.body.clientWidth;
		//canvas.height=document.body.clientHeight;
		canvas.width = innerWidth;
		canvas.height = innerHeight - 5;
		step();
	})();*/

	setInterval(step, 15);

	// shoopen = 0;

	try {
		actx = new AudioContext();
		actx.suspend();
		/*
		var x, node, freq = 440;
		if (actx.createScriptProcessor) {
			node = actx.createScriptProcessor(1024, 1, 1);
		} else {
			node = actx.createJavaScriptNode(1024, 1, 1);
		}
		node.onaudioprocess = function (e) {
			for (var i = 0; i < points.length; i++) {
				var p = points[i];
				shoopen += p.x + p.y;
			}
			//console.log(shoopen);
			shoopen = Math.abs(shoopen) % 255;
			var data = e.outputBuffer.getChannelData(0);
			for (var i = 0; i < data.length; i++) {
				data[i] = Math.sin(x * freq) * 35
					+ shoopen * Math.random() * 0.001
					+ Math.sin(x / 4.02) * shoopen * 0.01;
				x++;
			}
		};
		node.connect(actx.destination);
		// node.start ? node.start() : node.noteOn(0);
		*/

		gain = actx.createGain();
		gain.gain.setValueAtTime(0, actx.currentTime);
		gain.connect(actx.destination);

		oscillator = actx.createOscillator();
		oscillator.type = 'square';
		oscillator.frequency.setValueAtTime(440, actx.currentTime); // value in hertz
		oscillator.connect(gain);
		oscillator.start();

	} catch (e) {
		audioSetupError = e;
		console.warn(e);
	}
}

function drawArrow(ctx, x, y, angle, length, headSize = 10) {
	ctx.beginPath();
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(angle);
	ctx.moveTo(0, 0);
	ctx.lineTo(0, -length);
	ctx.moveTo(-headSize, -length+headSize);
	ctx.lineTo(0, -length);
	ctx.lineTo(headSize, -length+headSize);
	ctx.restore();
	ctx.stroke();
}

function step() {
	if (canvas.width != innerWidth) {
		canvas.width = innerWidth;
	}
	if (canvas.height != innerHeight) {
		canvas.height = innerHeight;
	}

	//Drawing setup
	var ctx = canvas.getContext("2d");
	//ctx.fillStyle = "rgba(0,0,20,0.2)";
	//ctx.fillRect(0,0,canvas.width,canvas.height);

	//Clear.
	ctx.fillStyle = "rgba(0,0,20,1)";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.lineWidth = 1;

	ctx.save();

	if (tool === "selection-tool" && mouse.left && mousePrevious.left) {
		selection = {
			x: selection.x, y: selection.y,
			x1: Math.min(selection.x, mouse.x),
			y1: Math.min(selection.y, mouse.y),
			x2: Math.max(selection.x, mouse.x),
			y2: Math.max(selection.y, mouse.y),
			points: [], connections: [],
		};

		for (var j = connections.length - 1; j >= 0; j--) {
			var c = connections[j];
			if (c.p1.x < selection.x2 && c.p1.x > selection.x1)
				if (c.p1.y < selection.y2 && c.p1.y > selection.y1)
					if (c.p2.x < selection.x2 && c.p2.x > selection.x1)
						if (c.p2.y < selection.y2 && c.p2.y > selection.y1) {
							selection.connections.push(c);
						}
		}
		for (var i = points.length - 1; i >= 0; i--) {
			var p = points[i];
			if (p.x < selection.x2 && p.x > selection.x1)
				if (p.y < selection.y2 && p.y > selection.y1) {
					selection.points.push(p);
				}
		}

		ctx.fillStyle = "rgba(0,255,200,0.1)";
		ctx.strokeStyle = "rgba(0,255,200,0.5)";
		ctx.beginPath();
		ctx.rect(
			selection.x1 + .5,
			selection.y1 + .5,
			selection.x2 - selection.x1,
			selection.y2 - selection.y1
		);
		ctx.fill();
		ctx.stroke();
	}

	if (tool === "selection-tool") {
		if (mouse.left && !mousePrevious.left) {
			selection = { x: mouse.x, y: mouse.y, points: [], connections: [] };
		}
	} else if (tool.match(/create-points/)) {
		if (mouse.left && (!mousePrevious.left || tool === "create-points-fast-tool")) {
			if (!mousePrevious.left) undoable();
			points.push({
				x: mouse.x,//position
				y: mouse.y,
				px: mouse.x,//previous position
				py: mouse.y,
				vx: 0,//velocity
				vy: 0,
				fx: 0,//force
				fy: 0,
				fixed: keys[16],
				color: keys[16] ? "grey" : `hsl(${Math.random() * 360},${Math.random() * 50 + 50}%,${Math.random() * 50 + 50}%)`,
			});
		}
	}
	if (play) {
		if (mouse.right && ntm) {
			ntm.fx += (mouse.x - ntm.x - ntm.vx) / sd2m;
			ntm.fy += (mouse.y - ntm.y - ntm.vy) / sd2m;
			//ntm.x=mouse.x;
			//ntm.y=mouse.y;
		} else {
			if (mousePrevious.right && ntm) {
				//ntm.vx=(ntm.x-ntm.px)*10;
				//ntm.vy=(ntm.y-ntm.py)*10;
			}
			ntm = null;
			sd2m = 100;
		}

		var freq = 440; // or something
		var amplitude = 0;
		//for(var g=0;g<4;g++){
		for (var j = connections.length - 1; j >= 0; j--) {
			var c = connections[j];
			var d = distance(c.p1.x + c.p1.vx, c.p1.y + c.p1.vy, c.p2.x + c.p2.vx, c.p2.y + c.p2.vy);
			var dd = (d - c.dist);
			var dx = (c.p2.x + c.p2.vx - c.p1.x - c.p1.vx);
			var dy = (c.p2.y + c.p2.vy - c.p1.y - c.p1.vy);
			//d=Math.abs(d)+1;
			d++;
			var f = c.force / 10;
			c.p1.fx += dx / d * dd * f;
			c.p1.fy += dy / d * dd * f;
			c.p2.fx -= dx / d * dd * f;
			c.p2.fy -= dy / d * dd * f;
			if (dd > c.dist * 3) {
				connections.splice(j, 1);
				// console.log(dd);
				amplitude += Math.min(Math.abs(dd), 100) / 100;
				freq = 0;
			}
			if (!c.p1.fixed && !c.p2.fixed) {
				var vd = distance(c.p1.vx, c.p1.vy, c.p2.vx, c.p2.vy);
				var fd = distance(c.p1.fx, c.p1.fy, c.p2.fx, c.p2.fy);
				var v = distance(0, 0, c.p1.vx, c.p1.vy) + distance(0, 0, c.p2.vx, c.p2.vy);
				vdd = vd - (c.vdp || 0);
				// var angle = Math.atan2(c.p1.x, c.p1.y, c.p2.x, c.p2.y);
				if (audioStyle == 0) {
					var amp_add = vd / 1000;
				}
				// var amp_add = vd / 1000;
				// var amp_add = vd ** 1.2 / 1000;
				// var amp_add = vd / 1000;
				if (audioStyle == 1 || audioStyle == 2) {
					var amp_add = vdd / 1000;
				}
				// var amp_add = vd / 5000 + vdd / 1000;
				// var amp_add = vd / (Math.max(Math.abs(fd), 1) ** 2) / 100;
				// var amp_add = vd * v / 1000;
				// var amp_add = vdd / 1000 * vdd > 1;
				if (audioStyle == 0) {
					var freq_add = dd;
				}
				// var freq_add = dd;
				// var freq_add = -dd;
				// var freq_add = Math.abs(dd);
				// var freq_add = angle;
				// var freq_add = -dd * vdd / 10;
				// var freq_add = -dd * vdd > 1;
				// var freq_add = dd * vdd > 1;
				// var freq_add = dd * Math.max(0, Math.min(1, vdd / 5 - 10)) * 5;
				// var freq_add = Math.max(0, Math.min(20, 
				// 	dd * Math.max(0, Math.min(1,
				// 		vdd / 5 - 10
				// 	)) * 50
				// ));
				// var freq_add = dd * v / 100;
				// var freq_add = dd * (dd > 1);
				// var freq_add = dd * (v ** 1.5 / 100);
				// if (audioStyle == 1) {
				if (audioStyle == 1 || audioStyle == 2) {
					var freq_add = dd * (~~v) / 100;
				}
				// if (audioStyle == 2) {
				// 	var freq_add = dd * (~~v) / 100 * Math.random();
				// }
				freq += freq_add;
				amplitude += amp_add;
				// ctx.fillStyle = "red";
				// ctx.fillRect(j*2, 0, 2, dd);
				if (audioViz) {
					ctx.fillStyle = "yellow";
					ctx.fillRect(j * 2, 0, 2, freq_add * 5);
					ctx.fillStyle = "green";
					ctx.fillRect(j * 2, 0, 2, amp_add * 2000);
				}

				c.vdp = vd;
			}
		}
	}
	//Draw and step the points.
	for (var i = points.length - 1; i >= 0; i--) {
		var p = points[i];
		if (play && !p.fixed) {
			//Apply connection forces.
			p.vx += p.fx;
			p.vy += p.fy;
			//"air friction"
			//p.vx*=0.99;
			//p.vy*=0.99;
			//gravity
			p.vy += gravity;
			//Move
			p.px = p.x;
			p.py = p.y;
			p.x += p.vx * (slowmo ? 0.06 : 1);
			p.y += p.vy * (slowmo ? 0.06 : 1);

			var friction = 2, cor = 4;
			if (p.x > canvas.width - 2) {
				p.x = canvas.width - 2;
				p.vx = -p.vx / cor;
				p.vy /= friction;
			}
			if (p.y > canvas.height - 2) {
				p.y = canvas.height - 2;
				p.vy = -p.vy / cor - Math.random() / 6;
				p.vx /= friction;
			}
			if (p.y < 2) {
				p.y = 2;
				p.vy = -p.vy / cor;
				p.vx /= friction;
			}
			if (p.x < 2) {
				p.x = 2;
				p.vx = -p.vx / cor;
				p.vy /= friction;
			}
			// if (Math.sign(p.x - p.px - p.vx) > 0) {

			// }
			for (var j = 0; j < gui.modals.length; j++) {
				var m = gui.modals[j];
				var r = m.$m.getBoundingClientRect();
				var o = 3;
				r = { left: r.left - o, top: r.top - o, right: r.right + o, bottom: r.bottom + o };
				r.width = r.right - r.left;
				r.height = r.bottom - r.top;
				if (p.x >= r.left && p.x <= r.right) {
					if (p.y >= r.top && p.y <= r.bottom) {
						// convert to rect unit coords (0 = left, 1 = right, 0 = top, 1 = bottom)
						// then find whether it's in each of two diagonal halves
						// and use that to find whether it's in opposing diagonal quadrants
						// i.e. whether it's more horizontal or more vertical
						var in_upper_right_half = (p.x - r.left) / r.width > (p.y - r.top) / r.height;
						var in_upper_left_half = (r.right - p.x) / r.width > (p.y - r.top) / r.height;
						var in_left_or_right_quadrant = in_upper_right_half ^ in_upper_left_half;
						if (in_left_or_right_quadrant) {
							if (p.x < r.left + r.width / 2) {
								p.x = r.left;
								p.vx = -Math.abs(p.vx) / cor;
								//p.vy/=friction;
							} else {
								p.x = r.right;
								p.vx = Math.abs(p.vx) / cor;
								//p.vy/=friction;
							}
						} else {
							if (p.y < r.top + r.height / 2) {
								p.y = r.top;
								p.vy = -Math.abs(p.vy) / cor;
								p.vx /= friction;
							} else {
								p.y = r.bottom;
								p.vy = Math.abs(p.vy) / cor;
								p.vx /= friction;
							}
						}
					}
				}
			}
		}
		// draw point
		ctx.fillStyle = p.color;
		ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
		// debug (looks cool btw)
		// if (groups.has(p)) {
		// 	ctx.textAlign = "center";
		// 	ctx.textBaseline = "middle";
		// 	ctx.fillText(groups.get(p), p.x, p.y);
		// } else {
		// 	ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
		// }

		var d2m = distance(p.x, p.y, mouse.x, mouse.y);
		d2m = Math.max(d2m, 1); // prevent divide by zero in drag force calculation
		if (!mouse.right) {
			if (d2m < sd2m && !p.fixed) {
				ntm = p;
				sd2m = d2m;
			}
		}

		for (var j = points.length - 1; j >= 0; j--) {
			if (i == j) continue;
			var p2 = points[j];
			var d = distance(p.x, p.y, p2.x, p2.y);
			if (d < 50) {
				function numConn(p) {
					var nc = 0;
					for (var i = 0; i < connections.length; i++) {
						if (connections[i].p1 === p) nc++;
						if (connections[i].p2 === p) nc++;
					}
					return nc;
				}
				if ((d2m < 30 && (tool === "glue-tool" && mouse.left || keys[32])) || (autoConnect && d < 50 && numConn(p) < 6 && numConn(p2) < 3)) {
					var connected = false;
					for (var ci = connections.length - 1; ci >= 0; ci--) {
						if (
							(connections[ci].p1 === p && connections[ci].p2 === p2)
							|| (connections[ci].p1 === p2 && connections[ci].p2 === p)
						) {
							connected = true;
							break;
						}
					}
					if (!connected) {
						connections.push({ p1: p, p2: p2, dist: 60, force: 1 });
						//connections.push({p1:p,p2:p2,dist:Math.ceil(d*.15)*10});
					}
				}
			}
		}
		p.fx = 0;
		p.fy = 0;
	}
	for (var j = connections.length - 1; j >= 0; j--) {
		var c = connections[j];
		/*if(points.indexOf(c.p1)===-1 || points.indexOf(c.p2)===-1){
			connections.splice(j,1);
			continue;
		}*/
		var hit = false;
		if (collision && play) {
			for (var i = points.length - 1; i >= 0; i--) {
				var p = points[i];
				if (p == c.p1 || p == c.p2) continue;
				if (areConnected(p, c.p1)) continue;
				// if (areConnected(p, c.p2)) continue; // assuming the connectedness works, this is unnecessary
				//this check shouldn't be here
				// if (p.x != p.px || p.y != p.py) {
				if (true) {

					// var is = intersectLineLine(p.x, p.y, p.px, p.py, c.p1.x, c.p1.y, c.p2.x, c.p2.y)
					// 	|| intersectLineLine(p.x, p.y, p.px, p.py, c.p1.px, c.p1.py, c.p2.px, c.p2.py);
					// HACK
					// is = is
					// 	|| intersectLineLine(p.x, p.y, p.px, p.py-1, c.p1.x, c.p1.y, c.p2.x, c.p2.y)
					// 	|| intersectLineLine(p.x, p.y, p.px, p.py-1, c.p1.px, c.p1.py, c.p2.px, c.p2.py);
					// the moving line is really a quad, not two lines
					// var is = intersectLineQuad(p.x, p.y, p.px, p.py, c.p1.x, c.p1.y, c.p1.px, c.p1.py, c.p2.px, c.p2.py, c.p2.x, c.p2.y, ctx);
					// but if the line is rotating, it makes a self-intersecting quad (an hourglass shape), which has a weak spot
					// let is;
					// if (intersectLineLine(c.p1.x, c.p1.y, c.p1.px, c.p1.py, c.p2.px, c.p2.py, c.p2.x, c.p2.y)) {
					// 	is = intersectLineQuad(p.x, p.y, p.px, p.py, c.p1.x, c.p1.y, c.p1.px, c.p1.py, c.p2.x, c.p2.y, c.p2.px, c.p2.py, ctx);
					// } else {
					// 	is = intersectLineQuad(p.x, p.y, p.px, p.py, c.p1.x, c.p1.y, c.p1.px, c.p1.py, c.p2.px, c.p2.py, c.p2.x, c.p2.y, ctx);
					// }
					// but if the line is rotating, it SHOULD have a hour-glass shape to represent its movement, or better a rounded bow-tie shape
					// the real problem is... well it's unreliable, I'm trying to figure it out

					// I'm gonna try enlarging quad region?
					// This is gonna be complicated and stupid, but it might help...
					// const nudge_amount = 30;
					// let quad_points = [[c.p1.x, c.p1.y], [c.p1.px, c.p1.py], [c.p2.px, c.p2.py], [c.p2.x, c.p2.y]];

					// for (let i = 0; i < quad_points.length; i++) {
					// 	const qpi = quad_points[i];
					// 	for (let j = 0; j < quad_points.length; j++) {
					// 		if (i === j) continue;
					// 		const qpj = quad_points[j];
					// 		let dist = Math.hypot(qpi[0] - qpj[0], qpi[1] - qpj[1]);
					// 		qpi.fx = qpi.fx ?? 0;
					// 		qpi.fy = qpi.fy ?? 0;
					// 		if (dist < 1) { dist = 1; }
					// 		qpi.fx -= (qpj[0] - qpi[0]) / dist;
					// 		qpi.fy -= (qpj[1] - qpi[1]) / dist;
					// 		// qpi.fx = 0.001; // testing the normalize below
					// 		// qpi.fy = 0.001;
					// 	}
					// }
					// for (let i = 0; i < quad_points.length; i++) {
					// 	const qp = quad_points[i];
					// 	// normalize before applying
					// 	const d = Math.hypot(qp.fx, qp.fy);
					// 	// if (d < 0.01) {
					// 	// 	do thick line test instead?
					// 	// }
					// 	qp[0] += qp.fx / d * nudge_amount;
					// 	qp[1] += qp.fy / d * nudge_amount;
					// }
					// const is = intersectLineQuad(p.x, p.y, p.px, p.py, ...quad_points.flat(), ctx);

					// GONNA DO SEPARATE MOVEMENT QUAD AND STATIC "THICK LINE" QUAD
					var is = intersectLineQuad(p.x, p.y, p.px, p.py, c.p1.x, c.p1.y, c.p1.px, c.p1.py, c.p2.px, c.p2.py, c.p2.x, c.p2.y, ctx);
					if (!is) {
						const normal = Math.atan2(c.p1.x - c.p2.x, c.p1.y - c.p2.y) + Math.PI / 2;
						const nudge_amount = 1;
						const qx1 = c.p1.x + Math.sin(normal) * nudge_amount;
						const qy1 = c.p1.y + Math.cos(normal) * nudge_amount;
						const qx2 = c.p2.x + Math.sin(normal) * nudge_amount;
						const qy2 = c.p2.y + Math.cos(normal) * nudge_amount;
						const qx3 = c.p2.x - Math.sin(normal) * nudge_amount;
						const qy3 = c.p2.y - Math.cos(normal) * nudge_amount;
						const qx4 = c.p1.x - Math.sin(normal) * nudge_amount;
						const qy4 = c.p1.y - Math.cos(normal) * nudge_amount;
						is = intersectLineQuad(p.x, p.y, p.px, p.py, qx1, qy1, qx2, qy2, qx3, qy3, qx4, qy4, ctx);
					}

					if (is) {
						hit = true;

						// var p_dir = Math.atan2(p.x - p.px, p.y - p.py);
						var p_dir = Math.atan2(p.vy, p.vx);

						var normal = Math.atan2(c.p1.x - c.p2.x, c.p1.y - c.p2.y) + Math.PI / 2;
						// Note: normal can point either way
						// IMPORTANT NOTE: normal is not in the same coordinate system as bounce_angle,
						// hence the negation when rendering the normal's arrow
						// THIS IS NOT INTENTIONAL, it's just bad math.
						// I tried flipping the signs and sines and cosines for a while
						// but didn't get it to work while being more sensible.
						// Maybe later I'll go at it again.
						// (Keep in mind, the drawArrow function is also arbitrary in its base angle)
						var p_vx_connection_space = Math.sin(normal) * p.vx + Math.cos(normal) * p.vy;
						var p_vy_connection_space = Math.cos(normal) * p.vx - Math.sin(normal) * p.vy;
						var bounce_angle_connection_space = Math.atan2(p_vy_connection_space, p_vx_connection_space);
						var bounce_angle = bounce_angle_connection_space - normal;

						var hack = 0.1;
						p.x = is.x + -Math.sin(-bounce_angle) * hack;
						p.y = is.y + -Math.cos(-bounce_angle) * hack;
						// var speed = distance(p.x, p.y, p.px, p.py) / (p.friction = 2); // + 1;
						var original_speed = Math.hypot(p.vx, p.vy);
						var speed = original_speed * 0.7;
						p.vx = -Math.sin(-bounce_angle) * speed;
						p.vy = -Math.cos(-bounce_angle) * speed;
						// p.fx += -Math.sin(-bounce_angle) * speed;
						// p.fy += -Math.cos(-bounce_angle) * speed;

						ctx.strokeStyle = "aqua";
						drawArrow(ctx, is.x, is.y, -normal, 50);
						ctx.strokeStyle = "red";
						drawArrow(ctx, is.x, is.y, bounce_angle, 50);

						// impart force to the connection's points
						// TODO: elastic collision physics
						var f = original_speed / 5;
						c.p1.fx += Math.sin(Math.PI/2-p_dir) * f;
						c.p1.fy += Math.cos(Math.PI/2-p_dir) * f;
						c.p2.fx += Math.sin(Math.PI/2-p_dir) * f;
						c.p2.fy += Math.cos(Math.PI/2-p_dir) * f;

						// oh um, yeah I don't know what I'm doing
						// maybe add a force to the point that is perpendicular to the line? but in which direction?
						
						// add a force based on the connection's points' velocities
						// var f = 0.3;
						// p.fx += (c.p1.vx + c.p2.vx) * f;
						// p.fy += (c.p1.vy + c.p2.vy) * f;
					}
				}
			}
		}
		/**
		var r = Math.random();
		ctx.strokeStyle = hit && Math.random() < 0.9 ? "white" : c.p1.color;
		ctx.strokeStyle = c.p1.color;
		ctx.beginPath();
		ctx.moveTo(
			(c.p2.x - c.p1.x) * 0.2 + c.p1.x,
			(c.p2.y - c.p1.y) * 0.2 + c.p1.y
		);
		ctx.quadraticCurveTo(
			(c.p2.x - c.p1.x) * 0.4 + c.p1.x + Math.sin(r) * 20,
			(c.p2.y - c.p1.y) * 0.4 + c.p1.y + Math.cos(r) * 20,
			(c.p2.x - c.p1.x) * 0.4 + c.p1.x,
			(c.p2.y - c.p1.y) * 0.4 + c.p1.y
		);
		ctx.stroke();
		ctx.strokeStyle = hit && Math.random() < 0.9 ? "white" : c.p2.color;
		ctx.strokeStyle = c.p2.color;
		ctx.beginPath();
		ctx.moveTo(
			(c.p2.x - c.p1.x) * 0.8 + c.p1.x,
			(c.p2.y - c.p1.y) * 0.8 + c.p1.y
		);
		ctx.quadraticCurveTo(
			(c.p2.x - c.p1.x) * 0.6 + c.p1.x + Math.sin(r) * 20,
			(c.p2.y - c.p1.y) * 0.6 + c.p1.y + Math.cos(r) * 20,
			(c.p2.x - c.p1.x) * 0.6 + c.p1.x,
			(c.p2.y - c.p1.y) * 0.6 + c.p1.y
		);
		ctx.stroke();
		/**/
		ctx.strokeStyle = hit && Math.random() < 0.9 ? "white" : c.p1.color;
		ctx.strokeStyle = c.p1.color;
		ctx.beginPath();
		ctx.moveTo((c.p2.x - c.p1.x) * 0.2 + c.p1.x, (c.p2.y - c.p1.y) * 0.2 + c.p1.y);
		ctx.lineTo((c.p2.x - c.p1.x) * 0.4 + c.p1.x, (c.p2.y - c.p1.y) * 0.4 + c.p1.y);
		ctx.stroke();
		ctx.strokeStyle = hit && Math.random() < 0.9 ? "white" : c.p2.color;
		ctx.strokeStyle = c.p2.color;
		ctx.beginPath();
		ctx.moveTo((c.p2.x - c.p1.x) * 0.8 + c.p1.x, (c.p2.y - c.p1.y) * 0.8 + c.p1.y);
		ctx.lineTo((c.p2.x - c.p1.x) * 0.6 + c.p1.x, (c.p2.y - c.p1.y) * 0.6 + c.p1.y);
		ctx.stroke();
		/**/
	}

	ctx.lineWidth = 1;
	ctx.strokeStyle = "rgba(0,255,200,0.5)";
	for (var i = selection.points.length - 1; i >= 0; i--) {
		var p = selection.points[i];
		ctx.beginPath();
		ctx.arc(p.x, p.y, 3, 0, Math.PI * 2, false);
		ctx.stroke();
	}

	ctx.lineWidth = 3;
	ctx.strokeStyle = "rgba(0,255,200,0.5)";
	for (var j = selection.connections.length - 1; j >= 0; j--) {
		var c = selection.connections[j];
		if (keys[46]) {
			var idx = connections.indexOf(c);
			if (idx >= 0) connections.splice(idx, 1);
			selection.connections.splice(j, 1);
			continue;
		}
		ctx.beginPath();
		ctx.moveTo(c.p1.x, c.p1.y);
		ctx.lineTo(c.p2.x, c.p2.y);
		ctx.stroke();
	}
	if (!play) {
		ctx.fillStyle = "rgba(255,255,255,0.5)";
		var cx = canvas.width / 2;
		var cy = canvas.height / 2;
		var h = 100, w = 30, sx = 40;
		ctx.fillRect(cx - sx - w / 2, cy - h / 2, w, h);
		ctx.fillRect(cx + sx - w / 2, cy - h / 2, w, h);
	}

	ctx.restore();
	mousePrevious.left = mouse.left;
	mousePrevious.right = mouse.right;
	mousePrevious.x = mouse.x;
	mousePrevious.y = mouse.y;

	if (play) {
		// find connected groups of points
		groups.clear();
		if (collision) {
			for (var i = points.length - 1; i >= 0; i--) {
				var p = points[i];
				groups.set(p, i);
			}
			for (var i = connections.length - 1; i >= 0; i--) {
				var c = connections[i];
				var g1 = groups.get(c.p1);
				var g2 = groups.get(c.p2);
				if (g1 != g2) {
					for (var j = points.length - 1; j >= 0; j--) {
						if (groups.get(points[j]) == g2) {
							groups.set(points[j], g1);
						}
					}
				}
			}
		}
	}


	if (audioEnabled && play) {
		if (actx.state === "suspended") {
			actx.resume();
		}
	} else {
		if (actx.state === "running") {
			actx.suspend();
		}
	}

	if (typeof oscillator !== "undefined" && freq != null) {
		if (audioStyle == 0 || audioStyle == 2) {
			oscillator.frequency.setValueAtTime(freq, actx.currentTime);
		} else {
			oscillator.frequency.linearRampToValueAtTime(freq, actx.currentTime + 0.05);
		}
		if (audioStyle == 0) {
			gain.gain.setValueAtTime(amplitude, actx.currentTime);
		} else {
			gain.gain.linearRampToValueAtTime(amplitude, actx.currentTime + 0.001);
		}
	}
}
// function intersectLineLine(x1, y1, x2, y2, x3, y3, x4, y4) {
// 	x1 += 0.00001; // fix for straight up/down lines (i.e. points falling straight down)
// 	x3 -= 0.00001; // fix in case straight up/down line is the second line passed
// 	y4 += 0.00001; // might help too, idk (TODO: think about what the degenerate cases are, maybe write tests, maybe find a better algorithm)
// 	var x = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / ((x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4));
// 	var y = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / ((x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4));
// 	if (isNaN(x) || isNaN(y)) {
// 		return false;
// 		// console.log(x, y);
// 	} else {
// 		if (x1 > x2) {
// 			if (!(x2 < x && x < x1)) { return false; }
// 		} else {
// 			if (!(x1 < x && x < x2)) { return false; }
// 		}
// 		if (y1 >= y2) {
// 			if (!(y2 < y && y < y1)) { return false; }
// 		} else {
// 			if (!(y1 < y && y < y2)) { return false; }
// 		}
// 		if (x3 >= x4) {
// 			if (!(x4 < x && x < x3)) { return false; }
// 		} else {
// 			if (!(x3 < x && x < x4)) { return false; }
// 		}
// 		if (y3 >= y4) {
// 			if (!(y4 < y && y < y3)) { return false; }
// 		} else {
// 			if (!(y3 < y && y < y4)) { return false; }
// 		}
// 	}
// 	return { x: x, y: y };
// }
function intersectLineLine(line1StartX, line1StartY, line1EndX, line1EndY, line2StartX, line2StartY, line2EndX, line2EndY, debug_ctx) {
    // if the lines intersect, the result contains the x and y of the intersection (treating the lines as infinite) and booleans for whether line segment 1 or line segment 2 contain the point
    var denominator, a, b, numerator1, numerator2, result = {
        x: null,
        y: null,
        onLine1: false,
		onLine2: false,
    };
    denominator = ((line2EndY - line2StartY) * (line1EndX - line1StartX)) - ((line2EndX - line2StartX) * (line1EndY - line1StartY));
    if (denominator == 0) {
        // return result;
		// debug
		if (debug_ctx) {
			debug_ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
			debug_ctx.fillRect(0, 0, debug_ctx.canvas.width, debug_ctx.canvas.height);
			debug_ctx.strokeStyle = "yellow";
			debug_ctx.beginPath();
			debug_ctx.moveTo(line1StartX, line1StartY);
			debug_ctx.lineTo(line1EndX, line1EndY);
			debug_ctx.stroke();
			debug_ctx.strokeStyle = "aqua";
			debug_ctx.beginPath();
			debug_ctx.moveTo(line2StartX, line2StartY);
			debug_ctx.lineTo(line2EndX, line2EndY);
			debug_ctx.stroke();
		}
		return;
    }
    a = line1StartY - line2StartY;
    b = line1StartX - line2StartX;
    numerator1 = ((line2EndX - line2StartX) * a) - ((line2EndY - line2StartY) * b);
    numerator2 = ((line1EndX - line1StartX) * a) - ((line1EndY - line1StartY) * b);
    a = numerator1 / denominator;
    b = numerator2 / denominator;

    // if we cast these lines infinitely in both directions, they intersect here:
    result.x = line1StartX + (a * (line1EndX - line1StartX));
    result.y = line1StartY + (a * (line1EndY - line1StartY));
/*
        // it is worth noting that this should be the same as:
        x = line2StartX + (b * (line2EndX - line2StartX));
        y = line2StartX + (b * (line2EndY - line2StartY));
        */
    // if line1 is a segment and line2 is infinite, they intersect if:
    if (a > 0 && a < 1) {
        result.onLine1 = true;
    }
    // if line2 is a segment and line1 is infinite, they intersect if:
    if (b > 0 && b < 1) {
        result.onLine2 = true;
    }
    // if line1 and line2 are segments, they intersect if both of the above are true
	if (result.onLine1 && result.onLine2) {
		return result;
	}
    // return result;
};


function pointInPolygon(x, y, polygon_points, debug_ctx) {
	var inside = false;
	for (var i = 0, j = polygon_points.length - 1; i < polygon_points.length; j = i++) {
		var xi = polygon_points[i].x, yi = polygon_points[i].y;
		var xj = polygon_points[j].x, yj = polygon_points[j].y;
        
		var intersect = ((yi > y) != (yj > y))
			&& (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
		if (intersect) inside = !inside;
	}
	// debug
	debug_ctx.beginPath();
	debug_ctx.fillStyle = inside ? "rgba(0,255,0,0.6)" : "rgba(255,0,0,0.6)";
	debug_ctx.moveTo(polygon_points[0].x, polygon_points[0].y);
	for (var i = 1; i < polygon_points.length; i++) {
		debug_ctx.lineTo(polygon_points[i].x, polygon_points[i].y);
	}
	debug_ctx.closePath();
	debug_ctx.fill();

	return inside;
}
function intersectLineQuad(line_x1, line_y1, line_x2, line_y2, quad_x1, quad_y1, quad_x2, quad_y2, quad_x3, quad_y3, quad_x4, quad_y4, debug_ctx) {
	var p1 = intersectLineLine(quad_x1, quad_y1, quad_x2, quad_y2, line_x1, line_y1, line_x2, line_y2, debug_ctx);
	var p2 = intersectLineLine(quad_x2, quad_y2, quad_x3, quad_y3, line_x1, line_y1, line_x2, line_y2, debug_ctx);
	var p3 = intersectLineLine(quad_x3, quad_y3, quad_x4, quad_y4, line_x1, line_y1, line_x2, line_y2, debug_ctx);
	var p4 = intersectLineLine(quad_x4, quad_y4, quad_x1, quad_y1, line_x1, line_y1, line_x2, line_y2, debug_ctx);
	// return closest point to line_x1, line_y1
	var best_dist = Infinity;
	var best_point = null;
	for (const point of [p1, p2, p3, p4]) {
		if (point) {
			const dist = Math.hypot(point.x - line_x1, point.y - line_y1);
			if (dist < best_dist) {
				best_dist = dist;
				best_point = point;
			}
		}
	}
	if (best_point) {
		return best_point;
	}
	// if line is inside quad
	if (pointInPolygon(line_x1, line_x2, [
		{ x: quad_x1, y: quad_y1 },
		{ x: quad_x2, y: quad_y2 },
		{ x: quad_x3, y: quad_y3 },
		{ x: quad_x4, y: quad_y4 },
	], debug_ctx)) {
		// uneducated guess ("hopefully it won't matter")
		return { x: (line_x1 + line_x2) / 2, y: (line_y1 + line_y2) / 2 };
	}
	// if (pointInQuad(line_x1, line_y1, quad_x1, quad_y1, quad_x2, quad_y2, quad_x3, quad_y3, quad_x4, quad_y4)) {
}

function createTerrain() {
	var x = Math.random() * 200;
	var y = Math.random() * 200 + 200;
	var y_tend = 0, x_tend = 10;
	var p, pp;
	for (var i = 0; i < 50; i++) {
		x += Math.random() * 10 - 5 + x_tend;
		y += Math.random() * 10 - 5 + y_tend;
		y_tend += Math.random() * 20 - 10;
		x_tend += Math.random() * 35 - 15;
		y_tend *= 0.945;
		x_tend *= 0.9;
		pp = p;
		p = {
			x: x,//position
			y: y,
			px: x,//previous position
			py: y,
			vx: 0,//velocity
			vy: 0,
			fx: 0,//force
			fy: 0,
			fixed: true,
			color: "green"
		};
		points.push(p);
		if (pp) connections.push({ p1: p, p2: pp, dist: -1, force: -1 });
	}
}
function rope(x1, y1, x2, y2, seg, force) {
	force = force || 1;
	var pp, p;
	for (var i = 0; i < seg; i++) {
		var x = (x2 - x1) * (i / seg) + x1;
		var y = (y2 - y1) * (i / seg) + y1;
		pp = p;
		p = {
			x: x,//position
			y: y,
			px: x,//previous position
			py: y,
			vx: 0,//velocity
			vy: 0,
			fx: 0,//force
			fy: 0,
			fixed: false,
			color: "#FC5"
		};
		points.push(p);
		if (pp) connections.push({ p1: p, p2: pp, dist: distance(p.x, p.y, pp.x, pp.y), force: force });
	}
}

// Note: `groups` is only computed when collision is enabled
var groups = new Map(); // point to group id, for connected groups
function areConnected(p1, p2) {
	if (p1.fixed && p2.fixed) return false;
	return groups.get(p1) == groups.get(p2);
}

function distance(x1, y1, x2, y2) {
	return Math.hypot(x2 - x1, y2 - y1);
}
function sqrDistance(x1, y1, x2, y2) {
	return (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
}
function r() { return Math.random() * 2 - 1; }

function guiStuff() {
	var ops = new Modal().position("left top").title("Options").content(`
		<h3>Audio:</h3>
		<label><input type='checkbox' id='sfx-checkbox'/>Audio</label>${"" /* Note: Audio checkbox is mentioned in dialog text */}
		<br><label><input type='checkbox' id='sfx-viz-checkbox'/>Visualization</label>
		<br><label>Audio Style: <div class='select-wrapper'><select id='sfx-style-select'>
			<option value='0'>Scorched Earth</option>
			<option value='1' selected>Collisions</option>
			<option value='2'>Hybrid</option>
		</select></div></label>
		<h3>Simulation:</h3>
		<label>Gravity: <input type='number' id='gravity-input' value='${gravity}' step='0.05' min='-50' max='50'/></label>
		<br><label><input type='checkbox' id='auto-connect-checkbox'/>AutoConnect</label>
		<br><label><input type='checkbox' id='terrain-checkbox'/>“Terrain”</label>
		<br><label><input type='checkbox' id='collision-checkbox' checked/>Poor, Broken Collision</label>
		<br><label><input type='checkbox' id='slowmo-checkbox' title='This is not a physically accurate time scale.'/>Slow Motion (Fake)</label>
		<h3>Windows:</h3>
		<button id='make-resizable-window-button'>Resizable Window</button>
		<br><button id='help-button'>Help</button>
		<button id='todo-button'>Todo</button>
	`);

	var $audioCheckbox = ops.$("#sfx-checkbox");
	var $audioVizCheckbox = ops.$("#sfx-viz-checkbox");
	var $audioStyleSelect = ops.$("#sfx-style-select");

	var showAudioSetupError = function () {
		new Modal().position("center").title("Audio Setup Failed").content(`
			<p>Initialization failed, audio is not available.</p>
			<pre class='padded'/>
		`).$c.querySelector("pre").textContent = audioSetupError.stack;
		$audioCheckbox.disabled = true;
		$audioStyleSelect.disabled = true;
		$audioCheckbox.checked = false;
	};
	// TODO: maybe enable/disable audio related sub-controls based on audio checkbox
	// ...except maybe just the audio style - not the viz
	audioEnabled = $audioCheckbox.checked;
	$audioCheckbox.onchange = function () {
		audioEnabled = $audioCheckbox.checked;
		if (typeof audioSetupError !== "undefined") {
			showAudioSetupError();
			return;
		}
	};
	audioStyle = parseInt($audioStyleSelect.value);
	$audioStyleSelect.onchange = function () {
		audioStyle = parseInt($audioStyleSelect.value);
		if (typeof audioSetupError !== "undefined") {
			showAudioSetupError();
			return;
		}
		if (!$audioCheckbox.checked) {
			new Modal().position("center").title("Audio Not Enabled").content(
				"<p>Check the box to enable 'Audio' first.</p>"
			);
			return;
		}
	};
	audioViz = $audioVizCheckbox.checked;
	$audioVizCheckbox.onchange = function () {
		audioViz = $audioVizCheckbox.checked;
		if (!$audioCheckbox.checked && audioViz) {
			new Modal().position("center").title("Audio Not Enabled").content(`
				<p>You <em>can</em> enjoy the viz without sound.</p>
				<p>Check the box to enable 'Audio' to hear it.</p>
			`);
			return;
		}
	};
	ops.$("#collision-checkbox").onchange = function () {
		collision = this.checked;
	};
	ops.$("#auto-connect-checkbox").onchange = function () {
		autoConnect = this.checked;
	};
	ops.$("#slowmo-checkbox").onchange = function () {
		slowmo = this.checked;
	};
	ops.$("#terrain-checkbox").onchange = function () {
		if (this.checked) {
			createTerrain();
		} else {
			for (var i = points.length - 1; i >= 0; i--) {
				if (points[i].color == "green") {
					for (var j = connections.length - 1; j >= 0; j--) {
						var c = connections[j];
						if (c.p1 == points[i]) {
							connections.splice(j, 1);
						}
					}
					points.splice(i, 1);
				}
			}
		}
	};
	ops.$("#gravity-input").onchange = function () {
		gravity = Number(this.value);
	};
	ops.$("#todo-button").onclick = function () {
		new Modal().title("Todo").content(`
			<li>Precise connector tool</li>
			<li>Rope tool</li>
			<li>Drag tool (for touch screens)</li>
			<li>
				Ideally (but this would be hard), fix collision.
				<br>(Things no clip and get stuck in each other.
				<br>It just doesn't really work.)
			</li>
		`).position("top right");
	};
	ops.$("#help-button").onclick = function () {
		new Modal().title("Help").content(`
			<p>Left Click to use the selected tool.
			<br>Right Click to drag points.
			<br>Use the glue tool or hold space near some points to connect them.
			<br>Hold shift when making points to fix them in place.
			<br>Toggle the 'terrain' to regenerate it. It only looks anything like terrain if you check AutoConnect
			<br>Press <kbd>P</kbd> to pause/unpause the simulation.
			<br>Press <kbd>Z</kbd> to undo to a previous state and <kbd>Y</kbd> or <kbd>Shift+Z</kbd> to redo.
			<br>Press <kbd>C</kbd> to copy the selection (or <kbd>X</kbd> to cut), and <kbd>V</kbd> to paste near the mouse.
			<br>Press <kbd>Delete</kbd> to remove the selected points.
		`).position("top");
	};
	ops.$("#make-resizable-window-button").onclick = function () {
		new Modal().position("center").title("Resizable").content("Windows are collidable. Resize me in the bottom right corner.").resizable();
	};
	var tools = new Modal().position("left").title("Tools").content(`
		<button id='create-points-tool'>Create Points (W)</button>
		<br>
		<button id='create-points-fast-tool'>Create Points Quickly (Q)</button>
		<!-- <br> -->
		<!-- <button id='rope-tool' disabled>Rope</button> -->
		<br>
		<button id='glue-tool'>Glue (G)</button>
		<br>
		<!-- <button id='connector-tool' disabled>Precise Connector</button> -->
		<!-- <br> -->
		<button id='selection-tool'>Select (S)</button>
	`);

	var toolButtons = tools.$$("button");

	selectTool = function (id) {
		tool = id;
		for (var i = 0; i < toolButtons.length; i++) {
			var tb = toolButtons[i];
			if (tb.id === id) {
				tb.classList.add("selected");
			} else {
				tb.classList.remove("selected");
			}
		}
	};

	selectTool(tool);
	for (var i = 0; i < toolButtons.length; i++) {
		var tb = toolButtons[i];
		tb.onclick = function () {
			selectTool(this.id);
		};
	}
}

main();
guiStuff();

function connect_if_not_connected(p1, p2, connections, options = {}) {
	var connected = connections.some((connection) =>
		(connection.p1 === p1 && connection.p2 === p2) ||
		(connection.p1 === p2 && connection.p2 === p1)
	);
	if (!connected) {
		connections.push(Object.assign({ p1: p1, p2: p2, dist: 60, force: 1 }, options));
		// connections.push({p1:p1,p2:p2,dist:Math.ceil(d*.15)*10});
	}
}

// Note: radius is not directly proportional to size or numPoints.
function make_ball({ x, y, vx = 0, vy = 0, numPoints = 8, size = 60 }) {
	const ballPoints = [];
	const ballConnections = [];
	for (let i = 0; i < numPoints; i++) {
		ballPoints.push({
			// position could be random but the sin/cos is to help relax it initially.
			x: x + Math.sin(i / numPoints * Math.PI * 2) * size,//position
			y: y + Math.cos(i / numPoints * Math.PI * 2) * size,
			px: x,//previous position
			py: y,
			vx,//velocity
			vy,
			fx: 0,//force
			fy: 0,
			fixed: false,
			color: `hsl(${Math.random() * 360},${Math.random() * 50 + 50}%,${Math.random() * 50 + 50}%)`,
		});
	}
	for (let i = 0; i < numPoints; i++) {
		const p1 = ballPoints[i];
		for (let j = 0; j < numPoints; j++) {
			const p2 = ballPoints[j];
			// Note: it produces some dope shapes with force: 2 
			// connect_if_not_connected(p1, p2, ballConnections, { dist: size, force: 2 });
			connect_if_not_connected(p1, p2, ballConnections, { dist: size, force: 1 });
		}
	}
	points.push(...ballPoints);
	connections.push(...ballConnections);
}

// make_ball({ x: innerWidth / 2, y: innerHeight / 2 });

// Test scene: a bunch of balls of different types.
for (let numPoints = 3, x = 500; numPoints < 5; numPoints+=3, x += 200) {
	for (let size = 30, y = 100; size < 100; size += 30, y += 200, x += 0) {
		make_ball({ numPoints, size, x, y });
	}
}

// Test scene: Throw two balls at each other
// make_ball({ x: innerWidth / 3, y: innerHeight / 2, vx: 5, vy: -3 });
// make_ball({ x: innerWidth * 2/3, y: innerHeight / 2, vx: -5, vy: -3 });

