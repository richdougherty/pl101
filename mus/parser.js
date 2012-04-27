var PEG = require('pegjs');
var deepEqual = require('deep-equal');
var assert = require('assert');
var fs = require('fs'); // for loading files

var data = fs.readFileSync('mus.peg', 'utf-8');
var parse = PEG.buildParser(data).parse;

function testParse(inputText, expectedAst) {
	var ast = parse(inputText);
	if (!deepEqual(ast, expectedAst)) {
		console.log("ASTs do not match: ", ast, expectedAst);
		assert.fail(ast, expectedAst);
	}
}

testParse("c4:500", { tag: 'note', pitch: 'c4', dur: 500 });
testParse(
	"c4:500 e4:500",
	{ tag: 'seq',
	  left: { tag: 'note', pitch: 'c4', dur: 500 },
	  right: { tag: 'note', pitch: 'e4', dur: 500 } });
testParse(
	"c4:250 e4:250 g4:500",
	{ tag: 'seq',
	  left: { tag: 'note', pitch: 'c4', dur: 250 },
	  right:
	   { tag: 'seq',
		 left: { tag: 'note', pitch: 'e4', dur: 250 },
		 right: { tag: 'note', pitch: 'g4', dur: 500 } } });
testParse(
	"(a4:250 b4:250) (c4:500 d4:500)",
	{ tag: 'seq',
	  left: 
	   { tag: 'seq',
		 left: { tag: 'note', pitch: 'a4', dur: 250 },
		 right: { tag: 'note', pitch: 'b4', dur: 250 } },
	  right:
	   { tag: 'seq',
		 left: { tag: 'note', pitch: 'c4', dur: 500 },
		 right: { tag: 'note', pitch: 'd4', dur: 500 } } });

testParse(
	"c4:250 | e4:250 | g4:250",
	{ tag: 'par',
	  left: { tag: 'note', pitch: 'c4', dur: 250 },
	  right:
	   { tag: 'par',
		 left: { tag: 'note', pitch: 'e4', dur: 250 },
		 right: { tag: 'note', pitch: 'g4', dur: 250 } } });
 testParse(
	"_:100",
	{ tag: 'rest', duration: 100 });