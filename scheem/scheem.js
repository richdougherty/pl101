var und = require('underscore');
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

var logFuncOn = true;
var logFuncCallCount = 0;
var logFunc = function(name, f) {
	return function() {
		if (logFuncOn) {
			var id = 'call-'+(logFuncCallCount++)+'-'+name;
			console.log(id, und.map(und.toArray(arguments), scToString));
			var result = f.apply(this, arguments);
			console.log(id, ' -> ', scToString(result));
			return result;
		} else {
			return f.apply(this, arguments);
		}
	};
};

var scToString = function(sc) {
	if (is_list(sc)) {
		var parts = und.map(list_to_js_array(sc), function(el) { return scToString(el); });
		return "("+(parts.join(' '))+")";
	} else if (is_pair(sc)) {
		return "("+scToString(car(sc))+" . "+scToString(cdr(sc))+")";
	} else if (is_operative(sc)) {
		return "<oper-"+combiner_name(sc)+">";
	} else if (is_applicative(sc)) {
		return "<appl-"+combiner_name(sc)+">";
	} else {
		return sc;
	}
};

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
function is_scheem(obj) {
	return is_symbol(obj) || is_number(obj) || is_pair(obj) || is_combiner(obj);
}
function is_anything(obj) {
	return true;
}
function is_either(a, b) {
	return function(obj) { return a(obj) || b(obj); }
}
function is_js_null(obj) {
	return obj === null;
}
function is_js_string(obj) {
	return typeof obj == 'string';
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

// Dispatcher for multimethods operating on lists
var list_match = function(null_handler, pair_handler) {
	return function(list /* ... */) {
		var args = und.toArray(arguments);
		if (list == "null") { return null_handler.apply(null, arguments); }
		else if (is_pair(list)) { return pair_handler.apply(null, arguments); }
		else { error('Not a list'); }
	};
};

var cons = checked(function(a, b) {	
	return [a, b];
}, [is_scheem, is_scheem], is_pair);

var make_pair_accessor = function(i) {
	return checked(function(pair) {
		return pair[i];
	}, [is_pair], is_scheem);
};
var car = make_pair_accessor(0);
var cdr = make_pair_accessor(1);

var make_pair_mutator = function(i) {
	return checked(function(pair, v) {
		pair[i] = v;
		return v;
	}, [is_pair, is_scheem], is_scheem);
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

var js_to_scheem = function(obj) {
	if (und.isArray(obj)) {
		var arr = obj;
		if (arr.length == 0) { return "null"; }
		else { return cons(js_to_scheem(arr[0]), js_to_scheem(arr.slice(1))); }
	} else {
		return obj;
	}
};

assert.deepEqual(js_to_scheem([1, 2]), cons(1, cons(2, "null")));
assert.deepEqual(js_to_scheem([1, [2, 3]]), cons(1, cons(cons(2, cons(3, "null")), "null")));

var sc = function(/*arguments*/) {
	return js_array_to_list(und.toArray(arguments));
};

// Numbers

var js_boolean_to_symbol = function(bool) {
	return bool ? "#t" : "#f";
};

var make_number_binop = function(op) {
	return checked(new Function("a", "b", "return a "+op+" b;"), [is_number, is_number], is_number);
};
var make_number_binpred = function(op) {
	return checked(new Function("a", "b", "return (a "+op+" b) ? '#t' : '#f';"), [is_number, is_number], is_symbol);
};

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

var tag_operative = function(func, opt_name) {
	func.oper = opt_name || "anon";
	return func;
};

var combiner_name = function(combiner) {
	return combiner.oper || combiner.appl;
};

// Make a JS function into an operative
// Assume an operand list, not a tree
var js_func_to_operative = checked(function(func, pass_e, opt_name) {
	return tag_operative(checked(function(operands, e) {
		var js_func_args = list_to_js_array(operands);
		if (pass_e) js_func_args.push(e);
		return func.apply(null, js_func_args);
	}, [is_list, is_environment], is_scheem), opt_name);
}, [und.isFunction, und.isBoolean, is_js_string], is_operative);

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
	appl.appl = 'wrpd-'+combiner_name(combiner);
	appl.wrapped = combiner; // For unwrapping
	return appl;
}, [is_combiner], is_applicative);
var wrap_op = js_func_to_operative(wrap, false, 'wrap');

var fold = list_match(
	function(nl, val, func) { return val; },
	function(list, val, func) {
		var newVal = func(val, car(list));
		return fold(cdr(list), newVal, func);
	}
);
var foldr = list_match(
	function(nl, val, func) { return val; },
	function(list, val, func) {
		var cdrVal = foldr(cdr(list), val, func);
		var carVal = func(cdrVal, car(list));
		return carVal;
	}
);
var map = checked(function(list, func) {
	return reverse(fold(list, "null", function(tail, el) { return cons(func(el), tail); }));
}, [is_list, und.isFunction], is_list);
var reverse = checked(function(list) {
	return fold(list, "null", function(tail, head) { return cons(head, tail); });
}, [is_list], is_list);

