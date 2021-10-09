
const TOOL_SELECT = "TOOL_SELECT";
const TOOL_ADD_POINTS = "TOOL_ADD_POINTS";
const TOOL_ADD_POINTS_QUICKLY = "TOOL_ADD_POINTS_QUICKLY";
const TOOL_ADD_BALL = "TOOL_ADD_BALL";
const TOOL_ADD_ROPE = "TOOL_ADD_ROPE";
const TOOL_ADD_DOLL = "TOOL_ADD_DOLL";
const TOOL_PRECISE_CONNECTOR = "TOOL_PRECISE_CONNECTOR";
const TOOL_GLUE = "TOOL_GLUE";
const TOOL_DRAG = "TOOL_DRAG";

const tools = [
	{
		id: TOOL_DRAG,
		name: "Drag Points",
		shortcut: "D",
		tooltip: "Drag stuff around. Works when paused or playing. You can also use Right Click as a shortcut. Hold Shift before dragging to drag multiple points you can drag a selection)."
	},
	{
		id: TOOL_ADD_POINTS,
		name: "Add Points",
		shortcut: "A",
		tooltip: "Click anywhere to add a point. Hold Shift to make fixed points."
	},
	{
		id: TOOL_ADD_POINTS_QUICKLY,
		name: "Add Points Quickly",
		shortcut: "Q",
		tooltip: "Create many unconnected points. Hold Shift to make fixed points."
	},
	{
		id: TOOL_ADD_ROPE,
		name: "Make Rope",
		shortcut: "R",
		tooltip: "Create a connected series of points. Hold Shift to make fixed points."
	},
	{
		id: TOOL_ADD_BALL,
		name: "Make Ball",
		shortcut: "B",
		tooltip: "Create balls and polygons. Move the mouse up and down to choose the size, and left and right to choose the number of points. Hold Shift to make sturdier balls (where the connections vary in target length)."
	},
	{
		id: TOOL_ADD_DOLL,
		name: "Make Ragdoll",
		shortcut: "L",
		tooltip: "Create humanoids.",
	},
	{
		id: TOOL_GLUE,
		name: "Glue",
		shortcut: "G",
		tooltip: "Connect any points near the mouse to each other."
	},
	{
		id: TOOL_PRECISE_CONNECTOR,
		name: "Precise Connector",
		shortcut: "C",
		tooltip: "Drag from one point to another to connect them, or if they’re already connected, to delete the connection. Hold Shift to create arbitrary-length connections."
	},
	{
		id: TOOL_SELECT,
		name: "Select",
		shortcut: "S",
		tooltip: "Drag to select points within a rectangle, then Copy (Ctrl+C) and Paste (Ctrl+V) or Delete (Delete). You can also drag the selected points together."
	},
];
// Note: some keyboard shortcuts are handled with `keys` state (for continuous effects).
// Note: aria-keyshortcuts should be kept in sync.
const keyboardShortcuts = [
	{ modifiers: ["CtrlCmd"], code: "KeyZ", action: undo, enable: () => undos.length > 0 },
	{ modifiers: ["CtrlCmd"], code: "KeyY", action: redo, enable: () => redos.length > 0 },
	{ modifiers: ["CtrlCmd", "Shift"], code: "KeyZ", action: redo, enable: () => redos.length > 0 },
	{ modifiers: ["CtrlCmd"], code: "KeyC", action: copySelected, enable: () => selection.points.length > 0 },
	{ modifiers: ["CtrlCmd"], code: "KeyX", action: cutSelected, enable: () => selection.points.length > 0 },
	{ modifiers: ["CtrlCmd"], code: "KeyV", action: paste, enable: () => !!serializedClipboard },
	{ modifiers: ["CtrlCmd"], code: "KeyA", action: selectAll, enable: () => points.length > 0 },
	{
		modifiers: ["CtrlCmd"], code: "KeyD", action: deselect,
		enable: () => selection.points.length > 0 || selection.connections.length > 0,
	},
	{ modifiers: [], code: "Delete", action: deleteSelected },
	{ modifiers: [], code: "KeyP", action: togglePlay },
	{ modifiers: [], code: "F1", action: () => windowToggles.help.toggleWindow() },

	// Glue selected points together without selecting the Glue tool.
	// This handled elsewhere except for creating an undo state.
	{ modifiers: [], code: "Space", action: undoable },

	// Add points without selecting the Add Points tool.
	{ modifiers: [], code: "Period", action: add_point_at_mouse_undoable },
	{ modifiers: ["Shift"], code: "Period", action: add_point_at_mouse_undoable },
	{ modifiers: [], code: "NumpadDecimal", action: add_point_at_mouse_undoable },
	// Shift+NumpadDecimal may not work because it sends "Delete" instead, but it’s awkward to use anyways.
	{ modifiers: ["Shift"], code: "NumpadDecimal", action: add_point_at_mouse_undoable },
];
// Add keyboard shortcuts for selecting tools.
for (const tool of tools) {
	keyboardShortcuts.push({
		modifiers: [], code: `Key${tool.shortcut}`, action: () => {
			selectTool(tool.id);
		}
	});
}


var canvas = document.createElement("canvas");
var ctx = canvas.getContext("2d");
document.body.appendChild(canvas);

// world state
var connections = [];
var points = [];

// interaction state
var mouse = { x: 0, y: 0, d: 0, pointerId: -1 };
var mousePrevious = { x: 0, y: 0, d: 0, pointerId: -1 };
var keys = {};

var selectedTool = TOOL_ADD_POINTS;
var lastRopePoint = null;
var connectorToolPoint = null;
var ballToolStates = []; // {ball, startPos, pointerPos,pointerId}
var dragStates = []; // {dragging, dragOffsets, pointerPos, pointerId}
var rmbDragState = null;
var selection = {
	points: [],
	connections: []
};
var undos = [];
var redos = [];
var serializedClipboard = null;

// tool parameters
const mouseDragForce = 0.1;
const mouseDragDampingFactor = 0.5;
const mouseDragLerpDistance = 30;
const dragMaxDistToSelect = 100; // for picking points to drag
const preciseConnectorMaxDistToSelect = 60; // for picking points to connect
const glueMaxDistToMouse = 30;
const glueMaxDistBetweenPoints = 50;
const autoConnectMaxDist = 50;

// options
var play = true;
var collision = false;
var slowmo = false; // TODO: generalize to a time scale
var autoConnect = false;
var gravity = 0.1;
var terrainEnabled = false;
var audioEnabled = false;
var audioStyle = 1;
var audioViz = false;
var ghostTrails = 0;
var windowTheme = "sandbox-theme"; // global used by index.html, and used as ID for <link>

// debug
var debugPolygons = []; // reset per frame
var debugLines = []; // reset per frame

// derived state for performance optimization
// Note: `groups` is computed manually when needed, at most once per frame (with a flag)
var groups = new Map(); // point to group id, for connected groups (used for avoiding self-collision)
var groupsComputedThisFrame = false;

// audio (initialized later)
var actx; // AudioContext
var oscillator; // OscillatorNode
var gain; // GainNode
var creakBuffer; // AudioBuffer used for creaking wood noise
var creakDist = 30; // distance from last creak

// windows
var $optionsWindow;
var $toolsWindow;
var $helpWindow;
var $aboutWindow;
var $todoWindow;

