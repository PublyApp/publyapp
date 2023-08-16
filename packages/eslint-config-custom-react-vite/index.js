module.exports = {
	env: { browser: true, es2020: true },
	extends: ['airbnb', 'airbnb/hooks', 'airbnb-typescript', 'plugin:react/jsx-runtime', 'custom-base'],
	parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
	plugins: ['react-refresh'],
	rules: {
		'react-refresh/only-export-components': 'warn',

		// override for react
		'react/function-component-definition': [
			'warn',
			{
				namedComponents: 'arrow-function',
				unnamedComponents: 'arrow-function',
			},
		],
		'react/jsx-closing-bracket-location': 'warn',
		'react/jsx-props-no-spreading': 'off',
		'react/require-default-props': 'off',
		'react/prop-types': 'off',
	},
};
