module.exports = {
	env: { browser: true, es2020: true },
	extends: ['plugin:react/jsx-runtime'],
	parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
	rules: {
		// overrides for react
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
		'react/no-unescaped-entities': 'off',
		'react/no-unknown-property': ['error', { ignore: ['css'] }],
	},
	settings: {
		react: {
			version: 'detect',
		},
	},
};
