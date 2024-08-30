module.exports = {
	extends: [
		'airbnb',
		'airbnb/hooks',
		'airbnb-typescript',
		'plugin:react/jsx-runtime',
		'plugin:@next/next/recommended',
		'custom-common-react',
		'custom-base',
	],
	rules: {
		'@next/next/no-html-link-for-pages': 'off',
		'import/no-unresolved': 'off',
	},
	parserOptions: {
		babelOptions: {
			presets: [require.resolve('next/babel')],
		},
	},
};