function serialize(points, connections, isSelection) {
	// Note: if I ever change this to JSON,
	// I should bump the version to >2, since ARSON stringifies as JSON but with values as indices,
	// and formatVersion ends up looking like `formatVersion:2`
	// Also don’t reorder these keys, because that could make it `formatVersion:<some other number>`
	// That said, this is just a toy, and there’s no actual import/export feature.
	return ARSON.stringify({
		format: "pbj-sandbox",
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

function selectAll() {
	selection.points = Array.from(points);
	selection.connections = Array.from(connections);
}
function deselect() {
	selection.points = [];
	selection.connections = [];
}
function copySelected() {
	serializedClipboard = serialize(selection.points, selection.connections, true);
}
function cutSelected() {
	// undoable is in deleteSelected()
	copySelected();
	deleteSelected();
}
function deletePoints(pointsToDelete) {
	// (no undoable! maybe I should indicate this in the function names somehow)
	for (var i = pointsToDelete.length - 1; i >= 0; i--) {
		var p = pointsToDelete[i];
		for (var j = connections.length - 1; j >= 0; j--) {
			var c = connections[j];
			if (c.p1 === p || c.p2 === p) {
				connections.splice(j, 1);
			}
		}
		points.splice(points.indexOf(p), 1);
	}
}
function deleteSelected() {
	undoable();
	deletePoints(selection.points);
	deselect();
}
function paste() {
	undoable();
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

function togglePlay() {
	play = !play;
	document.getElementById("play-checkbox").checked = play;
}

function main() {
	canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

	addEventListener("keydown", function (e) {
		if (e.defaultPrevented) {
			return;
		}
		if (
			document.activeElement instanceof HTMLInputElement ||
			document.activeElement instanceof HTMLTextAreaElement ||
			!window.getSelection().isCollapsed
		) {
			return; // don’t prevent interaction with inputs or textareas, or copying text in windows
		}

		keys[e.key] = true;
		keys[e.code] = true;
		// console.log(`key "${e.key}", code "${e.code}", keyCode ${e.keyCode}`);

		let matched = false;
		for (const shortcut of keyboardShortcuts) {
			if (
				(
					shortcut.modifiers.includes("CtrlCmd") ? (
						e.ctrlKey || e.metaKey
					) : (
						e.ctrlKey === shortcut.modifiers.includes("Ctrl") &&
						e.metaKey === shortcut.modifiers.includes("Meta")
					)
				) &&
				e.shiftKey === shortcut.modifiers.includes("Shift") &&
				e.altKey === shortcut.modifiers.includes("Alt") &&
				(
					("code" in shortcut && e.code === shortcut.code) ||
					("key" in shortcut && e.key === shortcut.key) ||
					("keyCode" in shortcut && e.keyCode === shortcut.keyCode)
				) &&
				(shortcut.repeatable || !e.repeat) &&
				(typeof shortcut.enable === "function" ? shortcut.enable() : (shortcut.enable ?? true))
			) {
				e.preventDefault();
				shortcut.action();
				// console.log("Triggered shortcut:", shortcut);
				matched = true;
				break;
			}
		}
		// if (!matched) {
		// 	console.log("No shortcut matched:", e);
		// }
	});
	addEventListener("keyup", function (e) { delete keys[e.key]; delete keys[e.code]; });
	addEventListener("blur", function (e) { keys = {}; }); // prevents stuck keys, especially Shift when switching tabs with Ctrl+Shift+Tab (also Ctrl+Shift+T, Ctrl+Shift+N, etc.)
	var deselectTextAndBlur = function () {
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
	var toWorldCoords = function (pageX, pageY) {
		var rect = canvas.getBoundingClientRect();
		return {
			x: pageX - rect.left,
			y: pageY - rect.top,
		};
	};
	var updateMouse = function ({ pageX, pageY, pointerId }) {
		const mousePos = toWorldCoords(pageX, pageY);
		mouse.x = mousePos.x;
		mouse.y = mousePos.y;
		mouse.pointerId = pointerId;
	};
	canvas.style.touchAction = "none";
	canvas.addEventListener("pointerdown", function (e) {
		updateMouse(e);
		if (e.button == 0) {
			mouse.left = true;
		} else {
			mouse.right = true;
		}
		if (e.button == 0) {
			if (selectedTool === TOOL_DRAG) {
				startDrag(toWorldCoords(e.pageX, e.pageY), e.pointerId);
			} else if (selectedTool === TOOL_ADD_BALL) {
				undoable();
				ballToolStates.push({
					ball: null,
					startPos: toWorldCoords(e.pageX, e.pageY),
					pointerPos: toWorldCoords(e.pageX, e.pageY),
					pointerId: e.pointerId,
				});
			}
		}
		e.preventDefault();
		deselectTextAndBlur();
	});
	addEventListener("pointerup", function (e) {
		if (e.button == 0) {
			mouse.left = false;
		} else {
			mouse.right = false;
		}
		for (const dragState of dragStates) {
			if (dragState.pointerId === e.pointerId) {
				dragStates.splice(dragStates.indexOf(dragState), 1);
			}
		}
		for (const ballToolState of ballToolStates) {
			if (ballToolState.pointerId === e.pointerId) {
				ballToolStates.splice(ballToolStates.indexOf(ballToolState), 1);
			}
		}
		e.preventDefault();
	});
	addEventListener("pointercancel", function (e) {
		if (e.button == 0) {
			mouse.left = false;
		} else {
			mouse.right = false;
		}
		e.preventDefault();
	});
	addEventListener("pointermove", function (e) {
		updateMouse(e);
		for (const dragState of dragStates) {
			if (dragState.pointerId === e.pointerId) {
				dragState.pointerPos = toWorldCoords(e.pageX, e.pageY);
			}
		}
		for (const ballToolState of ballToolStates) {
			if (ballToolState.pointerId === e.pointerId) {
				ballToolState.pointerPos = toWorldCoords(e.pageX, e.pageY);
			}
		}
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
		oscillator.type = "square";
		oscillator.frequency.setValueAtTime(440, actx.currentTime); // value in hertz
		oscillator.connect(gain);
		oscillator.start();

		creakBuffer = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
		const data = creakBuffer.getChannelData(0);
		// for (var i = 0; i < data.length; i++) {
		// data[i] =
		// 	((Math.random() * 2 - 1) * Math.pow((i - data.length) / actx.sampleRate, 2) / 10) +
		// 	// sand noise
		// 	// ((Math.random() * 2 - 1) * Math.pow((i - data.length) / actx.sampleRate, 2) / 10);
		// 	0;
		// }
		// generate pink noise
		const s = { b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0 };
		for (var i = 0; i < data.length; i++) {
			let white = Math.random() * 2 - 1;
			s.b0 = 0.99886 * s.b0 + white * 0.0555179;
			s.b1 = 0.99332 * s.b1 + white * 0.0750759;
			s.b2 = 0.96900 * s.b2 + white * 0.1538520;
			s.b3 = 0.86650 * s.b3 + white * 0.3104856;
			s.b4 = 0.55000 * s.b4 + white * 0.5329522;
			s.b5 = -0.7616 * s.b5 - white * 0.0168980;
			data[i] = s.b0 + s.b1 + s.b2 + s.b3 + s.b4 + s.b5 + s.b6 + white * 0.5362;
			data[i] *= 0.11;
			// just messing around with the sound
			// for (var j = 0; j < 6; j++) {
			// 	s["b" + j] *= Math.sin(i * 0.001 + j * 5.1);
			// }
			s.b6 = white * 0.115926;
		}
		// made it decay and add some sine waves
		for (var i = 0; i < data.length; i++) {
			for (var j = 0; j < 10; j++) {
				data[i] += Math.sin(i / actx.sampleRate * 51 * (j * 2.1 + 50)) * 0.1;
			}
			data[i] *= Math.pow(1 - (i / data.length), 20) / 10;
		}
		// tiny metal tink / zipper noise
		// creakBuffer = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
		// const data = creakBuffer.getChannelData(0);
		// for (var i = 0; i < data.length; i++) {
		// 	data[i] +=
		// 		// ((Math.sin(i/actx.sampleRate*460000) * 2 - 1) * Math.pow((i - data.length) / actx.sampleRate, 30) / 10) +
		// 		// sand noise
		// 		((Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2) / 20);
		// 		// 0;
		// }

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
	ctx.moveTo(-headSize, -length + headSize);
	ctx.lineTo(0, -length);
	ctx.lineTo(headSize, -length + headSize);
	ctx.restore();
	ctx.stroke();
}

function toolDraw(ctx, intent, dragging, bold, p1, p2) {
	// Highlight a point or line segment for Precise Connector, Glue, and Drag tools.
	// `intent` can be "disconnect", "connect", "connect-varying-length", or "drag"

	ctx.save();
	const alpha = bold ? 1 : dragging ? 0.7 : 0.5;
	ctx.strokeStyle =
		intent === "disconnect" ? `rgba(255, 0, 0, ${alpha})` :
			intent === "connect-varying-length" ?
				`rgba(255, 255, 0, ${alpha})` :
				`rgba(0, 255, 200, ${alpha})`;
	if (p1) {
		ctx.lineWidth = bold ? 2 : 1;
		ctx.beginPath();
		ctx.arc(p1.x, p1.y, 5, 0, 2 * Math.PI);
		ctx.stroke();
	}
	if (p2) {
		ctx.lineWidth = bold ? 2 : 1;
		ctx.beginPath();
		ctx.arc(p2.x, p2.y, 5, 0, 2 * Math.PI);
		ctx.stroke();
	}
	if (p1 && p2) {
		if (intent === "disconnect") {
			ctx.lineWidth = 4; // has to be visible together with the existing connection’s line
		} else {
			ctx.lineWidth = bold ? 2 : 1;
		}
		ctx.beginPath();
		ctx.moveTo(p1.x, p1.y);
		ctx.lineTo(p2.x, p2.y);
		ctx.stroke();
	}
	ctx.restore();
}

function computeGroups() {
	// find connected groups of points
	groups.clear();
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
function areConnected(p1, p2) {
	if (p1.fixed && p2.fixed) return false;
	return groups.get(p1) == groups.get(p2);
}
function areDirectlyConnected(p1, p2, connections) {
	// if the groups are already connected, using that information could be an optimization
	// but not in this function if `connections` is an argument!
	// if (groupsComputedThisFrame && !areConnected(p1, p2)) return false;
	for (const connection of connections) {
		if (connection.p1 == p1 && connection.p2 == p2) return true;
		if (connection.p1 == p2 && connection.p2 == p1) return true;
	}
	return false;
}
function countConnections(point) {
	let count = 0;
	for (const connection of connections) {
		if (connection.p1 === point) count++;
		if (connection.p2 === point) count++;
	}
	return count;
}
function findClosestPoint(x, y, maxDistance = Infinity) {
	let closestPoint = null;
	let closestDist = maxDistance;
	for (const point of points) {
		const distance = Math.hypot(x - point.x, y - point.y);
		if (distance < closestDist) {
			closestDist = distance;
			closestPoint = point;
		}
	}
	return closestPoint;
}

function startDrag({ x, y }, pointerId) {
	const nearToMouse = findClosestPoint(x, y, dragMaxDistToSelect);
	if (nearToMouse) {
		undoable();
		let dragging = [nearToMouse];
		// select all connected points with Shift
		if (keys.Shift) {
			if (!groupsComputedThisFrame) {
				computeGroups();
				groupsComputedThisFrame = true;
			}
			dragging = points.filter(p => groups.get(p) === groups.get(nearToMouse));
		}
		// if there’s a selection, drag the whole selection
		if (selection.points.includes(nearToMouse)) {
			dragging = Array.from(selection.points);
		}

		let dragOffsets;
		if (dragging.length === 1) {
			dragOffsets = [{ x: 0, y: 0 }];
		} else {
			dragOffsets = dragging.map(p => ({
				x: p.x - x,
				y: p.y - y,
			}));
		}
		dragStates.push({
			dragging,
			dragOffsets,
			pointerId,
			pointerPos: { x, y },
		});
	}
}


function step() {
	// Drawing setup
	if (canvas.width != innerWidth || canvas.height != innerHeight) {
		canvas.width = innerWidth;
		canvas.height = innerHeight;
		// Clear to black immediately (initially and on resize), for ghost trails mode
		ctx.fillStyle = "black";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	// Clear, or partially clear, leaving a trail.
	// If paused with ghost trails enabled, don’t clear at all.
	const alpha = play ? Math.pow(1 - ghostTrails, 4) : (ghostTrails > 0 ? 0 : 1);
	ctx.fillStyle = `rgba(0,0,20,${alpha})`;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.lineWidth = 1;

	ctx.save();

	groupsComputedThisFrame = false;

	// I don’t want to trigger multiple tools at once,
	// so I’m temporarily changing the selected tool for transient tool shortcuts.
	// This way I don’t have to worry about the if-else chain much.
	// TODO: should I also show the temporary tool in the toolbox?
	const prevTool = selectedTool;

	// Quickly switch to the Precise Connector tool and back when you release ‘/’
	// Other ways this could work (alternate UI ideas):
	// - Add a point at the mouse connected to the closest point.
	// - Connect the two points closest to the mouse.
	if (keys.Slash) {
		selectedTool = TOOL_PRECISE_CONNECTOR;
	}
	// handled differently (Space immediately triggers the Glue tool’s behavior)
	// not sure it SHOULD though? could try it the other way
	// if (keys.Space) {
	// 	selectedTool = TOOL_GLUE;
	// }

	if (selectedTool === TOOL_SELECT && mouse.left && mousePrevious.left) {
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
			if (
				c.p1.x < selection.x2 && c.p1.x > selection.x1 &&
				c.p1.y < selection.y2 && c.p1.y > selection.y1 &&
				c.p2.x < selection.x2 && c.p2.x > selection.x1 &&
				c.p2.y < selection.y2 && c.p2.y > selection.y1
			) {
				selection.connections.push(c);
			}
		}
		for (var i = points.length - 1; i >= 0; i--) {
			var p = points[i];
			if (
				p.x < selection.x2 && p.x > selection.x1 &&
				p.y < selection.y2 && p.y > selection.y1
			) {
				selection.points.push(p);
			}
		}

		// draw selection rectangle
		ctx.fillStyle = `rgba(0,255,200,${ghostTrails ? 0.01 : 0.1})`;
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

	if (selectedTool === TOOL_SELECT) {
		if (mouse.left && !mousePrevious.left) {
			selection = { x: mouse.x, y: mouse.y, points: [], connections: [] };
		}
	} else if (selectedTool === TOOL_ADD_POINTS || selectedTool === TOOL_ADD_POINTS_QUICKLY) {
		if (mouse.left && (!mousePrevious.left || selectedTool === TOOL_ADD_POINTS_QUICKLY)) {
			if (!mousePrevious.left) undoable();
			add_point_at_mouse();
		}
	} else if (selectedTool === TOOL_ADD_BALL) {
		for (const ballToolState of ballToolStates) {
			const { startPos, pointerPos } = ballToolState;
			if (ballToolState.ball) {
				// remove old ball’s points and connections
				deletePoints(ballToolState.ball.points);
			}
			const variableDistances = keys.Shift;
			ballToolState.ball = add_ball({
				// x: mouse.x,
				// y: mouse.y,
				// numPoints: 5 + ~~(Math.random() * 4),
				// size: 20 + Math.random() * 130,
				// variableDistances: Math.random() > 0.5,
				x: startPos.x,
				y: startPos.y,
				numPoints: ~~(Math.min(variableDistances ? 20 : 13, Math.max(3, (pointerPos.x - startPos.x) / 100 + 8))),
				size: ~~(Math.abs(pointerPos.y - startPos.y) / 2 + 20),
				variableDistances,
			});
		}
	} else if (selectedTool === TOOL_ADD_DOLL) {
		if (mouse.left && !mousePrevious.left) {
			undoable();
			add_doll({ x: mouse.x, y: mouse.y });
		}
	} else if (selectedTool === TOOL_ADD_ROPE) {
		if (mouse.left) {
			if (!mousePrevious.left) {
				undoable();
			}
			const distBetweenPoints = 20;
			let distToLast = lastRopePoint ? Math.hypot(mouse.x - lastRopePoint.x, mouse.y - lastRopePoint.y) : Infinity;
			while (distToLast > distBetweenPoints) {
				const newX = lastRopePoint ? lastRopePoint.x + (mouse.x - lastRopePoint.x) / distToLast * distBetweenPoints : mouse.x;
				const newY = lastRopePoint ? lastRopePoint.y + (mouse.y - lastRopePoint.y) / distToLast * distBetweenPoints : mouse.y;
				const newRopePoint = make_point({
					x: newX,
					y: newY,
					fixed: keys.Shift,
					color: keys.Shift ? "grey" : "#ce9e6b" //`hsl(${Math.random() * 50},${Math.random() * 50 + 15}%,${Math.random() * 50 + 50}%)`,
				});
				points.push(newRopePoint);
				if (lastRopePoint) {
					connections.push({
						p1: lastRopePoint,
						p2: newRopePoint,
						dist: distBetweenPoints,
						force: 1,
					});
				}
				lastRopePoint = newRopePoint;
				distToLast = lastRopePoint ? Math.hypot(mouse.x - lastRopePoint.x, mouse.y - lastRopePoint.y) : Infinity;
			}
		} else {
			lastRopePoint = null;
		}
	} else if (selectedTool === TOOL_PRECISE_CONNECTOR) {
		// I feel like angular similarity should also factor into this,
		// maybe use polar coordinates and weigh the angle vs distance?
		const closestPoint = findClosestPoint(mouse.x, mouse.y, preciseConnectorMaxDistToSelect);

		const distBetweenPoints =
			(connectorToolPoint && closestPoint) ?
				Math.hypot(connectorToolPoint.x - closestPoint.x, connectorToolPoint.y - closestPoint.y) :
				0;
		// going with a standard distance for connections, unless it’s too long
		// (at some point it would break), and in that case a custom distance
		const standardDistance = 60;
		const useCustomDistance = keys.Shift || distBetweenPoints > standardDistance * 2;
		const existingConnection = connections.find(c =>
			(c.p1 === connectorToolPoint && c.p2 === closestPoint) ||
			(c.p2 === connectorToolPoint && c.p1 === closestPoint)
		);
		const canSelect = closestPoint && closestPoint !== connectorToolPoint;
		const canConnect = connectorToolPoint && canSelect && !existingConnection;

		if (mouse.left && !mousePrevious.left) {
			connectorToolPoint = closestPoint;
		} else if (mousePrevious.left && !mouse.left) {
			if (canConnect) {
				undoable();
				connections.push({
					p1: connectorToolPoint,
					p2: closestPoint,
					dist: useCustomDistance ? distBetweenPoints : standardDistance,
					force: 1,
				});
			} else if (existingConnection) {
				undoable();
				const index = connections.indexOf(existingConnection);
				if (index > -1) {
					connections.splice(index, 1);
				}
			}
			connectorToolPoint = null;
		}
		if (canSelect || connectorToolPoint) {
			toolDraw(ctx,
				existingConnection ? "disconnect" :
					useCustomDistance ? "connect-varying-length" : "connect",
				!!connectorToolPoint,
				canConnect || existingConnection,
				connectorToolPoint,
				canSelect ? closestPoint : mouse
			);
		}
	} else if (selectedTool === TOOL_GLUE) {
		// handled elsewhere, except for creating undoable state
		if (mouse.left && !mousePrevious.left) {
			undoable();
		}
	}
	const nearToMouse = findClosestPoint(mouse.x, mouse.y, dragMaxDistToSelect);
	if (mouse.right && !mousePrevious.right) { // using LMB with Drag tool is handled elsewhere
		rmbDragState = startDrag(mouse, mouse.pointerId);
	}
	if (!mouse.right && rmbDragState) {
		const index = dragStates.indexOf(rmbDragState);
		if (index > -1) {
			dragStates.splice(index, 1);
		}
		rmbDragState = null;
	}
	for (const { dragging, dragOffsets, pointerPos } of dragStates) {
		if (dragging.length) {
			for (let i = 0; i < dragging.length; i++) {
				const p = dragging[i];
				const target_x = pointerPos.x + dragOffsets[i].x;
				const target_y = pointerPos.y + dragOffsets[i].y;

				if (play && !p.fixed) {
					p.fx += (target_x - p.x) * mouseDragForce;
					p.fy += (target_y - p.y) * mouseDragForce;
					p.vx *= mouseDragDampingFactor;
					p.vy *= mouseDragDampingFactor;
					// within a certain distance, lerp to the target
					const dist = Math.hypot(target_x - p.x, target_y - p.y);
					const factor = 1 - Math.min(1, dist / mouseDragLerpDistance);
					p.x += (target_x - p.x) * factor;
					p.y += (target_y - p.y) * factor;
				} else {
					p.x = target_x;
					p.y = target_y;
				}
			}
		}
	}
	if (selectedTool === TOOL_DRAG && dragStates.every(({ dragging }) => !dragging.length) && nearToMouse) {
		toolDraw(ctx, "drag", false, false, nearToMouse);
	} else {
		for (const { dragging } of dragStates) {
			for (const p of dragging) {
				toolDraw(ctx, "drag", true, false, p);
			}
		}
	}
	if (selectedTool !== TOOL_ADD_ROPE) {
		// not important
		// just prevents a weird scenario where you can continue a rope after switching tools while making a rope
		lastRopePoint = null;
		// you could do a similar thing with the select tool, but whatever
		// it’s not like something bad happens
	}

	if (play) {

		var freq = 440; // or something
		var amplitude = 0;
		//for(var g=0;g<4;g++){
		for (var j = connections.length - 1; j >= 0; j--) {
			var c = connections[j];
			var d = Math.hypot((c.p1.x + c.p1.vx) - (c.p2.x + c.p2.vx), (c.p1.y + c.p1.vy) - (c.p2.y + c.p2.vy));
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
			// special handling for ragdolls
			// try to keep legs’ points vertically aligned
			if ((c.p1.part === "foot" && c.p2.part === "knee") || (c.p2.part === "foot" && c.p1.part === "knee")) {
				const foot = c.p1.part === "foot" ? c.p1 : c.p2;
				const knee = c.p1.part === "foot" ? c.p2 : c.p1;
				if (knee.y > foot.y) {
					knee.fy -= 0.5;
					foot.fy += 0.5;
				} else {
					foot.fx += (knee.x - foot.x) * 0.5;
					knee.fx -= (knee.x - foot.x) * 0.5;
				}
				foot.fx += Math.sin(Date.now() / 400 + foot.side * Math.PI / 4) * 0.6;
			}
			if ((c.p1.part === "knee" && c.p2.part === "hip") || (c.p2.part === "knee" && c.p1.part === "hip")) {
				const knee = c.p1.part === "knee" ? c.p1 : c.p2;
				const hip = c.p1.part === "knee" ? c.p2 : c.p1;
				if (hip.y > knee.y) {
					hip.fy -= 0.5;
					knee.fy += 0.5;
				} else {
					knee.fx += (hip.x - knee.x) * 0.05;
					hip.fx -= (hip.x - knee.x) * 0.05;
				}
			}
			// and body (chest/bottom)
			if ((c.p1.part === "chest" && c.p2.part === "bottom") || (c.p2.part === "chest" && c.p1.part === "bottom")) {
				const chest = c.p1.part === "chest" ? c.p1 : c.p2;
				const bottom = c.p1.part === "chest" ? c.p2 : c.p1;
				chest.fx += (bottom.x - chest.x) * 0.2;
				bottom.fx -= (bottom.x - chest.x) * 0.2;
				bottom.fx += Math.sin(Date.now() / 400 * 2) * 0.6;
			}

			// breaking distance was previously c.dist * 3; c.dist + 120 keeps it the same for the standard distance of 60 (60*3 = 180 = 60 + 120), while making the rope stronger
			if (dd > c.dist + 120) {
				connections.splice(j, 1);
				// console.log(dd);
				amplitude += Math.min(Math.abs(dd), 100) / 100;
				freq = 0;
			}
			if (!c.p1.fixed && !c.p2.fixed) {
				var vd = Math.hypot(c.p1.vx - c.p2.vx, c.p1.vy - c.p2.vy);
				var fd = Math.hypot(c.p1.fx - c.p2.fx, c.p1.fy - c.p2.fy);
				var v = Math.hypot(c.p1.vx, c.p1.vy) + Math.hypot(c.p2.vx, c.p2.vy);
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

	const windowElements = document.querySelectorAll(".os-window:not(.closing), #always-available-controls button");
	for (const windowElement of windowElements) {
		windowElement.rect = windowElement.getBoundingClientRect();
		if (windowElement.rect_at_last_creak) {
			const delta_width = windowElement.rect.width - windowElement.rect_at_last_creak.width;
			const delta_height = windowElement.rect.height - windowElement.rect_at_last_creak.height;
			if (Math.abs(delta_width) + Math.abs(delta_height) > creakDist) {
				windowElement.rect_at_last_creak = windowElement.rect;
				const creakVolume = Math.min(1, creakDist / 100);
				const creakGain = actx.createGain();
				const bufferSource = actx.createBufferSource();
				bufferSource.buffer = creakBuffer;
				bufferSource.connect(creakGain);
				// bufferSource.playbackRate.value = (Math.abs(delta_height) + Math.abs(delta_width)) / 100;
				bufferSource.playbackRate.value = 1000 / Math.pow(windowElement.rect.width + 200, 0.45) / Math.pow(windowElement.rect.height + 200, 0.45);
				// console.log(bufferSource.playbackRate.value);
				creakGain.connect(actx.destination);
				bufferSource.start();
				creakGain.gain.setValueAtTime(creakVolume, actx.currentTime);
				// creakDist += 1;
				creakDist += Math.random() * 10;
			}
		} else {
			windowElement.rect_at_last_creak = windowElement.rect;
		}
		windowElement.prev_rect = windowElement.rect;
	}
	creakDist *= 0.99;

	//Draw and step the points.
	let time = performance.now();
	for (var i = points.length - 1; i >= 0; i--) {
		var p = points[i];
		if (play && !p.fixed) {
			// Apply connection forces.
			p.vx += p.fx;
			p.vy += p.fy;
			// "air friction"
			//p.vx*=0.99;
			//p.vy*=0.99;
			// Gravity, and special handling for flowers and ragdolls.
			if (p.color === "DarkOrchid") {
				const wind_x = Math.sin(time / 1000 * (1 + Math.sin(time / 10000)) + p.x / 400) / 20;
				// const wind_y = Math.sin(time / 1000 * (1 + Math.sin(time / 10000)) + p.y / 400) / 20;
				// if (p.connections.length) {
				p.vy -= gravity * 3;
				// } else {
				// 	p.vy += wind_y;
				// }
				p.vx *= 0.9;
				p.vy *= 0.9;
				p.vx += wind_x;
				// p.vy += wind_y;
			} else if (p.part) {
				p.vy += gravity;
				if (p.part === "head") {
					p.vy -= gravity * 1.5;
				} else if (p.part === "chest") {
					p.vy -= gravity * 2.5;
				} else if (p.part === "shoulder") {
					p.vy -= gravity * 0.2;
				} else if (p.part === "hand") {
					p.vx += Math.sin(time / 1000 * (1 + Math.sin(time / 10000)) + p.x / 400) / 20;
				} else if (p.part === "hip") {
					p.vy -= gravity * 0.5;
				}
			} else {
				p.vy += gravity;
			}
			// Move
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
			for (const windowElement of windowElements) {
				let r = windowElement.rect;
				const o = 3;
				r = { left: r.left - o, top: r.top - o, right: r.right + o, bottom: r.bottom + o };
				r.width = r.right - r.left;
				r.height = r.bottom - r.top;
				if (
					p.x >= r.left && p.x <= r.right &&
					p.y >= r.top && p.y <= r.bottom
				) {
					// convert to rect unit coords (0 = left, 1 = right, 0 = top, 1 = bottom)
					// then find whether it’s in each of two diagonal halves
					// and use that to find whether it’s in opposing diagonal quadrants
					// i.e. whether it’s more horizontal or more vertical
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
		// draw point
		ctx.fillStyle = p.color;
		if (p.color === "DarkOrchid") {
			ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
			ctx.save();
			ctx.translate(p.x, p.y);
			ctx.rotate(Math.PI / 4);
			ctx.fillRect(- 4, - 4, 8, 8);
			ctx.restore();
			ctx.fillStyle = "yellow";
			ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
		} else {
			ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
		}
		// debug (looks cool btw)
		// if (groups.has(p)) {
		// 	ctx.textAlign = "center";
		// 	ctx.textBaseline = "middle";
		// 	ctx.fillText(groups.get(p), p.x, p.y);
		// } else {
		// 	ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
		// }

		var distToMouse = Math.hypot(p.x - mouse.x, p.y - mouse.y);

		for (var j = points.length - 1; j >= 0; j--) {
			if (i == j) continue;
			var p2 = points[j];
			var d = Math.hypot(p.x - p2.x, p.y - p2.y);

			// Note: Auto-Connect is not Glue (but Spacebar is Glue)
			// also these are definite "can" and "will do" booleans
			let canGlue = distToMouse < glueMaxDistToMouse && d < glueMaxDistBetweenPoints;
			let doGlue = canGlue &&
				((selectedTool === TOOL_GLUE && mouse.left) || keys.Space);

			if (
				// Glue tool (undoable handled elsewhere)
				doGlue ||
				// Auto-Connect behavior
				(autoConnect &&
					d < autoConnectMaxDist &&
					countConnections(p) < 6 &&
					countConnections(p2) < 3 &&
					// don’t connect to terrain
					p.color !== "green" &&
					p2.color !== "green" &&
					p.color !== "DarkOrchid" &&
					p2.color !== "DarkOrchid"
				)
			) {
				if (areDirectlyConnected(p, p2, connections)) {
					canGlue = doGlue = false;
				} else {
					connections.push({ p1: p, p2: p2, dist: 60, force: 1 });
				}
			} else {
				if (areDirectlyConnected(p, p2, connections)) {
					canGlue = doGlue = false;
				} else if (canGlue && selectedTool === TOOL_GLUE) {
					toolDraw(ctx, "connect", false, false, p, p2);
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
		if (collision && play) {
			for (var i = points.length - 1; i >= 0; i--) {
				var p = points[i];
				if (p == c.p1 || p == c.p2) continue;
				if (areConnected(p, c.p1)) continue;
				// if (areConnected(p, c.p2)) continue; // assuming the connectedness works, this is unnecessary
				//this check shouldn’t be here
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
					// the real problem is... well it’s unreliable, I’m trying to figure it out

					// I’m gonna try enlarging quad region?
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
						// Note: normal can point either way
						// IMPORTANT NOTE: normal is not in the same coordinate system as bounce_angle,
						// hence the negation when rendering the normal’s arrow
						// THIS IS NOT INTENTIONAL, it’s just bad math.
						// I tried flipping the signs and sines and cosines for a while
						// but didn’t get it to work while being more sensible.
						// Maybe later I’ll go at it again.
						// (Keep in mind, the drawArrow function is also arbitrary in its base angle)
						var normal = Math.atan2(c.p1.x - c.p2.x, c.p1.y - c.p2.y) + Math.PI / 2;
						var p_vx_connection_space = Math.sin(normal) * p.vx + Math.cos(normal) * p.vy; // normal-aligned space
						var p_vy_connection_space = Math.cos(normal) * p.vx - Math.sin(normal) * p.vy;
						var p1_vx_connection_space = Math.sin(normal) * c.p1.vx + Math.cos(normal) * c.p1.vy;
						var p2_vx_connection_space = Math.sin(normal) * c.p2.vx + Math.cos(normal) * c.p2.vy;
						var p_bounce_angle_connection_space = Math.atan2(p_vy_connection_space, p_vx_connection_space);
						var p_bounce_angle = p_bounce_angle_connection_space - normal;
						// TODO: determine this from positions instead of velocities?
						var on_one_side_of_line = p_vx_connection_space > 0 ? false : p_vx_connection_space < 0 ? true :
							// for points that are fixed/unmoving, determine the side the point is on from the line’s velocity
							// FIXME: this doesn’t make sense if the line is rotating
							(p1_vx_connection_space + p2_vx_connection_space) / 2 > 0;

						// apply a force to the line from the particle
						const p1_dist = Math.hypot(p.x - c.p1.x, p.y - c.p1.y);
						const p2_dist = Math.hypot(p.x - c.p2.x, p.y - c.p2.y);
						const f = 1 / 2 / (p1_dist + p2_dist);
						c.p1.fx += p.vx * p2_dist * f;
						c.p1.fy += p.vy * p2_dist * f;
						c.p2.fx += p.vx * p1_dist * f;
						c.p2.fy += p.vy * p1_dist * f;

						const line_bounce_force = 2;
						c.p1.vx -= (c.p1.vx + c.p2.vx) / 2 * line_bounce_force;
						c.p1.vy -= (c.p1.vy + c.p2.vy) / 2 * line_bounce_force;
						c.p2.vx -= (c.p1.vx + c.p2.vx) / 2 * line_bounce_force;
						c.p2.vy -= (c.p1.vy + c.p2.vy) / 2 * line_bounce_force;

						// move the line so it doesn’t collide immediately again
						var hack = 1;
						// which side the particle is further away from, move the line to that side
						var towards_a_side_x = Math.sin(normal + (on_one_side_of_line ? Math.PI : 0));
						var towards_a_side_y = Math.cos(normal + (on_one_side_of_line ? Math.PI : 0));
						var p1_x_off = c.p1.x + towards_a_side_x * hack;
						var p1_y_off = c.p1.y + towards_a_side_y * hack;
						var p2_x_off = c.p2.x + towards_a_side_x * hack;
						var p2_y_off = c.p2.y + towards_a_side_y * hack;
						if (!c.p1.fixed) {
							c.p1.x = p1_x_off;
							c.p1.y = p1_y_off;
						}
						if (!c.p2.fixed) {
							c.p2.x = p2_x_off;
							c.p2.y = p2_y_off;
						}
						// debugLines.push({
						// 	p1: { x: p1_x_off, y: p1_y_off },
						// 	p2: { x: p2_x_off, y: p2_y_off },
						// 	color: on_one_side_of_line ? "#00afff" : "#ff00ff",
						// });

						// more accurate bounce, right? if we use the intersection point
						p.x = is.x;
						p.y = is.y;
						// move the point so it doesn’t collide immediately again
						var hack = 1;
						if (!p.fixed) {
							p.x -= towards_a_side_x * hack;
							p.y -= towards_a_side_y * hack;
						}
						// apply the bounce angle to the particle
						var original_speed = Math.hypot(p.vx, p.vy);
						var speed = original_speed * 0.7;
						p.vx = -Math.sin(-p_bounce_angle) * speed;
						p.vy = -Math.cos(-p_bounce_angle) * speed;

						// some debug
						// ctx.strokeStyle = "aqua";
						// drawArrow(ctx, is.x, is.y, -normal, 50);
						// ctx.strokeStyle = "red";
						// drawArrow(ctx, is.x, is.y, p_bounce_angle, 50);
					}
				}
			}
		}
		/**
		var r = Math.random();
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
		// draw connections
		if (c.dist > 60) {
			const realDist = Math.hypot(c.p1.x - c.p2.x, c.p1.y - c.p2.y);
			const stretch = realDist / c.dist;
			ctx.strokeStyle = "yellow";
			ctx.setLineDash([5 * stretch, 5 * stretch]);
			ctx.beginPath();
			ctx.moveTo(c.p1.x, c.p1.y);
			ctx.lineTo(c.p2.x, c.p2.y);
			ctx.stroke();
			ctx.setLineDash([]);
		} else {
			ctx.strokeStyle = c.p1.color;
			ctx.beginPath();
			ctx.moveTo((c.p2.x - c.p1.x) * 0.2 + c.p1.x, (c.p2.y - c.p1.y) * 0.2 + c.p1.y);
			ctx.lineTo((c.p2.x - c.p1.x) * 0.4 + c.p1.x, (c.p2.y - c.p1.y) * 0.4 + c.p1.y);
			ctx.stroke();
			ctx.strokeStyle = c.p2.color;
			ctx.beginPath();
			ctx.moveTo((c.p2.x - c.p1.x) * 0.8 + c.p1.x, (c.p2.y - c.p1.y) * 0.8 + c.p1.y);
			ctx.lineTo((c.p2.x - c.p1.x) * 0.6 + c.p1.x, (c.p2.y - c.p1.y) * 0.6 + c.p1.y);
			ctx.stroke();
		}
		/**/
	}

	ctx.lineWidth = 1;
	ctx.fillStyle = "rgba(0,255,200,0.5)";
	for (var i = selection.points.length - 1; i >= 0; i--) {
		var p = selection.points[i];
		ctx.beginPath();
		ctx.arc(p.x, p.y, 5, 0, Math.PI * 2, false);
		ctx.fill();
	}

	ctx.lineWidth = 3;
	ctx.strokeStyle = "rgba(0,255,200,0.5)";
	for (var j = selection.connections.length - 1; j >= 0; j--) {
		var c = selection.connections[j];
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

	if (debugPolygons.length) {
		for (var i = debugPolygons.length - 1; i >= 0; i--) {
			const polygon = debugPolygons[i];
			ctx.fillStyle = polygon.color;
			ctx.beginPath();
			ctx.moveTo(polygon.points[0].x, polygon.points[0].y);
			for (var j = 1; j < polygon.points.length; j++) {
				ctx.lineTo(polygon.points[j].x, polygon.points[j].y);
			}
			ctx.closePath();
			ctx.fill();
		}
	}
	if (debugLines.length) {
		// flash everything else dark to make it clear
		// ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
		// ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

		for (var i = debugLines.length - 1; i >= 0; i--) {
			var line = debugLines[i];
			ctx.strokeStyle = line.color;
			ctx.beginPath();
			ctx.moveTo(line.p1.x, line.p1.y);
			ctx.lineTo(line.p2.x, line.p2.y);
			ctx.stroke();
		}
	}
	debugPolygons.length = 0;
	debugLines.length = 0;

	ctx.restore();
	mousePrevious.left = mouse.left;
	mousePrevious.right = mouse.right;
	mousePrevious.x = mouse.x;
	mousePrevious.y = mouse.y;
	mousePrevious.pointerId = mouse.pointerId; // pretty silly, not needed

	// Not possible to click buttons in the middle of step(), don’t worry. :)
	selectedTool = prevTool;

	if (play && collision && !groupsComputedThisFrame) {
		computeGroups();
		groupsComputedThisFrame = true;
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
// Might also want to try other line segment intersection algorithms, such as:
// https://gist.github.com/gordonwoodhull/50eb65d2f048789f9558
// https://stackoverflow.com/a/58657254/2624876
//
// This one is based on: http://jsfiddle.net/justin_c_rounds/Gd2S2/
// modified to return a result object only if the segments intersect
function intersectLineLine(line1StartX, line1StartY, line1EndX, line1EndY, line2StartX, line2StartY, line2EndX, line2EndY) {
	var denominator, a, b, numerator1, numerator2, result = {
		x: null,
		y: null,
		onLine1: false,
		onLine2: false,
	};
	denominator = ((line2EndY - line2StartY) * (line1EndX - line1StartX)) - ((line2EndX - line2StartX) * (line1EndY - line1StartY));
	if (denominator == 0) {
		// return result;
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
		// debugLines.push({
		// 	p1: { x: line1StartX, y: line1StartY },
		// 	p2: { x: line1EndX, y: line1EndY },
		// 	color: "yellow",
		// });
		// debugLines.push({
		// 	p1: { x: line2StartX, y: line2StartY },
		// 	p2: { x: line2EndX, y: line2EndY },
		// 	color: "aqua",
		// });
		return result;
	}
	// return result;
};
function pointInPolygon(x, y, polygon_points) {
	var inside = false;
	for (var i = 0, j = polygon_points.length - 1; i < polygon_points.length; j = i++) {
		var xi = polygon_points[i].x, yi = polygon_points[i].y;
		var xj = polygon_points[j].x, yj = polygon_points[j].y;

		var intersect = ((yi > y) != (yj > y))
			&& (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
		if (intersect) inside = !inside;
	}
	// debugPolygons.push({
	// 	points: polygon_points,
	// 	color: inside ? "rgba(0,255,0,0.6)" : "rgba(255,0,0,0.6)",
	// });
	return inside;
}
function intersectLineQuad(line_x1, line_y1, line_x2, line_y2, quad_x1, quad_y1, quad_x2, quad_y2, quad_x3, quad_y3, quad_x4, quad_y4) {
	var p1 = intersectLineLine(quad_x1, quad_y1, quad_x2, quad_y2, line_x1, line_y1, line_x2, line_y2);
	var p2 = intersectLineLine(quad_x2, quad_y2, quad_x3, quad_y3, line_x1, line_y1, line_x2, line_y2);
	var p3 = intersectLineLine(quad_x3, quad_y3, quad_x4, quad_y4, line_x1, line_y1, line_x2, line_y2);
	var p4 = intersectLineLine(quad_x4, quad_y4, quad_x1, quad_y1, line_x1, line_y1, line_x2, line_y2);
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
	if (pointInPolygon(line_x1, line_y1, [
		{ x: quad_x1, y: quad_y1 },
		{ x: quad_x2, y: quad_y2 },
		{ x: quad_x3, y: quad_y3 },
		{ x: quad_x4, y: quad_y4 },
	])) {
		// debugPolygons.push({
		// 	points: [
		// 		{ x: quad_x1, y: quad_y1 },
		// 		{ x: quad_x2, y: quad_y2 },
		// 		{ x: quad_x3, y: quad_y3 },
		// 		{ x: quad_x4, y: quad_y4 },
		// 	],
		// 	color: "#ff00ff",
		// });
		// uneducated guess ("hopefully it won’t matter")
		return { x: (line_x1 + line_x2) / 2, y: (line_y1 + line_y2) / 2 };
	}
	// if (pointInQuad(line_x1, line_y1, quad_x1, quad_y1, quad_x2, quad_y2, quad_x3, quad_y3, quad_x4, quad_y4)) {
}

// For removal of generated terrain,
// I could store the points and connections that relate to the terrain,
// but I’d have to include that information in the serialized world state,
// so I’m just using named colors to identify the terrain.
function removeTerrain() {
	deletePoints(points.filter((point) =>
		point.color == "green" ||
		point.color == "DarkOrchid"
	));
}
function createTerrain() {
	var x = Math.random() * 200;
	var y = Math.random() * 200 + 200;
	var y_tend = 0, x_tend = 10;
	var p, prev_p;
	for (var i = 0; i < 500 && x < innerWidth; i++) {
		x += Math.random() * 10 - 5 + x_tend;
		y += Math.random() * 10 - 5 + y_tend;
		y_tend += Math.random() * 20 - 10;
		x_tend += Math.random() * 35 - 15;
		y_tend *= 0.945;
		x_tend *= 0.9;
		if (y < 200) {
			y_tend += Math.random() * 20;
			x_tend += Math.random() * 20;
		}
		prev_p = p;
		p = make_point({
			x, y,
			fixed: true,
			color: "green"
		});
		points.push(p);
		if (prev_p) connections.push({ p1: p, p2: prev_p, dist: 60, force: 1 });

		if (Math.random() < 0.3) {
			const flower_p = make_point({
				x: x,
				y: y - 10,
				color: "DarkOrchid",
			});
			points.push(flower_p);
			connections.push({ p1: p, p2: flower_p, dist: Math.random() * 20 + 30, force: 1 });
		}
	}
}
/*
function make_rope_line(x1, y1, x2, y2, seg, force = 1) {
	var ropePoints = [];
	var ropeConnections = [];
	var pp, p;
	for (var i = 0; i < seg; i++) {
		var x = (x2 - x1) * (i / seg) + x1;
		var y = (y2 - y1) * (i / seg) + y1;
		pp = p;
		p = make_point({
			x, y,
			color: "#FC5"
		});
		ropePoints.push(p);
		if (pp) ropeConnections.push({ p1: p, p2: pp, dist: Math.hypot(p.x - pp.x, p.y - pp.y), force: force });
	}
	return { points: ropePoints, connections: ropeConnections };
}
*/
function positionElement(element, positionString) {
	const w = element.offsetWidth;
	const h = element.offsetHeight;
	const rect = element.getBoundingClientRect();
	let x = rect.left;
	let y = rect.top;
	if (positionString.match(/top|bottom|center/)) x = innerWidth / 2 - w / 2;
	if (positionString.match(/left|right|center/)) y = innerHeight / 2 - h / 2;
	if (positionString.match(/top/)) y = 10;
	if (positionString.match(/bottom/)) y = innerHeight - h - 10;
	if (positionString.match(/left/)) x = 10;
	if (positionString.match(/right/)) x = innerWidth - w - 10;
	x = Math.max(Math.min(x, innerWidth - w - 10), 10);
	y = Math.max(Math.min(y, innerHeight - h - 10), 10);
	element.style.left = x + "px";
	element.style.top = y + "px";
}

function createOptionsWindow() {
	$optionsWindow = new $Window({
		title: "Options",
		resizable: true,
		maximizeButton: false,
		minimizeButton: false,
		toolWindow: true,
	});
	// Note: Options are initialized from variables, not the HTML. To change the defaults, edit the variable declarations.
	// Note: Some controls are mentioned by name in dialog text.
	$optionsWindow.$content.html(`
		<h3>User Interface:</h3>
		<div class="field-row" style="padding-top: 3px; padding-bottom: 3px;">
			<label title="Change the look of the windows.">
				<span style="padding-right: 0.5em;">Theme:</span>
				<div class="select-wrapper"><select id="theme-select">
					<option value="sandbox-theme">Sandbox</option>
					<option value="retrofuturist-theme">Retrofuturist</option>
					<option value="windows-98-theme">Windows 98</option>
				</select></div>
			</label>
		</div>
		<div class="field-row">
			<button id="fullscreen-button" class="toggle" title="Make the application fill the entire screen. Useful especially for mobile, where screens are smaller and browser address bars can cause problems due to their scroll-to-hide feature.">
				<span>
					<svg class="not-for-win98" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488.4 488.4" style="height: 1.2em; vertical-align: middle; margin-right: 5px;">
						<path d="M441 408 339 306l-33 33 102 102h-80v47h160V328h-47zM339 183 441 81v79h47V0H328v47h80L306 150zM150 306 47 408v-80H0v160h160v-47H81l102-102zM160 47V0H0v160h47V81l103 102 33-33L81 47z" fill="currentColor"/>
					</svg>
					<img style="display: none; vertical-align: middle;" class="for-win98-only" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQBAMAAADt3eJSAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAGFBMVEUAAACAgIDAwMD///8AAAAAAIAAAP8A///iy0mHAAAAAXRSTlMAQObYZgAAAAFiS0dEAxEMTPIAAAAHdElNRQfiBhgXFBXXrxyyAAAAYUlEQVQI1zWNyxGAIAwFHzMWIEoDQgXK6JmDLUgHkgqE9k3CsJe82fwAY4UZWDwTHEyIzM7hfN5SNeRMRQMLNVcm6q1SWzdE7ZMQx7oetgm4FQjrlrTaw8tPTPLUiZGRhB96ZhWiMUISWwAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAxOC0wNi0yNFQyMzoyMDoyMS0wNDowMOdKx70AAAAldEVYdGRhdGU6bW9kaWZ5ADIwMTgtMDYtMjRUMjM6MjA6MjEtMDQ6MDCWF38BAAAAAElFTkSuQmCC">
					Fullscreen
				</span>
			</button>
		</div>
		<h3>Audio:</h3>
		<div class="field-row">
			<input type="checkbox" id="sfx-checkbox"/>
			<label for="sfx-checkbox" title="Enables or disables sound generation. Note that you need connections between points for sound to work.">
				Audio
			</label>
		</div>
		<div class="field-row" style="display: none">
			<input type="checkbox" id="sfx-viz-checkbox"/>
			<label for="sfx-viz-checkbox" title="Shows some internals of how the sound is generated. It looks kind of like a classic frequency analyzer, but it’s not.">
				Audio Visualization
			</label>
		</div>
		<div class="field-row">
			<label title="Changes the quality of generated sound.">
				<span style="padding-right: 0.5em;">Audio Style:</span>
				<div class="select-wrapper"><select id="sfx-style-select">
					<option value="0">Scorched Earth</option>
					<option value="1">Collisions</option>
					<option value="2">Hybrid</option>
				</select></div>
			</label>
		</div>
		<h3>Simulation:</h3>
		<div class="field-row">
			<label title="Hint: Try zero gravity!">
				<span style="padding-right: 0.5em;">Gravity:</span>
				<input type="number" id="gravity-input" step="0.05" min="-50" max="50" style="margin-bottom: 4px"/>
			</label>
		</div>
		<div class="field-row">
			<input type="checkbox" id="auto-connect-checkbox"/>
			<label for="auto-connect-checkbox" title="Connect any points that are near each other. The number of connections is limited per point.">
				Auto-Connect
			</label>
		</div>
		<div class="field-row">
			<input type="checkbox" id="terrain-checkbox"/>
			<label for="terrain-checkbox" title="Generate (or remove) some grassy terrain. Toggle off and on to regenerate.">
				Terrain
			</label>
		</div>
		<div class="field-row">
			<input type="checkbox" id="collision-checkbox"/>
			<label for="collision-checkbox" title="The collision system needs a lot of work.">
				Poor, Broken Collision
			</label>
		</div>
		<div class="field-row">
			<input type="checkbox" id="slowmo-checkbox"/>
			<label for="slowmo-checkbox" title="This may not be a physically accurate time scale. There are probably other things it should scale, but it only scales the application of velocity.">
				Slow Motion
			</label>
		</div>
		<div class="field-row">
			<input type="checkbox" id="play-checkbox" aria-keyshortcuts="P"/>
			<label for="play-checkbox" title="Pause and resume the simulation.">
				Play (P)
			</label>
		</div>
		<div class="field-row-stacked">
			<label for="ghost-trails-slider" title="Leave a visual trail behind all objects.">
				Ghost Trails:
			</label>
			<input type="range" id="ghost-trails-slider" min="0" max="1" step="0.01"/>
		</div>
		<!-- Fix scrollbar that appears even though there’s no width/height/max-width/max-height -->
		<div style="margin-bottom: 10px;">
	`);
	positionElement($optionsWindow[0], "top left");
	$optionsWindow[0].style.top = `${document.querySelector("#always-available-controls").getBoundingClientRect().bottom + 10}px`;

	const findEl = (selector) => $optionsWindow.$content.find(selector)[0];

	findEl("#fullscreen-button").onclick = () => {
		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			document.documentElement.requestFullscreen();
		}
	};
	document.addEventListener("fullscreenchange", (event) => {
		if (document.fullscreenElement) {
			findEl("#fullscreen-button").classList.add("selected");
		} else {
			findEl("#fullscreen-button").classList.remove("selected");
		}
	});

	var audioCheckbox = findEl("#sfx-checkbox");
	var audioVizCheckbox = findEl("#sfx-viz-checkbox");
	var audioStyleSelect = findEl("#sfx-style-select");

	var showAudioSetupError = function () {
		const $errorWindow = new $Window({
			title: "Audio Setup Failed",
			resizable: false,
			maximizeButton: false,
			minimizeButton: false,
		});
		$errorWindow.$content.html(`
			<p>Initialization failed, audio is not available.</p>
			<pre class="padded"/>
		`);
		const errorText = `${audioSetupError.stack}`.includes(audioSetupError.message) ? audioSetupError.stack : `${audioSetupError.message}\n\n${audioSetupError.stack}`;
		$errorWindow.$content[0].querySelector("pre").textContent = errorText;
		$errorWindow.$Button("OK", () => $errorWindow.close()).focus();
		$errorWindow.center();
		audioCheckbox.disabled = true;
		audioStyleSelect.disabled = true;
		audioCheckbox.checked = false;
	};
	// TODO: maybe enable/disable audio related sub-controls based on audio checkbox
	// ...except maybe just the audio style - not the viz
	audioCheckbox.checked = audioEnabled;
	audioCheckbox.onchange = function () {
		audioEnabled = audioCheckbox.checked;
		if (typeof audioSetupError !== "undefined") {
			showAudioSetupError();
			return;
		}
	};
	audioStyleSelect.value = audioStyle;
	audioStyleSelect.onchange = function () {
		audioStyle = parseInt(audioStyleSelect.value);
		if (typeof audioSetupError !== "undefined") {
			showAudioSetupError();
			return;
		}
		if (!audioCheckbox.checked) {
			const $w = new $Window({ title: "Audio Not Enabled", resizable: false, maximizeButton: false, minimizeButton: false });
			$w.$content.html(`
				<p>Check the box to enable ‘Audio’ first.</p>
			`);
			$w.$Button("OK", () => $w.close()).focus();
			$w.center();
			return;
		}
	};
	audioStyleSelect.value = audioStyle;
	audioVizCheckbox.checked = audioViz;
	audioVizCheckbox.onchange = function () {
		audioViz = audioVizCheckbox.checked;
		if (!audioCheckbox.checked && audioViz) {
			setTimeout(() => { // needed for button focus to work (I guess onchange comes before focus is switched to the checkbox?)
				const $w = new $Window({ title: "Audio Not Enabled", resizable: false, maximizeButton: false, minimizeButton: false });
				$w.$content.html(`
					<p>You <em>can</em> enjoy the viz without sound, but...</p>
					<p>Check the box to enable ‘Audio’ to hear it.</p>
				`);
				$w.$Button("OK", () => $w.close()).focus();
				$w.center();
			});
			return;
		}
	};
	findEl("#play-checkbox").checked = play;
	findEl("#play-checkbox").onchange = function () {
		play = this.checked;
	};
	findEl("#collision-checkbox").checked = collision;
	findEl("#collision-checkbox").onchange = function () {
		collision = this.checked;
	};
	findEl("#auto-connect-checkbox").checked = autoConnect;
	findEl("#auto-connect-checkbox").onchange = function () {
		autoConnect = this.checked;
	};
	findEl("#slowmo-checkbox").checked = slowmo;
	findEl("#slowmo-checkbox").onchange = function () {
		slowmo = this.checked;
	};
	findEl("#ghost-trails-slider").value = ghostTrails;
	findEl("#ghost-trails-slider").onchange = function () {
		ghostTrails = this.valueAsNumber;
	};
	findEl("#terrain-checkbox").checked = terrainEnabled;
	findEl("#terrain-checkbox").onchange = function () {
		terrainEnabled = this.checked;
		if (terrainEnabled) {
			createTerrain();
		} else {
			removeTerrain();
		}
	};
	findEl("#gravity-input").value = gravity;
	findEl("#gravity-input").onchange = function () {
		gravity = Number(this.value);
	};

	// window theme selection
	const themeSelect = findEl("#theme-select");
	let activeTheme;
	themeSelect.onchange = () => {
		windowTheme = themeSelect.value;
		newThemeStylesheet = document.getElementById(windowTheme);
		newThemeStylesheet.disabled = false;
		if (activeTheme) {
			activeTheme.disabled = true;
		}
		activeTheme = newThemeStylesheet;
	};
	themeSelect.value = windowTheme;
	themeSelect.onchange();
	return $optionsWindow;
}
function createToolsWindow() {
	$toolsWindow = new $Window({
		title: "Tools",
		resizable: true,
		maximizeButton: false,
		minimizeButton: false,
		toolWindow: true,
	});
	for (const tool of tools) {
		const toolButton = document.createElement("button");
		toolButton.classList.add("toggle");
		toolButton.title = tool.tooltip;
		const span = document.createElement("span"); // for sandbox theme CSS
		span.textContent = `${tool.name} (${tool.shortcut})`;
		toolButton.appendChild(span);
		toolButton.setAttribute("aria-keyshortcuts", tool.shortcut);
		$toolsWindow.$content.append(toolButton);
		$toolsWindow.$content.append(document.createElement("br"));
		toolButton.onclick = () => {
			selectTool(tool.id);
		};
		tool.button = toolButton;
	}

	$toolsWindow.addClass("tools-window");
	$toolsWindow[0].style.top = `${$optionsWindow[0].getBoundingClientRect().bottom + 10}px`;
	$toolsWindow[0].style.left = "10px";
	$toolsWindow.bringTitleBarInBounds();

	selectTool = function (id) {
		selectedTool = id;
		for (const tool of tools) {
			if (tool.id === id) {
				tool.button.classList.add("selected");
			} else {
				tool.button.classList.remove("selected");
			}
		}
	};
	selectTool(selectedTool);
	return $toolsWindow;
}

function createTodoWindow() {
	$todoWindow = new $Window({ title: "Todo", resizable: true, maximizeButton: false, minimizeButton: false });
	$todoWindow.addClass("todo-window");
	$todoWindow.$content.html(`
		<ul>
			<li>
				Add a Midpoint tool, and/or other ways to get different lengths of lines.
			</li>
			<li>
				Generalize "Slow Motion" to a time scale slider.
			</li>
			<li>
				Ideally (but this would be hard), fix collision.
				<br>(Things no clip and get stuck in each other.
				<br>It just doesn’t really work.)
			</li>
			<!--
			<li>
				Fix NaNs introduced when smashing points with the collidable windows into the edge of the screen.
			</li>
			<li>
				Fix behavior when Shift+dragging a group of many points like the terrain (it seems to just stop dragging after a little distance).
			</li>
			<li>
				Precise connector workflow for connecting points as you drag them? (quick pause while holding slash? could show pause icon but slanted then haha)
			</li>
			<li>
				Draw tool graphics with updated point positions at end of frame?
			</li>
			<li>
				Allow toggling group drag (Shift) after starting drag?
			</li>
			<li>
				Import/export selections.
				I don’t want to implement importing/exporting an entire scene,
				because it wouldn’t work well with the toy nature of windows being collidable and the viewport border being collidable,
				but I could do selection import/export.
				(and you’ll just have to deal with whether the imported object fits,
				and whether it’s supposed to work in zero gravity or whatever.)
				But if I do this, I have to change the serialization format just because it’s stupid,
				with the formatVersion being unclear due to how ARSON works (see comment in serialize)
			</li>
			<li>
				A way to mirror a selection, or more general symmetry support?
			</li>
			-->
		</ul>
	`);
	positionElement($todoWindow[0], "top right");
	return $todoWindow;
}
function createHelpWindow() {
	$helpWindow = new $Window({ title: "Help", resizable: true, maximizeButton: false, minimizeButton: false });
	$helpWindow.addClass("help-window");
	$helpWindow.$content.html(`
		<p>Select a tool in the Tools box, then click to use it. You can also right-click to drag points.</p>
		<p>To connect points, use the Glue tool or Precise Connector. Hold <kbd>/</kbd> to temporarily use to the Precise Connector, or Space to immediately Glue.</p>
		<p>To make more solid shapes, use the Precise Connector and hold <kbd>Shift</kbd> to create arbitrary-length lines, and add extra lines.</p>
		<p>Hold Shift when making points to fix them in place.</p>
		<p>Press <kbd>P</kbd> to pause/unpause the simulation.</p>
		<p>Toggle "Terrain" off and on to regenerate it.</p>
		<p>Press <kbd>Ctrl+Z</kbd> to undo to a previous state and <kbd>Ctrl+Y</kbd> or <kbd>Ctrl+Shift+Z</kbd> to redo.</p>
		<p>Use the Select tool to select points in a rectangle, or <kbd>Ctrl+A</kbd> to select all points, and <kbd>Ctrl+D</kbd> to deselect all.</p>
		<p>Press <kbd>Ctrl+C</kbd> to copy the selection (or <kbd>Ctrl+X</kbd> to cut), and <kbd>Ctrl+V</kbd> to paste near the mouse.</p>
		<p>Press <kbd>Delete</kbd> to remove the selected points.</p>
		<p>There is no save/load, and it doesn’t copy to the system clipboard, only an internal clipboard.</p>
	`);
	positionElement($helpWindow[0], "top");
	return $helpWindow;
}
function createAboutWindow() {
	$aboutWindow = new $Window({ title: "About", resizable: true, maximizeButton: false, minimizeButton: false });
	$aboutWindow.$content.html(`
		<div style="padding:0 2em;">
			<h1>PBJ Sandbox</h1>
			<p>Made by <a href="https://isaiahodhner.io">Isaiah Odhner</a>.</p>
			<p>Open source on <a href="https://github.com/1j01/pbj-sandbox">GitHub</a>, licensed WTFPL or CC0.</p>
		</div>
	`);
	positionElement($aboutWindow[0], "top");
	return $aboutWindow;
}

const windowToggles = {
	options: { button: document.querySelector("#options-button"), createWindow: createOptionsWindow },
	tools: { button: document.querySelector("#tools-button"), createWindow: createToolsWindow },
	todo: { button: document.querySelector("#todo-button"), createWindow: createTodoWindow },
	about: { button: document.querySelector("#about-button"), createWindow: createAboutWindow },
	help: { button: document.querySelector("#help-button"), createWindow: createHelpWindow },
}
for (const [key, obj] of Object.entries(windowToggles)) {
	const { button, createWindow } = obj;
	obj.createWindow = () => { throw new Error("Did you mean openWindow?"); };
	obj.openWindow = () => {
		obj.$window = createWindow();
		obj.$window.on("close", () => {
			obj.$window = null;
			button.classList.remove("selected");
		});
		button.classList.add("selected");
	};
	obj.toggleWindow = () => {
		if (obj.$window && !obj.$window.closed) {
			obj.$window.close();
			button.classList.remove("selected");
		} else {
			obj.openWindow();
		}
	};
	button.onclick = obj.toggleWindow;
}

main();
windowToggles.options.openWindow();
windowToggles.tools.openWindow();

if (terrainEnabled) {
	createTerrain();
}

function connect_if_not_connected(p1, p2, connections, options = {}) {
	if (p1 === p2) {
		console.warn("Tried to connect a point to itself");
		return;
	}
	if (areDirectlyConnected(p1, p2, connections)) {
		return;
	}
	connections.push(Object.assign({ p1: p1, p2: p2, dist: 60, force: 1 }, options));
}

function make_point(options) {
	return Object.assign({
		// position
		x: 0,
		y: 0,
		// previous position
		px: options.x ?? 0,
		py: options.y ?? 0,
		// velocity
		vx: 0,
		vy: 0,
		// force
		fx: 0,
		fy: 0,
		// whether point is static/unmoving/fixated/"glued to the background"
		fixed: false,
		// visual
		color: options.fixed ? "gray" : `hsl(${Math.random() * 360},${Math.random() * 50 + 50}%,${Math.random() * 50 + 50}%)`,
	}, options);
}

function add_point_at_mouse_undoable() {
	undoable();
	add_point_at_mouse();
}
function add_point_at_mouse() {
	points.push(make_point({
		x: mouse.x,
		y: mouse.y,
		fixed: keys.Shift,
	}));
}

// Note: radius is not directly proportional to size or numPoints.
function make_ball({ x, y, vx = 0, vy = 0, numPoints = 8, size = 60, variableDistances = false, ...pointOptions }) {
	const ballPoints = [];
	const ballConnections = [];
	for (let i = 0; i < numPoints; i++) {
		ballPoints.push(make_point({
			// position could be random but the sin/cos is to help relax it initially.
			x: x + Math.sin(i / numPoints * Math.PI * 2) * size,
			y: y + Math.cos(i / numPoints * Math.PI * 2) * size,
			// previous position gives a nice initial springy feel
			px: x,
			py: y,
			// velocity
			vx,
			vy,
			// remaining options are passed to make_point
			...pointOptions
		}));
	}
	for (let i = 0; i < numPoints; i++) {
		const p1 = ballPoints[i];
		for (let j = 0; j < numPoints; j++) {
			const p2 = ballPoints[j];
			if (i === j) {
				continue; // don’t connect to self
			}
			// Note: it produces some dope shapes with force: 2 
			const dist = variableDistances ? Math.hypot(p1.x - p2.x, p1.y - p2.y) : size;
			connect_if_not_connected(p1, p2, ballConnections, { dist, force: 1 });
		}
	}
	return {
		points: ballPoints,
		connections: ballConnections,
	};
}
function add_ball(options) {
	const ball = make_ball(options);
	points.push(...ball.points);
	connections.push(...ball.connections);
	return ball;
}

function make_doll({ x, y, color, width, height } = {}) {
	color = color ?? `hsl(${~~(Math.random() * 360)},${~~(Math.random() * 50 + 50)}%,${~~(Math.random() * 50 + 50)}%)`;
	height = height ?? (Math.random() * 20 + 20);
	width = width ?? (height * (Math.random() * 2 + 1) / 2);
	const limbLength = height * 1;

	const dollPoints = [];
	const dollConnections = [];
	// Head
	const head = make_ball({
		x: x,
		y: y,
		color,
		numPoints: 4,
		size: 10,
		part: "head",
	});
	dollPoints.push(...head.points);
	dollConnections.push(...head.connections);
	// Torso
	const chest = make_point({ x: x, y: y + 20, color, part: "chest" });
	const bottom = make_point({ x: x, y: y + 60, color, part: "bottom" });
	connect_if_not_connected(chest, bottom, dollConnections, { dist: height + width, force: 2 });
	dollPoints.push(chest, bottom);
	connect_if_not_connected(chest, head.points[0], dollConnections, { dist: 0, force: 2 }); // neck
	// Limbs
	const shoulders = [];
	const hips = [];
	for (let side = -1; side <= 1; side += 2) {
		// Arm(s)
		const shoulder = make_point({ x: x + side * (width / 2 + 0), y: y + 10, color, part: "shoulder", side });
		const elbow = make_point({ x: x + side * (width / 2 + 5), y: y + 30, color, part: "elbow", side });
		const hand = make_point({ x: x + side * (width / 2 + 10), y: y + 50, color, part: "hand", side });
		connect_if_not_connected(shoulder, elbow, dollConnections, { dist: limbLength, force: 1 }); // upper arm
		connect_if_not_connected(elbow, hand, dollConnections, { dist: limbLength, force: 1 }); // lower arm
		connect_if_not_connected(shoulder, chest, dollConnections, { dist: width / 2, force: 2 }); // shoulder
		// Leg(s)
		const hip = make_point({ x: x + side * (width / 2 + 0), y: y + 70, color, part: "hip", side });
		const knee = make_point({ x: x + side * (width / 2 + 5), y: y + 90, color, part: "knee", side });
		const foot = make_point({ x: x + side * (width / 2 + 10), y: y + 110, color, part: "foot", side });
		connect_if_not_connected(hip, knee, dollConnections, { dist: limbLength, force: 1 }); // upper leg
		connect_if_not_connected(knee, foot, dollConnections, { dist: limbLength, force: 1 }); // lower leg
		connect_if_not_connected(hip, bottom, dollConnections, { dist: width / 2, force: 2 }); // hip

		dollPoints.push(shoulder, elbow, hand, hip, knee, foot);
		shoulders.push(shoulder);
		hips.push(hip);
	}
	// Left shoulder to right hip
	connect_if_not_connected(shoulders[0], hips[1], dollConnections, { dist: height + width, force: 2 });
	// Right shoulder to left hip
	connect_if_not_connected(shoulders[1], hips[0], dollConnections, { dist: height + width, force: 2 });
	// Left shoulder to left hip
	// connect_if_not_connected(shoulders[0], hips[0], dollConnections, { dist: height + width, force: 2 });
	// Right shoulder to right hip
	// connect_if_not_connected(shoulders[1], hips[1], dollConnections, { dist: height + width, force: 2 });
	// Shoulder to shoulder
	connect_if_not_connected(shoulders[0], shoulders[1], dollConnections, { dist: width, force: 2 });
	// Hip to hip
	connect_if_not_connected(hips[0], hips[1], dollConnections, { dist: width, force: 2 });

	return {
		points: dollPoints,
		connections: dollConnections,
	};
}
function add_doll(options) {
	const doll = make_doll(options);
	points.push(...doll.points);
	connections.push(...doll.connections);
	return doll;
}

// Test scene: a bunch of balls of different types.
// for (let numPoints = 3, x = 500; numPoints < 15; numPoints+=3, x += 200) {
// 	for (let size = 30, y = 100; size < 100; size += 30, y += 200, x += 0) {
// 		add_ball({ numPoints, size, x, y, variableDistances: x > 900 });
// 	}
// }

// Test scene: Throw two balls at each other
// add_ball({ x: innerWidth / 3, y: innerHeight / 2, vx: 5, vy: -3 });
// add_ball({ x: innerWidth * 2/3, y: innerHeight / 2, vx: -5, vy: -3 });

// Test scene: collision false negatives
// add_ball({ x: innerWidth / 2, y: innerHeight / 2 - 150, numPoints: 3, size: 60 });
// for (let y = innerHeight / 2; y < innerHeight; y += 30) {
// 	points.push(make_point({ x: innerWidth / 2 + Math.sin(y) * 50, y, fixed: true }));
// }

// Test scene: line rotation on collision
/*
const line_width = 50;
for (let along_line = 0, base_x = 400; along_line <= 1 && base_x + line_width + 10 < innerWidth; along_line += 0.15, base_x += line_width * 2) {
	for (let base_y = innerHeight / 3; base_y < innerHeight; base_y += innerHeight / 3) {

		// make a line to throw a point at (OR TO THROW AT A POINT)
		const p1 = {
			x: base_x,
			y: base_y,
			vx: 0,
			vy: 20 * (base_y < innerHeight / 2 ? -1 : 1),
			fx: 0,
			fy: 0,
			color: "lime",
		};
		const p2 = {
			x: base_x + line_width,
			y: base_y,
			vx: 0,
			vy: 20 * (base_y < innerHeight / 2 ? -1 : 1),
			fx: 0,
			fy: 0,
			color: "lime",
		};
		points.push(p1, p2);
		connect_if_not_connected(p1, p2, connections, { dist: line_width });

		// make a point to throw at the line (OR LET BE HIT BY A LINE)
		// I’m not testing the edge case of whether it collides when x positions are the same, I want it to definitely collide
		const projectile_x = base_x + 0.005 + along_line * (line_width - 0.01);
		if (base_y < innerHeight / 2) {
			points.push({
				x: projectile_x,
				y: innerHeight * 3/4,
				vx: 0,
				vy: 0,
				fx: 0,
				fy: 0,
				color: "white",
			});
		} else {
			points.push({
				x: projectile_x,
				y: innerHeight / 4,
				vx: 0,
				vy: 0,
				fx: 0,
				fy: 0,
				color: "white",
			});
		}
	}
}
*/
