gravity = 0
document.getElementById("gravity-input").value = gravity;

blueprint = [0, 1, 2, 3, 4, 5, 6, 7, 8]

var sym_point_arrays = [];
var ship_points = [];
var ship_connections = [];
var y = 0;
// var ship_color_primary = / _hue = ...
for (var i = 0; i < blueprint.length; i++) {
	var x = Math.random() < 0.2 ? 0 : (Math.random() * 100 + 10);
	var sym_n = x == 0 ? 1 : 2;
	var sym_a = [];
	for (var sym_i = 0; sym_i < sym_n; sym_i++) {
		var p = {
			x: x,//position
			y: y,
			px: x,//previous position
			py: y,
			vx: 0,//velocity
			vy: 0,
			fx: 0,//force
			fy: 0,
			color: "yellow",
		};
		ship_points.push(p);
		sym_a.push(p);
		x = -x;
	}
	sym_point_arrays.push(sym_a);
	y += 30;
}
for (var i = 1; i < sym_point_arrays.length; i++) {
	var a1 = sym_point_arrays[i];
	var a2 = sym_point_arrays[i - 1];
	if (a1.length === 1) a1 = [a1[0], a1[0]];
	if (a2.length === 1) a2 = [a2[0], a2[0]];
	console.assert(a1.length === a2.length);
	for (var sym_i = 0; sym_i < a1.length; sym_i++) {
		var p1 = a1[sym_i];
		var p2 = a2[sym_i];
		connect_if_not_connected(p1, p2, ship_connections);
	}
}
for (var i = 0; i < sym_point_arrays.length; i++) {
	var a1 = sym_point_arrays[i];
	var a2 = sym_point_arrays[~~(Math.random() * sym_point_arrays.length)];
	if (a1.length === 1) a1 = [a1[0], a1[0]];
	if (a2.length === 1) a2 = [a2[0], a2[0]];
	console.assert(a1.length === a2.length);
	for (var sym_i = 0; sym_i < a1.length; sym_i++) {
		var p1 = a1[sym_i];
		var p2 = a2[sym_i];
		connect_if_not_connected(p1, p2, ship_connections);
	}
}

// serializedClipboard = serialize(ship_points, ship_connections, true);
var serializedShip = serialize(ship_points, ship_connections, true);
undoable();
var ship = deserialize(serializedShip);
var place_x = Math.random() * (innerWidth - 100) + 50;
var place_y = Math.random() * (innerHeight - 100) + 50;
ship.points.forEach((point) => { point.x += place_x; point.y += place_y; point.px = point.x; point.py = point.y; });
points = points.concat(ship.points);
connections = connections.concat(ship.connections);
