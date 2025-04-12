/* eslint-disable global-require */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable prefer-arrow/prefer-arrow-functions */
/* eslint-disable func-style */

// @ts-check

const path = require("path");
const fs = require("fs");
const { pipeline, Readable } = require("stream");
const { promisify } = require("util");
const { createWriteStream } = require("fs");

const { createRsbuild: _createRsbuild } = require("@rsbuild/core");
const { pluginTypeCheck } = require("@rsbuild/plugin-type-check");

const MONOREPO_ROOT_DIR = path.resolve(__dirname, "../../../../");

const APPS_DIR = path.join(MONOREPO_ROOT_DIR, "apps");
const PACKAGES_DIR = path.join(MONOREPO_ROOT_DIR, "packages");
const PACKAGE_FILE = "package.json";

module.exports.MONOREPO_ROOT_DIR = MONOREPO_ROOT_DIR;
module.exports.APPS_DIR = APPS_DIR;
module.exports.PACKAGES_DIR = PACKAGES_DIR;

/**
 * list directories of provided folder path
 * @param {string} pth
 * @returns {string[]}
 */
const listDirectories = (pth) => {
	const directories = fs
		.readdirSync(pth, { withFileTypes: true })
		.filter((dirent) => {
			return dirent.isDirectory();
		})
		.map((dir) => {
			return path.join(pth, dir.name);
		});

	return directories;
};

exports.listDirectories = listDirectories;

const findExternals = () => {
	// read all apps package.json
	const appDirs = listDirectories(APPS_DIR);
	const packagesDirs = listDirectories(PACKAGES_DIR);

	/** @type {Set<string>} */
	const externalsSet = new Set();

	[...appDirs, ...packagesDirs].forEach((dirName) => {
		const filePath = path.join(dirName, PACKAGE_FILE);

		if (!fs.existsSync(filePath)) return;

		const packageFile = JSON.parse(
			fs.readFileSync(filePath, { encoding: "utf-8" }),
		);

		if (packageFile.dependencies) {
			Object.entries(packageFile.dependencies).forEach(([key, value]) => {
				if (value === "workspace:*") return;
				externalsSet.add(key);
			});
		}

		if (packageFile.devDependencies) {
			Object.entries(packageFile.devDependencies).forEach(([key, value]) => {
				if (value === "workspace:*") return;
				externalsSet.add(key);
			});
		}
	});

	return [...externalsSet];
};

exports.findExternals = findExternals;

const externals = [
	...findExternals(),
	"parse-server/lib/index.js",

	"parse/node",
	"parse/node.js",

	"parse-server/lib/Auth",
	"parse-server/lib/Auth.js",

	"parse-server/lib/Config.js",
	"parse-server/lib/Config",

	"parse-server/lib/RestWrite",
	"parse-server/lib/RestWrite.js",

	"parse-server/lib/Routers/UsersRouter",
	"parse-server/lib/Routers/UsersRouter.js",

	"parse-server/lib/Adapters/Storage/Mongo/MongoSchemaCollection",
	"parse-server/lib/Adapters/Storage/Mongo/MongoSchemaCollection.js",

	"parse-server/lib/logger",
	"parse-server/lib/logger.js",

	"parse-server/lib/cryptoUtils",
	"parse-server/lib/cryptoUtils.js",

	"parse-server/lib/password",
	"parse-server/lib/password.js",

	"parse-server/lib/defaults",
	"parse-server/lib/defaults.js",

	"front/build/server/index.js",
];

exports.externals = externals;

const createRsbuild = () => {
	return _createRsbuild({
		rsbuildConfig: {
			plugins: [pluginTypeCheck()],
			source: {
				entry: {
					index: "./src/index.ts",
					i18n: "./src/_i18n.ts",
					seed: "./src/_seed.ts",
					migrations: "./src/_migrations.ts",
				},
				define: {
					// even during development, set NODE_ENV to production
					// so that we can have production-like behavior
					// (e.g. the app will not crash on missing env variables + better performance)
					// To differentiate between development and production, use process.env.MODE instead of process.env.NODE_ENV
					// (MODE is set by the user in the .env.local file or at node command line launch)
					"process.env.NODE_ENV": JSON.stringify("production"),
				},
			},
			output: {
				target: "node",
				externals,
			},
			tools: {
				rspack: {
					output: {
						libraryTarget: "module",
						module: true,
						chunkFormat: "module",
						filename: "[name].mjs",
					},
				},
			},
		},
	});
};

exports.createRsbuild = createRsbuild;

/**
 *
 * @param {import('@rsbuild/core').RsbuildInstance} rsbuild
 */
const watch = (rsbuild) => {
	rsbuild.build({
		watch: true,
	});
};

exports.watch = watch;

/**
 *
 * @param {import('@rsbuild/core').RsbuildInstance} rsbuild
 */
const build = (rsbuild) => {
	rsbuild.build();
};

exports.build = build;

const createI18nResourcesFiles = async (resources) => {
	console.log(
		"\x1b[32m%s\x1b[0m",
		"====> started creating i18n resources files",
	);
	const pipelineAsync = promisify(pipeline);
	await Promise.all(
		Object.entries(resources).map(async ([lang, namespaces]) => {
			await Promise.all(
				Object.entries(namespaces).map(async ([namespace, data]) => {
					const filePath = path.join(
						__dirname,
						`../../dist/resources/${lang}.${namespace}.json`,
					);
					const dir = path.dirname(filePath);

					if (!fs.existsSync(dir)) {
						fs.mkdirSync(dir, { recursive: true });
					}

					const writeStream = createWriteStream(filePath);
					await pipelineAsync(
						Readable.from([JSON.stringify(data, null, 2)]),
						writeStream,
					);
				}),
			);
		}),
	);
	console.log(
		"\x1b[32m%s\x1b[0m",
		"====> finished creating i18n resources files",
	);
};

exports.createI18nResourcesFiles = createI18nResourcesFiles;
