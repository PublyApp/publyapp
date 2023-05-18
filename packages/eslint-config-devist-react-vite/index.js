module.exports = {
	env: { browser: true, es2020: true },
	extends: ['react-app', 'devist-base'],
	parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
	plugins: ['react-refresh'],
	rules: {
		'react-refresh/only-export-components': 'warn',
	},
};
