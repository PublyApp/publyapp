// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

module.exports = {
	extends: [
		'eslint:recommended',
		'plugin:prettier/recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:deprecation/recommended',
		'plugin:import/recommended',
		'airbnb-base',
		'airbnb-typescript/base',
		'turbo',
		'prettier',
	],
	plugins: ['prefer-arrow'],
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
		quotes: ['warn', 'single', { avoidEscape: true }],
		'quote-props': ['warn', 'as-needed'],
		'comma-dangle': ['warn', 'always-multiline'],
		semi: 'warn',
		'eol-last': 'warn',
		'object-curly-spacing': ['warn', 'always'],
		'no-underscore-dangle': 'off',

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
		'@typescript-eslint/no-unused-vars': [
			'error', // "error" or "warn"
			{
				argsIgnorePattern: '^_',
				varsIgnorePattern: '^_',
				caughtErrorsIgnorePattern: '^_',
			},
		],
		'@typescript-eslint/consistent-type-imports': 'error',
		'@typescript-eslint/consistent-type-exports': 'error',
		'@typescript-eslint/no-explicit-any': 'warn',
		'@typescript-eslint/no-throw-literal': 'off',
		// '@typescript-eslint/no-explicit-any': 'off',

		// eslint-plugin-prettier overrides
		'prettier/prettier': 'warn',

		// airbnb-base override
		'arrow-body-style': ['warn', 'always'],
		'no-console': 'off',
		'no-restricted-syntax': 'off',

		// eslint-plugin-import overrides
		'import/order': [
			'warn',
			{
				'newlines-between': 'always',
				pathGroupsExcludedImportTypes: ['react', 'parse', 'parse-server'],
				pathGroups: [
					{
						pattern: '{lodash,react,parse,parse/*,parse-server,parse-server/*,parse-server/**/*}',
						group: 'builtin',
						position: 'after',
					},
					{
						pattern: '@org/**',
						group: 'external',
						position: 'after',
					},
					{
						pattern: '@/{shared,ui-react,front,server}/**',
						group: 'external',
						position: 'after',
					},
				],
				distinctGroup: true,
			},
		],
		'import/prefer-default-export': 'off',

		// eslint-config-airbnb-typescript overrides
		'import/no-unresolved': 'off',

		// enforce arrow functions
		'prefer-arrow/prefer-arrow-functions': [
			'error',
			{
				disallowPrototype: true,
				singleReturnOnly: false,
				classPropertiesAllowed: false,
			},
		],
		'prefer-arrow-callback': ['error', { allowNamedFunctions: true }],
		'func-style': ['error', 'expression'],
	},
};
