var und = require('underscore');
var multimethod = require('multimethod');
var PEG = require('pegjs');
var deepEqual = require('deep-equal');
var assert = require('assert');
var fs = require('fs'); // for loading files

////// Error handling //////

function msg(/*vals*/) {
	return und.toArray(arguments).join(''); // TODO: Pretty printing.
}

function error(/*vals*/) {
	var vals = ['Error'].concat(und.toArray(arguments));
	console.log.apply(vals);
	throw new Error(msg(vals));
};

function logThrough(message, value) {
	console.log(message, value);
	return value;
}

////// Data types //////

function is_null(obj) {
	return obj == 'null';
}
function is_pair(obj) {
	if (!und.isArray(obj)) return false;
	assert.ok(obj.length == 2, msg('Pair has wrong number of elements:', obj));
	return true;
}

function is_list(obj) {
	return is_null(obj) || (is_pair(obj) && is_list(cdr(obj)));
}

function is_symbol(obj) {
	return und.isString(obj);
}
function is_number(obj) {
	return und.isNumber(obj);
}
function is_combiner(obj) {
	return is_operative(obj) || is_applicative(obj);
}
function is_operative(obj) {
	return obj.oper && und.isFunction(obj);
}
function is_applicative(obj) {
	return obj.appl && typeof und.isFunction(obj);
}
function is_anything(obj) {
	return is_symbol(obj) || is_number(obj) || is_pair(obj) || is_combiner(obj);
}

// Functions
function is_environment(obj) {
	return is_list(obj); // TODO: Add more checking.
}

// Make a function that checks its arguments and return value
var checked = function(func, arg_checkers, result_checker) {
	assert.ok(und.isFunction(func), func);
	assert.ok(und.isArray(arg_checkers), arg_checkers);
	assert.ok(und.isFunction(result_checker), result_checker);	
	return function(/*arguments*/) {
		und.each(und.zip(arg_checkers, und.toArray(arguments)), function(els) {
			var arg_check = els[0], arg = els[1];
			assert.ok(
				arg_check(arg),
				msg('Arg check failed:', arg, arg_check));
		});
		var result = func.apply(this, arguments);
		assert.ok(
			result_checker(result),
			msg('Result check failed:', result, result_checker));
		return result;
	}
}

// Pairs & lists

var cons = checked(function(a, b) {	
	return [a, b];
}, [is_anything, is_anything], is_pair);

var make_pair_accessor = function(i) {
	return checked(function(pair) {
		return pair[i];
	}, [is_pair], is_anything);
};
var car = make_pair_accessor(0);
var cdr = make_pair_accessor(1);

var make_pair_mutator = function(i) {
	return checked(function(pair, v) {
		pair[i] = v;
		return v;
	}, [is_pair, is_anything], is_anything);
};
var set_car = make_pair_mutator(0);
var set_cdr = make_pair_mutator(1);

/*
(define length (l) ...)
var length = checked(
	sc_to_js(lookup('length', e)),
	[is_list], is_number); // no env needed, as applicative?
*/
var length = checked(function(list) {
	return fold(list, 0, function(val, e) { return val + 1; });
}, [is_list], is_number);

var js_array_to_list = function(array) {
	if (array.length == 0) { return "null"; }
	else { return cons(array[0], js_array_to_list(array.slice(1))); }
};

var list_to_js_array = function(list) {
	return fold(list, [], function(arr, e) { return arr.concat([e]); });
};

// Numbers

var make_number_binop = function(op) {
	return checked(new Function("a", "b", "return a "+op+" b;"), [is_number, is_number], is_number);
};

var add = make_number_binop('+');
var sub = make_number_binop('-');
var mul = make_number_binop('*');
var div = make_number_binop('/');

// Tests

assert.ok(is_null("null"));
assert.ok(!is_null("x"));
assert.ok(!is_null(cons(1, 2)));

assert.ok(is_pair(cons(1, 2)));
assert.ok(!is_pair("x"));

assert.ok(is_list("null"));
assert.ok(is_list(cons(1, "null")));
assert.ok(is_list(cons(2, cons(1, "null"))));
assert.ok(!is_list(cons(1, 2)));

////// Parsing //////

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

testParse("(a b c)", js_array_to_list(["a", "b", "c"]));
testParse("(+ 1 (* x 3))", js_array_to_list(["+", "1", js_array_to_list(["*", "x", "3"])]));
testParse("(* n (factorial (- n 1)))", js_array_to_list(["*", "n", js_array_to_list(["factorial", js_array_to_list(["-", "n", "1"])])]));
// "Allow any number of spaces between atoms..."
testParse("(a b  c   d)", js_array_to_list(["a", "b", "c", "d"]));
// "...allow spaces around parentheses."
testParse(" ( a b  (c d )   ) ", js_array_to_list(["a", "b", js_array_to_list(["c", "d"])]));
// "Then allow newlines and tabs as well."
testParse("\n\n(\n\ta \t\tb (c\nd)\t   ) ", js_array_to_list(["a", "b", js_array_to_list(["c", "d"])]));
// Quotes
testParse("'x", parse("(quote x)"));
testParse("'(1 2 3)", parse("(quote (1 2 3))"));
// Comments
testParse("x ;; the letter x", "x");
testParse("(+\n 1 ;; arg 1\n 2 ;; arg 2\n)", js_array_to_list(["+", "1", "2"]));

