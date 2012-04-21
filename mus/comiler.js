var insertNote = function(notes, note) {
	for (var i = 0; i < notes.length; i++) {
		if (notes[i].start > note.start) break;
	}
	var before = notes.slice(0, i);
	var after = notes.slice(i);
	return before.concat(note, after);
};

/*
assert_eq(
	insertNote([], melody_note[3]),
	[melody_note[3]],
	'insertNote test 1'
);

assert_eq(
	insertNote([melody_note[2]], melody_note[0]),
	[melody_note[0], melody_note[2]],
	'insertNote test 2'
);

assert_eq(
	insertNote([melody_note[0], melody_note[2]], melody_note[1]),
	[melody_note[0], melody_note[1], melody_note[2]],
	'insertNote test 3'
);
*/

var mergeNotes = function(notes1, notes2) {
	if (notes2.length === 0) {
		return notes1;
	} else {
		return mergeNotes(
			insertNote(notes1, notes2[0]),
			notes2.slice(1)
		);
	}
};

/*
assert_eq(
	mergeNotes([], []),
	[],
	'mergeNotes test 1'
);

assert_eq(
	mergeNotes([melody_note[0], melody_note[2]], [melody_note[1], melody_note[3]]),
	[melody_note[0], melody_note[1], melody_note[2], melody_note[3]],
	'mergeNotes test 2'
);
*/

var logFuncCallCount = 0;
var logFunc = function(name, f) {
	return function() {
		var id = 'call-'+(logFuncCallCount++)+': '+name;
		console.log(id, arguments);
		var result = f.apply(this, arguments);
		console.log(id, arguments, ' -> ', result);
		return result;
	};
};

var compileHelper = function(time, musexpr) {
	var leftAccum, rightAccum; // Prevent JSHint hoisting errors
	if (musexpr.tag == 'note') {
		return {
			notes: [{
				tag: 'note',
				pitch: musexpr.pitch,
				start: time,
				dur: musexpr.dur
			}],
			time: time + musexpr.dur
		};
	} else if (musexpr.tag == 'rest') {
		return {
			notes: [],
			time: time + musexpr.duration
		};
	} else if (musexpr.tag == 'seq') {
		leftAccum = compileHelper(time, musexpr.left);
		rightAccum = compileHelper(leftAccum.time, musexpr.right);
		return {
			notes: mergeNotes(leftAccum.notes, rightAccum.notes),
			time: rightAccum.time
		};
	} else if (musexpr.tag == 'par') {
		leftAccum = compileHelper(time, musexpr.left);
		rightAccum = compileHelper(time, musexpr.right);
		return {
			notes: mergeNotes(leftAccum.notes, rightAccum.notes),
			time: Math.max(leftAccum.time, rightAccum.time)
		};
	} else {
		throw 'Unknown expr tag: '+expr.tag;
	}
};

var compile = function (musexpr) {
	return compileHelper(0, musexpr).notes;
};

var melody_mus = 
	{ tag: 'seq',
	  left: 
	   { tag: 'seq',
		 left: { tag: 'note', pitch: 'a4', dur: 250 },
		 right: { tag: 'seq',
			left: { tag: 'rest', duration: 100 },
			right: { tag: 'note', pitch: 'b4', dur: 250 } } },
	  right:
	   { tag: 'seq',
		 left: { tag: 'note', pitch: 'c4', dur: 500 },
		 right: { tag: 'note', pitch: 'd4', dur: 500 } } };

console.log(melody_mus);
console.log(compile(melody_mus));