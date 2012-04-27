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
// "Allow any number of spaces between atoms..."
testParse("(a b  c   d)", ["a", "b", "c", "d"]);
// "...allow spaces around parentheses."
testParse(" ( a b  (c d )   ) ", ["a", "b", ["c", "d"]]);
// "Then allow newlines and tabs as well."
testParse("\n\n(\n\ta \t\tb (c\nd)\t   ) ", ["a", "b", ["c", "d"]]);
// Quotes
testParse("'x", parse("(quote x)"));
testParse("'(1 2 3)", parse("(quote (1 2 3))"));
// Comments
testParse("x ;; the letter x", "x");
testParse("(+\n 1 ;; arg 1\n 2 ;; arg 2\n)", ["+", "1", "2"]);