testParse("(a . b)", cons("a", "b"));

// Dispatcher for multimethods operating on lists
var list_dispatch = function(list) {
	if (list == 'nil') { return 'nil'; }
	else if (typeof list == 'array') { return 'pair'; }
	else { return 'invalid'; }
};

// Make a JS function into an operative
// Assume an operand list, not a tree
js_func_to_operative = checked(function(func, pass_e) {
	var oper = checked(function(operands, e) {
		var js_func_args = list_to_js_array(operands);
		if (pass_e) js_func_args.push(e);
		return func.apply(null, js_func_args);
	}, [is_list, is_environment], is_anything);
	oper.oper = true;
	return oper;
}, [und.isFunction, und.isBoolean], is_operative);

// Create an applicative version of a combiner
var wrap = checked(function(combiner) {
	var appl = function(operands, e) {
		var args = map(
			operands,
			function(expr) {
				return evalsc(expr, e);
			});
		return combiner(args, e);
	};
	appl.appl = true;
	appl.wrapped = combiner; // For unwrapping
	return appl;
}, [is_combiner], is_applicative);
var wrap_ap = wrap(js_func_to_operative(wrap, false));

var fold = function(list, val, func) {
	if (list == 'null') {
		return val;
	} else if (is_pair(list)) {
		var newVal = func(val, car(list));
		return fold(cdr(list), func(val, car(list)), func);
	} else {
		error('Not a list:', list);
	}
};
var foldr = function(list, val, func) {
	if (list == 'null') {
		return val;
	} else if (is_pair(list)) {
		var cdrVal = foldr(cdr(list), val, func);
		var carVal = func(cdrVal, car(list));
		return carVal;
	} else {
		error('Not a list:', list);
	}
};
var map = checked(function(list, func) {
	return reverse(fold(list, "null", function(tail, el) { return cons(func(el), tail); }));
}, [is_list, und.isFunction], is_list);
var reverse = checked(function(list) {
	return fold(list, "null", function(tail, head) { return cons(head, tail); });
}, [is_list], is_list);


assert.deepEqual(reverse("null"), "null");
assert.deepEqual(reverse(cons(1, "null")), cons(1, "null"));
assert.deepEqual(reverse(cons(2, cons(1, "null"))), cons(1, cons(2, "null")));

assert.deepEqual(map("null", function(x) { return x * 2; }), "null");
assert.deepEqual(map(cons(1, "null"), function(x) { return x * 2; }), cons(2, "null"));
assert.deepEqual(map(cons(2, cons(1, "null")), function(x) { return x * 2; }), cons(4, cons(2, "null")));

var unwrap = function(applicative) {
	assert.ok(typeof applicative == "function");
	assert.ok(applicative.combiner); // Wrapped applicatives only
	return applicative.combiner;
};
var unwrap_ap = wrap(js_func_to_operative(unwrap, false));

//

var vau = checked(function(ptree, eparm, body, e) {
	
}, [is_anything, is_anything, is_anything, is_environment], is_combiner);

var vau_op = function(operands, e) {
	// TODO: Check operands properly.
	var ptree = car(operands);
	var eparm = car(cdr(operands));
	var body = cdr(cdr(operands));
	return vau(ptree, eparm, body, e);
};
vau_op.oper = true;

var lookup = checked(function (sym, e) {
	return {
		'+': wrap(js_func_to_operative(add, false)),
		'*': wrap(js_func_to_operative(mul, false))
	}[sym];
}, [is_symbol, is_environment], is_anything);

// FIXME: Another name so don't override JS eval.
var evalsc = checked(function(obj, e) {
	if (is_symbol(obj)) {
		var sym = obj;
		return lookup(sym, e);
	} else if (is_pair(obj)) {
		var combination = obj;
		var operator = car(combination);
		var operand_tree = cdr(combination);
		var combiner = evalsc(operator, e);
		assert.ok(is_combiner(combiner));
		return combiner(operand_tree, e);
	} else {
		return obj; // e.g. numbers
	}	
}, [is_anything, is_environment], is_anything);

var run = function(programText) {
	var parsed = parse(programText);
	console.log(parsed);
	var result = evalsc(parsed, "null");
	console.log(result);
}

// ['+', 5, ['*', 2, 3]]
run('(+ 5 (* 2 3))')