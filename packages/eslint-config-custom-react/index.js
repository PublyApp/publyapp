module.exports = {
	env: { browser: true, es2020: true },
	extends: [
		'airbnb',
		'airbnb/hooks',
		'airbnb-typescript',
		'plugin:react/jsx-runtime',
		'custom-common-react',
		'custom-base',
	],
	parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
	plugins: ['react-refresh'],
	rules: {
		// 'react-refresh/only-export-components': 'warn',
		'react-refresh/only-export-components': 'off',
	},
};