var append = list_match(
	function(nl, list2) { return list2; },
	function(list1, list2) { return cons(car(list1), append(cdr(list1), list2)); }
);

assert.deepEqual(reverse("null"), "null");
assert.deepEqual(reverse(cons(1, "null")), cons(1, "null"));
assert.deepEqual(reverse(cons(2, cons(1, "null"))), cons(1, cons(2, "null")));

assert.deepEqual(map("null", function(x) { return x * 2; }), "null");
assert.deepEqual(map(cons(1, "null"), function(x) { return x * 2; }), cons(2, "null"));
assert.deepEqual(map(cons(2, cons(1, "null")), function(x) { return x * 2; }), cons(4, cons(2, "null")));
assert.deepEqual(append("null", "null"), "null");
assert.deepEqual(append([1, "null"], "null"), [1, "null"]);
assert.deepEqual(append("null", [1, "null"]), [1, "null"]);
assert.deepEqual(append([1, "null"], [2, "null"]), [1, [2, "null"]]);

//// Association lists ////

// Only works with symbol keys for the moment.
var alist_get = list_match(
	function(alist, key) { return null; },
	function(alist, key) {
		var pair = car(alist);
		if (car(pair) == key) { return pair; }
		else { return alist_get(cdr(alist), key); }
	}
);
var alist_put = function(alist, key, value) {
	return cons(cons(key, value), alist);
};
var js_obj_to_alist = function(obj) {
	var alist = "null";
	und.each(obj, function(value, key) { alist = alist_put(alist, key, value); });
	return alist;
};

assert.deepEqual(alist_get("null", "a"), null);
assert.deepEqual(alist_get([["a", 1], "null"], "a"), ["a", 1]);
assert.deepEqual(alist_put("null", "a", 1), [["a", 1], "null"]);
assert.deepEqual(js_obj_to_alist({a: 1}), [["a", 1], "null"]);

////

var unwrap = function(applicative) {
	assert.ok(typeof applicative == "function");
	assert.ok(applicative.combiner); // Wrapped applicatives only
	return applicative.combiner;
};
var unwrap_ap = wrap(js_func_to_operative(unwrap, false, 'unwrap'));

//

var bind = checked(function(name_tree, value_tree) {
	if (is_null(name_tree) && is_null(value_tree)) {
		return "null";
	} else if (name_tree == "_") {
		return "null";
	} else if (is_symbol(name_tree)) {
		return cons(cons(name_tree, value_tree), "null");
	} else if (is_pair(name_tree) && is_pair(value_tree)) {
		return append(
			bind(car(name_tree), car(value_tree)),
			bind(cdr(name_tree), cdr(value_tree))
		);
	} else {
		error("Cannot bind: ", name_tree, value_tree);
	}
}, [is_scheem, is_scheem], is_list);

assert.deepEqual(bind("null", "null"), "null");
assert.deepEqual(bind("a", 1), [["a", 1], "null"]);
assert.deepEqual(bind(["a", "b"], [1, 2]), [["a", 1], [["b", 2], "null"]]);

var vau = tag_operative(function(operands, e) {
	var ptree = car(operands);
	var etree = car(cdr(operands));
	var body = cons(begin, cdr(cdr(operands)));
	return tag_operative(function (operands2, e2) {
		var bindings = append(bind(ptree, operands2), bind(etree, e2));
		var e3 = cons(bindings, e2);
		return evalsc(body, e3);
	}, '@vau');
}, 'vau');

var begin = tag_operative(function(operands, e) {
	return fold(operands, "#f", function(result, operand) {
		return evalsc(operand, e);
	});
}, 'begin');

var list = tag_operative(function(operands, e) {
	return reverse(fold(operands, "null", function(result, operand) {
		return cons(evalsc(operand, e), result);
	}));
}, 'list');

var splice_last = checked(function(list) {
	assert.ok(is_pair(list));
	if (cdr(list) == "null") {
		return car(list);
	} else {
		return cons(car(list), splice_last(cdr(list)));
	}
}, [is_list], is_list);

assert.deepEqual(splice_last(js_to_scheem(['a', ['b', 'c']])), js_to_scheem(['a', 'b', 'c']));

var list_star = tag_operative(function(operands, e) {
	return splice_last(list(operands, e));
}, 'list*');


var env_get = list_match(
	function(nl, sym) { return null; },
	function(env, sym) {
		var top = car(env);
		var pair = alist_get(top, sym);
		if (pair == null) { return env_get(cdr(env), sym); }
		else { return pair; }
	}
);

var lookup = checked(function (sym, e) {
	var pair = env_get(e, sym);
	if (pair == null) error('Cannot find symbol: '+sym);
	return cdr(pair);
}, [is_symbol, is_environment], is_scheem);

