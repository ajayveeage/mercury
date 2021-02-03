//==========================================================================
// Mercury Intermediate Language
//
// Returns results for the parsing tree when parsing a line of code
//==========================================================================

// const bind = require('./bind-functions.gen.json');

// total-serialism library functions
const tsIR = require('./totalSerialismIR.js').functionMap;
// included instrument/object defaults
const instruments = require('./data/objects.js').objects;
// keyword bindings, use custom keywords for functions
const keywords = require('./data/bind-functions.json');
// mini language, use single characters for keywords and functions
const miniLang = require('./data/mini-functions.json');

let keywordBinds = {};
keywordBinds = keywordBindings(keywords, keywordBinds);
keywordBinds = keywordBindings(miniLang, keywordBinds);
// console.log(keywordBinds);

// processing for identifiers
function identifier(obj){
	let v = obj[0].value;
	if (v.match(/^[a-gA-G](?:#+|b+|x)?(?:[0-9])?$/)){
		// is the identifier a note?
		return { "@note" : v }
	} else if (v.match(/^~[^\s]*$/)){
		// is the identiefer a signal?
		return { "@signal" : v }
	}
	return { "@identifier" : v };
}

// processing for division
function division(obj){
	// concatenate division numbers to string
	return { "@division" : obj[0].value + '/' + obj[2].value };
}

// processing for numbers
function num(obj){
	// parse string to number
	return { "@number" : Number(obj[0].value) };
}

// check if the function is part of mapped functions
// else return original value
function keyBind(f){
	return (keywordBinds[f]) ? keywordBinds[f] : f;
}

// Generate a dictionary of keyword and binding pairs based on 
// input dictionary of categorized keybindings 
function keywordBindings(dict, obj){
	// console.log('Generating function keyword bindings...');	
	let binds = { ...obj };
	Object.keys(dict).forEach((k) => {
		// store itself first
		binds[k] = k;
		dict[k].forEach((b) => {
			if (binds[b]) {
				// if already exists ignore and print warning
				console.log('Warning! Duplicate keyword: [ '+b+' ] \nfor: [ '+binds[b]+' ] and: [ '+k+' ] \n => BIND IGNORED');
			} else {
				// store binding name with resulting keyword
				binds[b] = k;
			}
			// console.log('mapped: [ '+b+' ] to: [ '+k+' ]');
		});
	});
	// post(binds);
	// console.logt('...keyword bindings generated');
	return binds;
}

let code = {
	'global' : {
		'tempo' : 90,
		'scale' : 'chromatic',
		'root' : 'c',
		'randomSeed' : 0
	},
	'variables' : {},
	'objects' : {}
}

function deepCopy(o){
	return JSON.parse(JSON.stringify(o));
}

function traverseTreeIR(tree){
	tree.map((t) => {
		// console.log(t);
		code = traverseTree(t, code);
	})
	return code;
}

function traverseTree(tree, code, level){
	// console.log(`tree at level ${level}`, tree, code);
	let map = {
		'@global' : (ccode, el) => {
			// console.log('@global', el);
			return ccode;
		},
		'@list' : (ccode, el) => {
			// console.log('@list', el);
			let r = traverseTree(el['@params'], ccode, '@list');
			ccode.variables[el['@name']] = r;
			return ccode;
		},
		'@object' : (ccode, el) => {
			// console.log('@object', el);
			let inst;
			
			let action = el['@action'];
			let init = (action === 'new')? true : false;
			delete el['@action'];

			if (!init){
				let key = Object.keys(el['@name'])[0];
				let name = map[key](ccode, el['@name'][key]);

				inst = ccode.objects[name]
				delete el['@name'];
			}

			Object.keys(el).forEach((e) => {
				inst = map[e](ccode, el[e], inst, '@object');
			});
			ccode.objects[inst.functions.name] = inst;
			
			return ccode;
		},
		'@name' : (ccode, el) => {
			// console.log('@name', ccode, el, level);
			let name;
			let inst;
			Object.keys(el).forEach((e) => {
				name = map[e](ccode, el[e]);
			});
			if (!instruments[name]){
				console.error(`Unknown object type: ${name}`);
				inst = deepCopy(instruments['empty']);
			}
			inst = deepCopy(instruments[name]);
			inst.object = name;
			return inst;
		},
		'@type' : (ccode, el, inst) => {
			// console.log('@type', ccode, el);
			Object.keys(el).forEach((e) => {
				inst.type = map[e](ccode, el[e]);
			});
			return inst;
		},
		'@functions' : (ccode, el, inst, level) => {
			// console.log('@funcs', ccode);
			let arr = [];
			el.map((e) => {
				Object.keys(e).map((k) => {
					inst.functions = map[k](ccode, e[k], inst.functions, level);
				})
			})
			return inst;
			// console.log('@funcs', arr);
		},
		'@function' : (ccode, el, funcs, level) => {
			// console.log('@func', el);
			let args = [];
			let func = keyBind(el['@name']);

			if (el['@args'] !== null){
				el['@args'].map((e) => {
					Object.keys(e).map((k) => {
						args.push(map[k](ccode, e[k], level));
					});
				});
			}
			// console.log('@func', el, '@args', args, '@level', level);
			if (tsIR[func]){
				if (args){
					return tsIR[func](...args);
				}
				return tsIR[func]();
			} else if (level === '@list'){
				console.error(`Unknown list function: ${func}`);
				return [0];
			} else if (level === '@object'){
				if (func === 'add_fx'){
					funcs[func].push(args);
				} else {
					funcs[func] = args;
				}
				return funcs;
			} else {
				el['@args'] = args;
				return el;
			}
		},
		'@array' : (ccode, el) => {
			let arr = [];
			el.map((e) => {
				Object.keys(e).map((k) => {
					arr.push(map[k](ccode, e[k]));
				});
			});
			return arr;
		},
		'@identifier' : (ccode, el) => {
			// console.log('@identifier', ccode, el);
			if (code.variables[el]){
				return code.variables[el];
			}
			return el;
		},
		'@string' : (ccode, el) => {
			return el;
		},
		'@number' : (ccode, el) => {
			return el;
		},
		'@division' : (ccode, el) => {
			return el;
		},
		'@note' : (ccode, el) => {
			return el;
		}
	}

	if (Array.isArray(tree)) {
		tree.map((el) => {
			Object.keys(el).map((k) => {
				console.log('array process', k);
				code = map[k](code, el[k], level);
			});
		})
	} else {
		Object.keys(tree).map((k) => {
			// console.log(k);
			code = map[k](code, tree[k], level);
		});
	}
	return code;
}

module.exports = { identifier, division, num, keyBind, traverseTreeIR };