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

function error(vals) {
	throw msg.apply(null, vals);
};

////// Data types //////

function is_null(obj) {
	return obj == 'null';
}
function is_pair(obj) {
	if (!obj.length) return false;
	assert.ok(obj.length == 2, msg('Pair has wrong number of elements:', obj));
	return true;
}
function is_list(obj) {
	return is_null(obj) || is_pair(obj);
}
function is_symbol(obj) {
	return typeof obj == 'string';
}
function is_number(obj) {
	return typeof obj == 'number';
}
function is_combiner(obj) {
	return is_operative(obj) || is_applicative(obj);
}
function is_operative(obj) {
	return obj.oper && typeof obj == 'function';
}
function is_applicative(obj) {
	return obj.appl && typeof obj == 'function';
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
	return function(/*arguments*/) {
		und.each(und.zip(arg_checkers, arguments), function(els) {
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
		return list[i];
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

// Numbers

var make_number_binop = function(binop) {
	return checked(new Function("a, b", "a "+op+" b"), [is_number, is_number], is_number);
};

var add = make_number_binop('+');
var sub = make_number_binop('-');
var mul = make_number_binop('*');
var div = make_number_binop('/');

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
function js_func(func, operand_checks, pass_e) {
	var oper = function(operands, e) {
		var js_func_args = fold(operands, [], function(arr, operand) {
			return arr.concat(operand);
		});
		und.each(und.zip(operand_checks, js_func_args), function(els) {
			var operand_check = els[0];
			var js_func_arg = els[1];
			assert.ok(
				operand_check(js_func_arg),
				msg('Operand fails check:', js_func_arg, operand_check, func));
		});
		assert.ok(is_environment(e));
		if (pass_e) js_func_args.push(e);
		return func.apply(null, js_func_args);
	};
	oper.oper = true;
	return oper;
};

// Create an applicative version of a combiner
var wrap = checked(function(combiner) {
	var appl = function(operands, e) {
		var args = map(
			operands,
			function(expr) {
				return sc_eval(expr, e);
			});
		combiner(args, e);
	};
	appl.appl = true;
	appl.wrapped = combiner; // For unwrapping
	return appl;
}, [is_combiner], is_applicative);
var wrap_ap = wrap(js_func(wrap, [is_applicative], false));

var fold = function(list, val, func) {
	if (list == 'null') {
		return val;
	} else if (typeof list == 'array') {
		var newVal = func(val, list[0]);
		return fold(cdr(list), func(val, car(list)), func);
	} else {
		error('Not a list:', list);
	}
};


var unwrap = function(applicative) {
	assert.ok(typeof applicative == "function");
	assert.ok(applicative.combiner); // Wrapped applicatives only
	return applicative.combiner;
};
var unwrap_ap = wrap(js_func(unwrap, [is_applicative], false));

var cons_ap = wrap(js_func(cons, [is_anything, is_anything], true));

var car_ap = wrap(js_func(car, [is_pair], false));
var cdr_ap = wrap(js_func(cdr, [is_pair], false));

var map = multimethod()
	.dispatch(list_dispatch)
	.when('null', function(n, f) {
		return n;
	})
	.when('pair', function(pair, f) {
		return sc_cons(f(pair.car), sc_map(pai.cdr));
	})
	.default(function(invalid, f) {
		sc_error('Cannot map non-list: '+sc_debugString(invalid));
	});

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

function typeof_dispatch(expr) {
	return typeof expr;
}

// FIXME: Another name so don't override JS eval.
var eval = multimethod()
	.dispatch(typeof_dispatch)
	.when('string', function(sym, e) {
		return sc_lookup(sym, e);
	})
	.when('array', function(pair, e) {
		var operator = pair.car;
		var operands = pair.cdr;
		var combiner = sc.eval(operator, e);
		assert.equal(combiner.tag, 'comb');
		return combiner.func(operator, e);
	})
	.default(function(expr, e) {
		return expr;
	});
var eval_ap = wrap(js_func(eval, [is_anything], true));