// FIXME: Another name so don't override JS eval.
var evalsc = logFunc('evalsc', checked(function(obj, e) {
	if (is_symbol(obj)) {
		var sym = obj;
		return lookup(sym, e);
	} else if (is_pair(obj)) {
		var combination = obj;
		var operator = car(combination);
		var operand_tree = cdr(combination);
		var combiner = evalsc(operator, e);
		assert.ok(is_combiner(combiner));
		console.log('Eval combiner:', combiner_name(combiner));
		return combiner(operand_tree, e);
	} else {
		return obj; // e.g. numbers
	}
}, [is_scheem, is_environment], is_scheem));
eval_op = wrap(js_func_to_operative(evalsc, false, 'eval')); // env given as normal arg

var quote = vau(sc(sc('x'), '_', 'x'));

var lambda = vau(
	sc(cons('ptree', 'body'), 'static-env',
		sc(wrap_op, sc(eval_op, sc(list_star, vau, 'ptree', sc(quote, '_'), 'body'), 'static-env'))));
//		sc(wrap_op, sc(eval_op, sc(list_star, vau, 'ptree', '_', 'body')), 'static-env')));
	

//var quote = tag_operative(checked(function(operands, e) {
//	return operands;
//}, [is_scheem, is_environment], is_scheem));

var define = checked(logFunc('define', function(name, value_operand, e) {
	var value = evalsc(value_operand, e);
	var current_scope = car(e);
	var current_pair = alist_get(current_scope, name);
	if (current_pair != null) { error('Already defined: '+name); }
	var new_scope = alist_put(current_scope, name, value);
	// Mutate current env
	set_car(e, new_scope);
	return value; // Optional.
}), [is_symbol, is_scheem, is_environment], is_scheem);

var set = checked(logFunc('set', function(name, value_operand, e) {
	var value = evalsc(value_operand, e);
	var current_scope = car(e);
	var current_pair = alist_get(current_scope, name);
	if (current_pair == null) { error('Undefined, cannot set: '+name); }
	set_cdr(current_pair, value);
	return value; // Optional.
}), [is_symbol, is_scheem, is_environment], is_scheem);

var ifsc = checked(function(cond_operand, true_operand, false_operand, e) {
	var cond_value = evalsc(cond_operand, e);
	var eval_operand = (cond_value == '#t') ? true_operand : false_operand;
	return evalsc(eval_operand, e);
}, [is_scheem, is_scheem, is_scheem, is_environment], is_scheem);

var baseEnv = function() {
	return cons(js_obj_to_alist({
		'+': wrap(js_func_to_operative(make_number_binop('+'), false, '+')),
		'-': wrap(js_func_to_operative(make_number_binop('-'), false, '-')),
		'*': wrap(js_func_to_operative(make_number_binop('*'), false, '*')),
		'/': wrap(js_func_to_operative(make_number_binop('/'), false, '/')),
		'<': wrap(js_func_to_operative(make_number_binpred('<'), false, '<')),
		'<=': wrap(js_func_to_operative(make_number_binpred('<='), false, '<=')),
		'=': wrap(js_func_to_operative(make_number_binpred('=='), false, '==')),
		'>=': wrap(js_func_to_operative(make_number_binpred('>='), false, '>=')),
		'>': wrap(js_func_to_operative(make_number_binpred('>'), false, '>')),
		'begin': begin,
		'define': js_func_to_operative(define, true, 'define'),
		'set!': js_func_to_operative(set, true, 'set!'),
		'quote': quote,
		'if': js_func_to_operative(ifsc, true, 'if'),
		'vau': vau,
		'list': list,
		'list*': list_star,
		'cons': wrap(js_func_to_operative(cons, false, 'cons')),
		'car': wrap(js_func_to_operative(car, false, 'car')),
		'cdr': wrap(js_func_to_operative(cdr, false, 'cdr')),
		'set-car!': wrap(js_func_to_operative(set_car, false, 'set-car!')),
		'set-cdr!': wrap(js_func_to_operative(set_cdr, false, 'set-cdr!')),
		'lambda': lambda,
		'eval': eval_op
	}), "null");
};

var run = function(programText) {
	console.log('Running program >>>>>');
	console.log('Program:', programText);
	var parsed = parse(programText);
	console.log('Parsed:', scToString(parsed));
	var e = baseEnv();
	var result = evalsc(parsed, e);
	console.log('Environment:', scToString(e));
	console.log('Result:', scToString(result));
};

//run('(+ 5 (* 2 3))');
//run('(begin 1)');
//run('(begin 1 2)');
//run('(begin (define x 5) (set! x (+ x 1)))');
//run("(+ 1 2)");
//run("'(+ 1 2)");
//run("(quote 1)");
//run("(quote (+ 1 2))");
//run("(= 2 (+ 1 1))");
//run("(begin (define x 2) (if (< x 5) 0 10))");
//run("(list (define x 2) (if (< x 5) 0 10))");
//run("(list* 1 (list 2 3))");
//run("(vau (x) e e)");
//run("(eval '1 '())");
//run("(eval '(+ 1 2) (list (list (cons '+ +))))");
run("(lambda (x) (+ x 1))");
//run("((lambda (x) (+ x 1)) 2)");