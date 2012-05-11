var assert = chai.assert;

////// Error handling //////

function msg(/*vals*/) {
	return _.toArray(arguments).join(''); // TODO: Pretty printing.
}

function error(/*vals*/) {
	var vals = ['Error'].concat(_.toArray(arguments));
	console.log('Error', vals);
	throw new Error(msg(vals));
};

function logThrough(message, value) {
	console.log(message, value);
	return value;
}

var logFuncOn = false;
var logFuncCallCount = 0;
var logFuncIndent = 0;
var logFunc = function(name, f) {
	return function() {
		if (logFuncOn) {
			var pad = '';
			for (var i = 0; i < logFuncIndent; i++) { pad += ' '; }
			var id = 'call-'+(logFuncCallCount++)+'-'+name;
			console.log(pad, id, _.map(_.toArray(arguments), scToString));
			logFuncIndent++;
			var result = f.apply(this, arguments);
			logFuncIndent--;
			console.log(pad, id, ' -> ', scToString(result));
			return result;
		} else {
			return f.apply(this, arguments);
		}
	};
};

var scToString = function(sc) {
	if (is_list(sc)) {
		var parts = _.map(list_to_js_array(sc), function(el) { return scToString(el); });
		return "("+(parts.join(' '))+")";
	} else if (is_pair(sc)) {
		return "("+scToString(car(sc))+" . "+scToString(cdr(sc))+")";
	} else if (is_operative(sc)) {
		return "<oper-"+combiner_name(sc)+">";
	} else if (is_applicative(sc)) {
		return "<appl-"+combiner_name(sc)+">";
	} else {
		return ''+sc;
	}
};

////// Data types //////

function is_null(obj) {
	return obj == 'null';
}
function is_pair(obj) {
	if (!_.isArray(obj)) return false;
	assert.ok(obj.length == 2, msg('Pair has wrong number of elements:', obj));
	return true;
}

function is_list(obj) {
	return is_null(obj) || (is_pair(obj) && is_list(cdr(obj)));
}

