module.exports = {
	extends: ['devist-base', 'next'],
	rules: {
		'@next/next/no-html-link-for-pages': 'off',
	},
	parserOptions: {
		babelOptions: {
			presets: [require.resolve('next/babel')],
		},
	},
};
