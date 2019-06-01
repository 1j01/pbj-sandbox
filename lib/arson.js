/*
The MIT License (MIT)

Copyright (c) 2016 Ben Newman

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
// (manually packaged up for <script> tag usage by isaiah odhner)

(function(ARSON) {

var UNDEFINED_INDEX = -1;
var ARRAY_HOLE_INDEX = -2;
var NAN_INDEX = -3;
var POS_INF_INDEX = -4;
var NEG_INF_INDEX = -5;
var customTypes = Object.create(null);

ARSON.registerType = function (typeName, handlers) {
  function check(methodName) {
    if (typeof handlers[methodName] !== "function") {
      throw new Error(
        "second argument to ARSON.registerType(" +
          JSON.stringify(typeName) + ", ...) " +
          "must be an object with a " + methodName + " method"
      );
    }
  }

  check("deconstruct");
  check("reconstruct");

  customTypes[typeName] = handlers;

  return ARSON;
};

// --- BEGIN custom.js ---
var toString = Object.prototype.toString;
var dateTag = "[object Date]";
var regExpTag = "[object RegExp]";
var setTag = "[object Set]";
var mapTag = "[object Map]";

typeof Buffer === "function" &&
typeof Buffer.isBuffer === "function" &&
ARSON.registerType("Buffer", {
  deconstruct: function (buf) {
    return Buffer.isBuffer(buf) && [buf.toString("base64"), "base64"];
  },

  // The reconstruct function will be called twice: once with no
  // arguments, which allows it to return a placeholder object reference;
  // and once with one argument, a copy of the array returned by the
  // deconstruct function. For immutable types like Buffer, Date, and
  // RegExp, the reconstruct function should return a falsy value when it
  // receives no arguments, since there is no way to create an empty
  // Buffer or Date and later fill in its contents.  For container types
  // like Map and Set, the reconstruct function must return an empty
  // instance of the container when it receives no arguments, so that we
  // can fill in that empty container later. This two-phased strategy is
  // essential for decoding containers that contain themselves.
  reconstruct: function (args) {
    return args && new Buffer(args[0], args[1]);
  }
});

ARSON.registerType("Date", {
  deconstruct: function (date) {
    return toString.call(date) === dateTag && [date.toJSON()];
  },

  reconstruct: function (args) {
    return args && new Date(args[0]);
  }
});

ARSON.registerType("RegExp", {
  deconstruct: function (exp) {
    if (toString.call(exp) === regExpTag) {
      var args = [exp.source];
      var flags = "";

      if (exp.ignoreCase) flags += "i";
      if (exp.multiline) flags += "m";
      if (exp.global) flags += "g";

      if (flags) {
        args.push(flags);
      }

      return args;
    }
  },

  reconstruct: function (args) {
    return args && new RegExp(args[0], args[1]);
  }
});

typeof Set === "function" &&
typeof Array.from === "function" &&
ARSON.registerType("Set", {
  deconstruct: function (set) {
    if (toString.call(set) === setTag) {
      return Array.from(set);
    }
  },

  reconstruct: function (values) {
    if (values) {
      values.forEach(this.add, this);
    } else {
      return new Set;
    }
  }
});

typeof Map === "function" &&
typeof Array.from === "function" &&
ARSON.registerType("Map", {
  deconstruct: function (map) {
    if (toString.call(map) === mapTag) {
      return Array.from(map);
    }
  },

  reconstruct: function (entries) {
    if (entries) {
      entries.forEach(function (entry) {
        this.set(entry[0], entry[1]);
      }, this);
    } else {
      return new Map;
    }
  }
});
// --- END custom.js ---

ARSON.encode = ARSON.stringify =
function encode(value) {
  return JSON.stringify(toTable(value));
}

// This array will grow as needed so that we can slice arrays filled with
// ARRAY_HOLE_INDEX from it.
var HOLY_ARRAY = [];

// Returns an array of the given length filled with ARRAY_HOLE_INDEX.
function getArrayOfHoles(length) {
  var holyLen = HOLY_ARRAY.length;
  if (length > holyLen) {
    HOLY_ARRAY.length = length;
    for (var i = holyLen; i < length; ++i) {
      HOLY_ARRAY[i] = ARRAY_HOLE_INDEX;
    }
  }

  return HOLY_ARRAY.slice(0, length);
}

function toTable(value) {
  var values = [];
  var getIndex = makeGetIndexFunction(values);

  function copy(value) {
    var result = value;

    if (value && typeof value === "object") {
      var keys = Object.keys(value);

      if (isPlainObject(value)) {
        result = {};

      } else if (Array.isArray(value)) {
        result = getArrayOfHoles(value.length);

      } else {
        for (var typeName in customTypes) {
          // If value is not a plain Object, but something exotic like a
          // Date or a RegExp, serialize it as an array with typeName as
          // its first element. These arrays can be distinguished from
          // normal arrays, because all other non-empty arrays will be
          // serialized with a numeric value as their first element.
          var args = customTypes[typeName].deconstruct(value);
          if (args) {
            for (var i = 0; i < args.length; ++i) {
              args[i] = getIndex(args[i]);
            }
            args.unshift(typeName);
            return args;
          }
        }

        result = {};
      }

      keys.forEach(function (key) {
        result[key] = getIndex(value[key]);
      });
    }

    return result;
  }

  // Assigns the root value to values[0].
  var index0 = getIndex(value);
  if (index0 < 0) {
    // If value is something special that gets a negative index, then we
    // don't need to build a table at all, and we can simply return that
    // negative index as a complete serialization. This avoids ambiguity
    // about indexes versus primitive literal values.
    return index0;
  }

  // Note that this for loop cannot be a forEach loop, because
  // values.length is expected to change during iteration.
  for (var table = [], v = 0; v < values.length; ++v) {
    table[v] = copy(values[v]);
  }

  return table;
}

function isPlainObject(value) {
  var isObject = value && typeof value === "object";
  if (isObject) {
    var proto = Object.getPrototypeOf
      ? Object.getPrototypeOf(value)
      : value.__proto__;
    return proto === Object.prototype;
  }
  return false;
}

function makeGetIndexFunction(values) {
  var indexMap = typeof Map === "function" && new Map;

  return function getIndex(value) {
    switch (typeof value) {
    case "undefined":
      return UNDEFINED_INDEX;

    case "number":
      if (isNaN(value)) {
        return NAN_INDEX;
      }

      if (! isFinite(value)) {
        return value < 0 ? NEG_INF_INDEX : POS_INF_INDEX;
      }

      // fall through...
    }

    var index;

    if (indexMap) {
      // If we have Map, use it instead of values.indexOf to accelerate
      // object lookups.
      index = indexMap.get(value);
      if (typeof index === "undefined") {
        index = values.push(value) - 1;
        indexMap.set(value, index);
      }
    } else {
      index = values.indexOf(value);
      if (index < 0) {
        index = values.push(value) - 1;
      }
    }

    return index;
  };
}

ARSON.decode = ARSON.parse =
function decode(encoding) {
  return fromTable(JSON.parse(encoding));
}

function fromTable(table) {
  if (typeof table === "number" && table < 0) {
    return getValueWithoutCache(table);
  }

  var getValueCache = new Array(table.length);

  function getValue(index) {
    return index in getValueCache
      ? getValueCache[index]
      : getValueCache[index] = getValueWithoutCache(index);
  }

  function getValueWithoutCache(index) {
    if (index < 0) {
      if (index === UNDEFINED_INDEX) {
        return;
      }

      if (index === ARRAY_HOLE_INDEX) {
        // Never reached because handled specially below.
        return;
      }

      if (index === NAN_INDEX) {
        return NaN;
      }

      if (index === POS_INF_INDEX) {
        return Infinity;
      }

      if (index === NEG_INF_INDEX) {
        return -Infinity;
      }

      throw new Error("invalid ARSON index: " + index);
    }

    var entry = table[index];

    if (entry && typeof entry === "object") {
      if (Array.isArray(entry)) {
        var elem0 = entry[0];
        if (typeof elem0 === "string" && elem0 in customTypes) {
          var rec = customTypes[elem0].reconstruct;
          var empty = rec();
          if (empty) {
            // If the reconstruct handler returns an object, treat it as
            // an empty instance of the desired type, and schedule it to
            // be filled in later. This two-stage process allows exotic
            // container objects to contain themselves.
            containers.push({
              reconstruct: rec,
              empty: empty,
              argIndexes: entry.slice(1)
            });
          }

          // If the reconstruct handler returned a falsy value, then we
          // assume none of its arguments refer to exotic containers, so
          // we can reconstruct the object immediately. Examples: Buffer,
          // Date, RegExp.
          return table[index] = empty || rec(entry.slice(1).map(getValue));
        }
      }

      // Here entry is already the correct array or object reference for
      // this index, but its values are still indexes that will need to be
      // resolved later.
      objects.push(entry);
    }

    return entry;
  }

  var containers = [];
  var objects = [];

  // First pass: make sure all exotic objects are deserialized fist, and
  // keep track of all plain object entries for later.
  table.forEach(function (entry, i) {
    getValue(i);
  });

  // Second pass: now that we have final object references for all exotic
  // objects, we can safely resolve argument indexes for the empty ones.
  containers.forEach(function (c) {
    c.args = c.argIndexes.map(getValue);
  });

  // Third pass: resolve value indexes for ordinary arrays and objects.
  objects.forEach(function (obj) {
    Object.keys(obj).forEach(function (key) {
      var index = obj[key];

      if (typeof index !== "number") {
        // Leave non-numeric indexes untouched.
        return;
      }

      if (index < 0) {
        if (index === ARRAY_HOLE_INDEX) {
          // Array holes have to be handled specially here, since getValue
          // does not have a reference to obj.
          delete obj[key];
          return;
        }

        // This recursion is guaranteed not to add more objects, because
        // we know the index is negative.
        obj[key] = getValue(index);

      } else {
        // Non-negative indexes refer to normal table values.
        obj[key] = table[index];
      }
    });
  });

  // Fourth pass: all possible object references have been established, so
  // we can finally initialize the empty container objects.
  containers.forEach(function (c) {
    c.reconstruct.call(c.empty, c.args);
  });

  return table[0];
}

})(window.ARSON = {});
