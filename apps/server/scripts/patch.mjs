import fs from 'node:fs';
import path from 'node:path';
import replace from 'replace-in-file';

console.log('==================> postInstall <=================');

const patchParseServerSelectNestedObjectKeys = async () => {
	const filePath1 = path.resolve(
		import.meta.dirname,
		'../node_modules/parse-server/lib/RestQuery.js',
	);
	const filePath2 = path.resolve(
		import.meta.dirname,
		'../../../node_modules/parse-server/lib/RestQuery.js',
	);

	const exists1 = fs.existsSync(filePath1);

	// const results =
	await replace({
		disableGlobs: true,
		files: exists1 ? filePath1 : filePath2,
		from: /return key.split\('.'\)\[0];/g,
		to: 'return key;',
	});
};

const patchParseServerAuthLib = async () => {
	const filePath1 = path.resolve(
		import.meta.dirname,
		'../node_modules/parse-server/lib/Auth.js',
	);
	const filePath2 = path.resolve(
		import.meta.dirname,
		'../../../node_modules/parse-server/lib/Auth.js',
	);

	const exists1 = fs.existsSync(filePath1);

	// const results =
	await replace({
		disableGlobs: true,
		files: exists1 ? filePath1 : filePath2,
		from: /function master\(config\) {/g,
		to: 'exports.master = master\nfunction master(config) {',
	});
};

const patchClassNameRegex = async () => {
	const filePath1 = path.resolve(
		import.meta.dirname,
		'../node_modules/parse-server/lib/Controllers/SchemaController.js',
	);
	const filePath2 = path.resolve(
		import.meta.dirname,
		'../../../node_modules/parse-server/lib/Controllers/SchemaController.js',
	);

	const exists1 = fs.existsSync(filePath1);

	// const results =
	await replace({
		disableGlobs: true,
		files: exists1 ? filePath1 : filePath2,
		from: /\/\^_Join:\[A-Za-z0-9_]\+:\[A-Za-z0-9_]\+\//g,
		to: '/^(_Join|_CustomJoin):[A-Za-z0-9_]+:[A-Za-z0-9_]+/',
	});
};

const patchParseMiddlewares_1 = async () => {
	const filePath1 = path.resolve(
		import.meta.dirname,
		'../node_modules/parse-server/lib/middlewares.js',
	);
	const filePath2 = path.resolve(
		import.meta.dirname,
		'../../../node_modules/parse-server/lib/middlewares.js',
	);

	const exists1 = fs.existsSync(filePath1);

	await replace({
		disableGlobs: true,
		files: exists1 ? filePath1 : filePath2,
		from: `function invalidRequest(req, res) {\n\tres.status(401);\n\tres.end('{"error":"unauthorized"}');\n}`,
		to: `function invalidRequest(req, res) {\n\tconst message = req.requestUtils?.t?.('unauthorized') || 'unauthorized';\n\tres.status(401);\n\tres.end('{"error":"' + message + '"}');\n}`
	})
}

const patchParseMiddlewares_2 = async () => {
	const filePath1 = path.resolve(
		import.meta.dirname,
		'../node_modules/parse-server/lib/middlewares.js',
	);
	const filePath2 = path.resolve(
		import.meta.dirname,
		'../../../node_modules/parse-server/lib/middlewares.js',
	);

	const exists1 = fs.existsSync(filePath1);

	await replace({
		disableGlobs: true,
		files: exists1 ? filePath1 : filePath2,
		from: "error: 'Invalid object for context.'",
		to: "error: req.requestUtils?.t?.('Invalid object for context.') || 'Invalid object for context.'"
	})
}

await Promise.all([
	// patchParseServerBlockListForBunRuntime()
	patchParseServerSelectNestedObjectKeys(),
	patchParseServerAuthLib(),
	patchClassNameRegex(),
	patchParseMiddlewares_1(),
	patchParseMiddlewares_2(),
])
