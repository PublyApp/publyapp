module.exports = {
	extends: [
		'airbnb',
		'airbnb/hooks',
		'airbnb-typescript',
		'plugin:react/jsx-runtime',
		'plugin:@next/next/recommended',
		'custom-base',
	],
	rules: {
		'@next/next/no-html-link-for-pages': 'off',

		// override for react
		'react/function-component-definition': [
			'warn',
			{
				namedComponents: 'arrow-function',
				unnamedComponents: 'arrow-function',
			},
		],
	},
	parserOptions: {
		babelOptions: {
			presets: [require.resolve('next/babel')],
		},
	},
};