function is_symbol(obj) {
	return _.isString(obj);
}
function is_number(obj) {
	return _.isNumber(obj);
}
function is_combiner(obj) {
	return is_operative(obj) || is_applicative(obj);
}
function is_operative(obj) {
	return (obj.oper != null) && _.isFunction(obj);
}
function is_applicative(obj) {
	return (obj.appl != null) && typeof _.isFunction(obj);
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
	assert.ok(_.isFunction(func), func);
	assert.ok(_.isArray(arg_checkers), arg_checkers);
	assert.ok(_.isFunction(result_checker), result_checker);	
	return function(/*arguments*/) {
		_.each(_.zip(arg_checkers, _.toArray(arguments)), function(els) {
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

// General

var eqv = checked(function(a, b) {
	return js_boolean_to_symbol((typeof a == typeof b) && (a == b));
}, [is_scheem, is_scheem], is_symbol);

// Pairs & lists

// Dispatcher for multimethods operating on lists
var list_match = function(null_handler, pair_handler) {
	return function(list /* ... */) {
		var args = _.toArray(arguments);
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
	if (_.isArray(obj)) {
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
	return js_array_to_list(_.toArray(arguments));
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

function testParse(inputText, expectedAst) {
	var ast = peg.parse(inputText);
	assert.deepEqual(ast, expectedAst);
}

testParse("(a b c)", sc("a", "b", "c"));
testParse("(+ 1 (* x 3))", sc("+", 1, sc("*", "x", 3)));
testParse("(* n (factorial (- n 1)))", sc("*", "n", sc("factorial", sc("-", "n", 1))));
// "Allow any number of spaces between atoms..."
testParse("(a b  c   d)", sc("a", "b", "c", "d"));
// "...allow spaces around parentheses."
testParse(" ( a b  (c d )   ) ", sc("a", "b", sc("c", "d")));
// "Then allow newlines and tabs as well."
testParse("\n\n(\n\ta \t\tb (c\nd)\t   ) ", sc("a", "b", sc("c", "d")));
// Quotes
testParse("'x", peg.parse("(quote x)"));
testParse("'(1 2 3)", peg.parse("(quote (1 2 3))"));
// Comments
testParse("x ;; the letter x", "x");
testParse("(+\n 1 ;; arg 1\n 2 ;; arg 2\n)", sc("+", 1, 2));

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
}, [_.isFunction, _.isBoolean, is_js_string], is_operative);

// Create an applicative version of a combiner
var wrap_combiner = checked(function(combiner) {
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

// Create an applicative version of a scheem expression that evaluates to a combiner
var wrap = tag_operative(logFunc('wrap', checked(function(combiner_operand, e) {
	assert.ok(is_null(cdr(combiner_operand)));
	var combiner = evalsc(car(combiner_operand), e);
	return wrap_combiner(combiner);
}, [is_scheem, is_environment], is_applicative)), 'wrap');

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
}, [is_list, _.isFunction], is_list);
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
	return cons(sc(key, value), alist);
};
var js_obj_to_alist = function(obj) {
	var alist = "null";
	_.each(obj, function(value, key) { alist = alist_put(alist, key, value); });
	return alist;
};

assert.deepEqual(alist_get(sc(), "a"), null);
assert.deepEqual(alist_get(sc(sc("a", 1)), "a"), sc("a", 1));
assert.deepEqual(alist_put(sc(), "a", 1), sc(sc("a", 1)));
assert.deepEqual(js_obj_to_alist({a: 1}), sc(sc("a", 1)));

////

var unwrap = checked(function(applicative) {
	return applicative.wrapped;
}, [is_applicative], is_combiner);
var unwrap_ap = wrap_combiner(js_func_to_operative(unwrap, false, 'unwrap'));

//

var bind = checked(function(name_tree, value_tree) {
	if (is_null(name_tree) && is_null(value_tree)) {
		return "null";
	} else if (name_tree == "_") {
		return "null";
	} else if (is_symbol(name_tree) && !is_null(name_tree)) {
		return cons(cons(name_tree, cons(value_tree, "null")), "null");
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
assert.deepEqual(bind("a", 1), sc(sc("a", 1)));
assert.deepEqual(bind(["a", "b"], [1, 2]), sc(sc("a", 1), sc("b", 2)));
assert.deepEqual(
	scToString(bind(
		peg.parse("((test . body) rest)"),
		peg.parse("(((null? ()) 0) (#t 1))")
	)),
	scToString(peg.parse("((test (null? ())) (body (0)) (rest (#t 1)))"))
);

var vau = tag_operative(function(operands, e, opt_name) {
	var ptree = car(operands);
	var etree = car(cdr(operands));
	var body = cons(begin, cdr(cdr(operands)));
	return tag_operative(function (operands2, e2) {
		var bindings = append(bind(ptree, operands2), bind(etree, e2));
		var e3 = cons(bindings, e2);
		return evalsc(body, e3);
	}, opt_name || '@vau');
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
	assert.deepEqual(cdr(cdr(pair)), "null");
	return car(cdr(pair));
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
		//console.log('Eval combiner:', combiner_name(combiner));
		return combiner(operand_tree, e);
	} else {
		return obj; // e.g. numbers
	}
}, [is_scheem, is_environment], is_scheem));
eval_op = wrap_combiner(js_func_to_operative(evalsc, false, 'eval')); // env given as normal arg

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
	set_car(cdr(current_pair), value);
	return value; // Optional.
}), [is_symbol, is_scheem, is_environment], is_scheem);

var ifsc = checked(function(cond_operand, true_operand, false_operand, e) {
	var cond_value = evalsc(cond_operand, e);
	var eval_operand = (cond_value == '#t') ? true_operand : false_operand;
	return evalsc(eval_operand, e);
}, [is_scheem, is_scheem, is_scheem, is_environment], is_scheem);

var baseEnv = function() {
	var e = cons(js_obj_to_alist({
		'eqv?': wrap_combiner(js_func_to_operative(eqv, false, 'eqv?')),
		'+': wrap_combiner(js_func_to_operative(make_number_binop('+'), false, '+')),
		'-': wrap_combiner(js_func_to_operative(make_number_binop('-'), false, '-')),
		'*': wrap_combiner(js_func_to_operative(make_number_binop('*'), false, '*')),
		'/': wrap_combiner(js_func_to_operative(make_number_binop('/'), false, '/')),
		'<': wrap_combiner(js_func_to_operative(make_number_binpred('<'), false, '<')),
		'<=': wrap_combiner(js_func_to_operative(make_number_binpred('<='), false, '<=')),
		'=': wrap_combiner(js_func_to_operative(make_number_binpred('=='), false, '==')),
		'>=': wrap_combiner(js_func_to_operative(make_number_binpred('>='), false, '>=')),
		'>': wrap_combiner(js_func_to_operative(make_number_binpred('>'), false, '>')),
		'begin': begin,
		'define': js_func_to_operative(define, true, 'define'),
		'set!': js_func_to_operative(set, true, 'set!'),
		'if': js_func_to_operative(ifsc, true, 'if'),
		'vau': vau,
		'list': list,
		'list*': list_star,
		'cons': wrap_combiner(js_func_to_operative(cons, false, 'cons')),
		'car': wrap_combiner(js_func_to_operative(car, false, 'car')),
		'cdr': wrap_combiner(js_func_to_operative(cdr, false, 'cdr')),
		'set-car!': wrap_combiner(js_func_to_operative(set_car, false, 'set-car!')),
		'set-cdr!': wrap_combiner(js_func_to_operative(set_cdr, false, 'set-cdr!')),
		'eval': eval_op,
		'wrap': wrap,
		'unwrap': unwrap_ap,
		// TODO: Check how symbol evaluation actually works. This is probably a hack.
		'null': 'null',
		'#t': '#t',
		'#f': '#f'
	}), "null");
	
	// TODO: Try to implement this in scheem itself?!
	function define_fixed(name, definitionText) {
		var ast = peg.parse(definitionText);
		function fix(obj) {
			if (is_null(obj)) { return "null"; }
			else if (is_pair(obj)) { return cons(fix(car(obj)), fix(cdr(obj))); }
			else if (is_symbol(obj)) {
				var pair = env_get(e, name);
				if (pair) {
					return car(cdr(pair));
				} else {
					return obj; // Not in env.
				}
			} else {
				return obj;
			}
		};
		var fixedAst = fix(ast);
		define(name, fixedAst, e);
	};
	define_fixed('quote', '(vau (x) _ x)');
	define_fixed('lambda', '(vau (ptree . body) static-env ' +
		"(wrap (eval (list* vau ptree '_ body) static-env)))");
	define_fixed('apply', '(lambda (c x e) (eval (cons (unwrap c) x) e))');
	define_fixed('null?', "(lambda (x) (eqv? x 'null))");
	define_fixed('cond', "(vau ((test body) . rest) e " +
		"(if (eval test e) (eval body e) (eval (cons cond rest) e)))");
	define_fixed('map', "(lambda (f l) (if (null? l) 'null (cons (f (car l)) (map f (cdr l)))))");
	define_fixed('unzip', "(lambda (l) (list (map (lambda ((n v)) n) l) (map (lambda ((n v)) v) l)))")
	//define_fixed('let', "(vau (bindings . body) e (eval (cons begin body) (cons bindings e)))")
	return e;
};

var run = function(programText) {
	console.log('Running program >>>>>');
	console.log('Program:', programText);
	var parsed = peg.parse(programText);
	console.log('Parsed:', scToString(parsed));
	var e = baseEnv();
	var result = evalsc(parsed, e);
	console.log('Environment:', scToString(e));
	console.log('Result:', scToString(result));
};

var testRun = function(programText, resultText) {
	console.log('Testing ', programText, ' -> ', resultText);
	var e = baseEnv();
	logFuncOn = false;
	assert.deepEqual(scToString(evalsc(peg.parse(programText), e)), resultText);
}

//testRun("(let ((x 2) (y 5)) (+ x y))", "7");
testRun("(map (lambda (x) (* x 2)) (list 1 2 3))", "(2 4 6)");
testRun("((lambda ((n v)) v) (list 'x 2))", "2");
testRun("(unzip (list (list 'x 2) (list 'y 5)))", "((x y) (2 5))");
testRun("(if (null? ()) 0 1)", "0");
testRun("(if (null? (list 1 2)) 0 1)", "1");
testRun("(cond ((null? ()) 0) (#t 1))", "0");
testRun("(cond ((null? (list 1 2)) 0) (#t 1))", "1");
testRun("(begin (define a 'z) (cond ((eqv? a 'x) 1) ((eqv? a 'y) 2) ((eqv? a 'z) 3) (#t 4)))", "3");
testRun("(null? ())", "#t");
testRun("(null? (list 1 2))", "#f");
testRun('(eqv? 1 1)', '#t');
testRun('(eqv? 1 2)', '#f');
testRun("(eqv? 'x 2)", '#f');
testRun('(eqv? null null)', '#t');
testRun('(+ 5 (* 2 3))', '11');
testRun('(begin 1)', '1');
testRun('(begin 1 2)', '2');
testRun('(begin (define x 5) (set! x (+ x 1)) x)', '6');
testRun("(+ 1 2)", '3');
testRun("'(+ 1 2)", '(+ 1 2)');
testRun("(quote 1)", '1');
testRun("(quote (+ 1 2))", '(+ 1 2)');
testRun("(= 2 (+ 1 1))", '#t');
testRun("(begin (define x 2) (if (< x 5) 0 10))", '0');
testRun("(list (define x 2) (if (< x 5) 0 10))", '(2 0)');
testRun("(list* 1 (list 2 3))", '(1 2 3)');
testRun("(vau (x) e e)", '<oper-@vau>');
testRun("(eval '1 '())", '1');
testRun("(eval '(+ 1 2) (list (list (cons '+ +))))", '3');
testRun("(lambda (x) (+ x 1))", '<appl-wrpd-@vau>');
testRun("((lambda (x) (+ x 1)) 2)", '3');
testRun("(apply + (list 1 2) ())", '3');