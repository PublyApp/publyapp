/** @type {import('@remix-run/dev').AppConfig} */
module.exports = {
	ignoredRouteFiles: ['**/.*'],
	appDirectory: 'app',
	browserBuildDirectory: 'public/build',
	publicPath: '/build/',
	// serverBuildDirectory: 'build',
	devServerPort: 8002,
	// TODO: when mui has esm support, remove this (default is esm)
	// check it https://github.com/mui/material-ui/issues/30671
	serverModuleFormat: 'cjs',

	// !==
	// serverBuildPath: 'build/index.mjs',
	serverBuildPath: 'build/index.js',
	serverDependenciesToBundle: [/^@devist\/.*/],
};
