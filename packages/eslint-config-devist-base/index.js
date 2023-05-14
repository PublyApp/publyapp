module.exports = {
	extends: [
		'turbo',
		'eslint:recommended',
		'plugin:prettier/recommended',
		'plugin:@typescript-eslint/recommended',
		'prettier',
	],
	parser: '@typescript-eslint/parser',
	rules: {
		'no-undef': 'off',
		'prettier/prettier': 'warn',
		quotes: ['warn', 'single'],
		'comma-dangle': ['warn', 'always-multiline'],
		semi: 'warn',
		'eol-last': 'warn',
		'object-curly-spacing': ['warn', 'always'],
		'no-unused-vars': 'warn',
		'@typescript-eslint/no-explicit-any': 'warn',
		'padding-line-between-statements': [
			'warn',
			{ blankLine: 'always', prev: '*', next: 'block' },
			{ blankLine: 'always', prev: 'block', next: '*' },
			{ blankLine: 'always', prev: '*', next: 'block-like' },
			{ blankLine: 'always', prev: 'block-like', next: '*' },
		],
	},
};
