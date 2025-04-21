// @ts-check

import path from 'node:path';

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
export const pluginMeta = (_options) /* : RsbuildPlugin */ => {
	return {
		name: 'plugin-meta',
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

// module.exports = pluginMeta;
