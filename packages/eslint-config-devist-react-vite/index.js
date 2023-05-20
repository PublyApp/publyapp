module.exports = {
	env: { browser: true, es2020: true },
	extends: ['airbnb', 'airbnb-typescript', 'plugin:react/jsx-runtime', 'devist-base'],
	parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
	plugins: ['react-refresh'],
	rules: {
		'react-refresh/only-export-components': 'warn',
	},
};
