// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

module.exports = {
	extends: [
		'eslint:recommended',
		'plugin:prettier/recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:import/recommended',
		'airbnb-base',
		'airbnb-typescript/base',
		'turbo',
		'prettier',
	],
	parser: '@typescript-eslint/parser',
	parserOptions: {
		tsconfigRootDir: path.resolve(__dirname, '../../'),
		project: [
			'./tsconfig.eslint.json',
			'./tsconfig.paths.json',
			'./apps/*/tsconfig.json',
			'./packages/*/tsconfig.json',
			'./apps/*/tsconfig.node.json', // for vite projects
		],
	},
	settings: {
		'import/resolver': {
			typescript: {
				project: [
					'./tsconfig.eslint.json',
					'./tsconfig.paths.json',
					'apps/*/tsconfig.json',
					'packages/*/tsconfig.json',
					'./apps/*/tsconfig.node.json', // for vite projects
				],
			},
		},
	},
	rules: {
		'no-undef': 'off',
		quotes: ['warn', 'single'],
		'quote-props': ['warn', 'as-needed'],
		'comma-dangle': ['warn', 'always-multiline'],
		semi: 'warn',
		'eol-last': 'warn',
		'object-curly-spacing': ['warn', 'always'],

		'padding-line-between-statements': [
			'warn',
			{ blankLine: 'always', prev: '*', next: 'block' },
			{ blankLine: 'always', prev: 'block', next: '*' },
			{ blankLine: 'always', prev: '*', next: 'block-like' },
			{ blankLine: 'always', prev: 'block-like', next: '*' },
		],
		'prefer-template': 'warn',

		// @typescript-eslint overrides
		'no-unused-vars': 'off',
		// '@typescript-eslint/no-explicit-any': 'warn',
		'@typescript-eslint/no-explicit-any': 'off',

		// eslint-plugin-prettier overrides
		'prettier/prettier': 'warn',

		// airbnb-base override
		'arrow-body-style': ['warn', 'always'],
		'no-console': 'off',

		// eslint-plugin-import overrides
		'import/order': [
			'warn',
			{
				'newlines-between': 'always',
				pathGroupsExcludedImportTypes: ['react', 'parse', 'parse-server'],
				pathGroups: [
					{
						pattern: '{react,parse,parse/*,parse-server,parse-server/*}',
						group: 'builtin',
						position: 'after',
					},
					{
						pattern: '@devist/**',
						group: 'external',
						position: 'after',
					},
					{
						pattern: '@{shared,ui-react,front,server,office}/**',
						group: 'external',
						position: 'after',
					},
					// {
					// 	pattern: 'react',
					// 	group: 'builtin',
					// 	position: 'before',
					// },
				],
				distinctGroup: true,
			},
		],
		'import/prefer-default-export': 'off',

		// eslint-config-airbnb-typescript overrides
		'import/no-unresolved': 'error',
	},
};
