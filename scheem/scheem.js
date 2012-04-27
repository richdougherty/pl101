var PEG = require('pegjs');
var deepEqual = require('deep-equal');
var assert = require('assert');
var fs = require('fs'); // for loading files

// Read file contents
var data = fs.readFileSync('scheem.peg', 'utf-8');
// Create my parser
var parse = PEG.buildParser(data).parse;
// Do a test

function testParse(inputText, expectedAst) {
	var ast = parse(inputText);
	if (!deepEqual(ast, expectedAst)) {
		console.log("ASTs do not match: ", ast, expectedAst);
		assert.fail(ast, expectedAst);
	}
}

testParse("(a b c)", ["a", "b", "c"]);
testParse("(+ 1 (* x 3))", ["+", "1", ["*", "x", "3"]]);
testParse("(* n (factorial (- n 1)))", ["*", "n", ["factorial", ["-", "n", "1"]]]);