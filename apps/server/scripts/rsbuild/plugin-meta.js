/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('node:path');

// @ts-check

/**
 * @typedef {Record<string, any> | undefined} PluginMetaOptions
 * @typedef {import('@rsbuild/core').RsbuildPlugin} RsbuildPlugin
 */

/**
 * converts `import.meta.filename` and `import.meta.dirname` into the resource path string
 * @example
 * console.log(import.meta.env)
 * // becomes
 * console.log('/path/of/original/file')
 * @param _options {PluginMetaOptions}
 * @returns {RsbuildPlugin}
 */
const pluginMeta = (_options) /* : RsbuildPlugin */ => {
	return {
		name: 'plugin-meta',
		// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
		setup(api) {
			api.transform(
				{ test: /\.(ts|tsx|js|jsx)$/ },
				({ code, resourcePath }) => {
					const posixPath = resourcePath.replace(/\\/g, '/');

					const newCode = code
						.replace(/import.meta.filename/g, `'${posixPath}'`)
						.replace(/import.meta.dirname/g, `'${path.dirname(posixPath)}'`);

					return newCode;
				},
			);
		},
	};
};

module.exports = pluginMeta;
