import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { reactRouter } from '@react-router/dev/vite';
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { reactRouterDevTools } from 'react-router-devtools';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import devtoolsJson from 'vite-plugin-devtools-json';

import copyI18nFiles from './_vite/copy-i18n-files';
import generateClient from './_vite/generate-client';

const frontSrcDir = fileURLToPath(new URL('./src', import.meta.url));
const frontRootDir = fileURLToPath(new URL('.', import.meta.url));
const workspaceRootDir = fileURLToPath(new URL('../..', import.meta.url));

const optimizeDepsIncludes = [
	'lodash',
	'lodash/capitalize',
	'lodash/first',
	'lodash/forEach',
	'lodash/get',
	'lodash/isArray',
	'lodash/isEqual',
	'lodash/isNil',
	'lodash/map',
	'lodash/merge',
	'lodash/mergeWith',
	'lodash/set',
	'lodash/some',
	'lodash/toLower',
	'lodash/toNumber',
	'lodash/toString',
	'lodash/trim',
	'lodash/uniqBy',
	'lodash/values',
	'nprogress',
	'cookie',
	'isbot',
	'serialize-error',
	'nanoid',
	'@org/shared-ts > ms',
	// === React app/runtime ===
	'@emotion/cache',
	'@emotion/react',
	'@hookform/resolvers/zod',
	'@iconify/react',
	'@tanstack/react-query',
	'framer-motion',
	'minimal-shared/hooks',
	'minimal-shared/utils',
	'nuqs',
	'nuqs/adapters/react-router/v7',
	'react-i18next',
	'react-dropzone',
	'react-hook-form',
	'react-phone-number-input',
	'react-phone-number-input/input',
	'react-query-kit',
	'remix-utils/client-only',
	'simplebar-react',
	'sonner',
	'stylis-plugin-rtl',
	'zod',
	'zustand',
	'zustand/middleware',
	'zustand/middleware/immer',
	'@org/shared-ts > zod-i18n-map',
	// === Kiota client runtime ===
	'@microsoft/kiota-abstractions',
	'@microsoft/kiota-http-fetchlibrary',
	'@org/client-ts > @microsoft/kiota-serialization-form',
	'@org/client-ts > @microsoft/kiota-serialization-json',
	'@org/client-ts > @microsoft/kiota-serialization-multipart',
	'@org/client-ts > @microsoft/kiota-serialization-text',
	// === MUI deep imports used by lazy route modules ===
	'@mui/icons-material',
	'@mui/material',
	'@mui/material/Accordion',
	'@mui/material/AccordionDetails',
	'@mui/material/AccordionSummary',
	'@mui/material/Alert',
	'@mui/material/AppBar',
	'@mui/material/Autocomplete',
	'@mui/material/Avatar',
	'@mui/material/AvatarGroup',
	'@mui/material/Backdrop',
	'@mui/material/Badge',
	'@mui/material/Box',
	'@mui/material/Breadcrumbs',
	'@mui/material/Button',
	'@mui/material/ButtonBase',
	'@mui/material/ButtonGroup',
	'@mui/material/Card',
	'@mui/material/CardContent',
	'@mui/material/CardHeader',
	'@mui/material/Checkbox',
	'@mui/material/Chip',
	'@mui/material/CircularProgress',
	'@mui/material/Collapse',
	'@mui/material/Container',
	'@mui/material/CssBaseline',
	'@mui/material/Dialog',
	'@mui/material/DialogActions',
	'@mui/material/DialogContent',
	'@mui/material/DialogTitle',
	'@mui/material/Divider',
	'@mui/material/Drawer',
	'@mui/material/Fab',
	'@mui/material/Fade',
	'@mui/material/FilledInput',
	'@mui/material/FormControl',
	'@mui/material/FormControlLabel',
	'@mui/material/FormGroup',
	'@mui/material/FormHelperText',
	'@mui/material/FormLabel',
	'@mui/material/GlobalStyles',
	'@mui/material/Grid',
	'@mui/material/IconButton',
	'@mui/material/InitColorSchemeScript',
	'@mui/material/InputAdornment',
	'@mui/material/InputBase',
	'@mui/material/InputLabel',
	'@mui/material/LinearProgress',
	'@mui/material/Link',
	'@mui/material/List',
	'@mui/material/ListItem',
	'@mui/material/ListItemButton',
	'@mui/material/ListItemText',
	'@mui/material/ListSubheader',
	'@mui/material/locale',
	'@mui/material/Menu',
	'@mui/material/MenuItem',
	'@mui/material/MenuList',
	'@mui/material/OutlinedInput',
	'@mui/material/PaginationItem',
	'@mui/material/Paper',
	'@mui/material/Popover',
	'@mui/material/Portal',
	'@mui/material/Radio',
	'@mui/material/RadioGroup',
	'@mui/material/Rating',
	'@mui/material/Select',
	'@mui/material/Skeleton',
	'@mui/material/Slider',
	'@mui/material/Stack',
	'@mui/material/StepConnector',
	'@mui/material/styles',
	'@mui/material/SvgIcon',
	'@mui/material/Switch',
	'@mui/material/Tab',
	'@mui/material/TableCell',
	'@mui/material/TableRow',
	'@mui/material/Tabs',
	'@mui/material/TextField',
	'@mui/material/ToggleButton',
	'@mui/material/Tooltip',
	'@mui/material/Typography',
	'@mui/material/useMediaQuery',
	'@mui/x-data-grid',
	'@mui/x-data-grid/locales',
	'@mui/x-date-pickers',
	'@mui/x-date-pickers/AdapterDayjs',
	'@mui/x-date-pickers/DatePicker',
	'@mui/x-date-pickers/internals',
	'@mui/x-date-pickers/locales',
	'@mui/x-date-pickers/LocalizationProvider',
	'@mui/x-date-pickers/MobileDateTimePicker',
	'@mui/x-date-pickers/PickersTextField',
	'@mui/x-tree-view',
	'material-react-table',
	'mui-one-time-password-input',
	// === Dates/i18n ===
	'dayjs',
	'dayjs/locale/en',
	'dayjs/locale/fr',
	'dayjs/plugin/duration',
	'dayjs/plugin/relativeTime',
	'i18next',
	'i18next-browser-languagedetector',
	'i18next-fetch-backend',
	'i18next-fs-backend',
	'remix-i18next/client',
	'remix-i18next/react',
	'remix-i18next/server',
	// === Rich text / logging ===
	'@tiptap/core',
	'@tiptap/extension-code-block',
	'@tiptap/extension-code-block-lowlight',
	'@tiptap/extension-image',
	'@tiptap/extension-link',
	'@tiptap/extension-placeholder',
	'@tiptap/extension-text-align',
	'@tiptap/extension-underline',
	'@tiptap/pm/state',
	'@tiptap/pm/view',
	'@tiptap/react',
	'@tiptap/starter-kit',
	'lowlight',
	'@org/shared-ts > winston',
	'@org/shared-ts > winston-console-format',
];

export default defineConfig(({ mode, isSsrBuild }) => {
	const envFileName = `.env.${mode}`;
	const envConfig = dotenv.config({
		path: path.resolve(process.cwd(), '../../', envFileName),
		override: true,
	});
	dotenvExpand.expand(envConfig);

	return {
		plugins: [
			copyI18nFiles(),
			generateClient(),
			devtoolsJson(),
			checker({
				enableBuild: false,
				root: workspaceRootDir,
				typescript: {
					root: frontRootDir,
					tsconfigPath: 'tsconfig.json',
				},
				oxlint: {
					lintCommand: 'oxlint --quiet',
					watchPath: [
						'.oxlintrc.json',
						'apps/front',
						'packages/shared-ts',
						'scripts',
					],
				},
			}),
			reactRouterDevTools({
				tanstackViteConfig: {
					injectSource: {
						enabled: true,
						ignore: {
							components: ['PortalWrapper'],
						},
					},
				},
			}),
			reactRouter(),
		],
		resolve: {
			alias: {
				'#app': frontSrcDir,
			},
		},
		server: {
			port: 5050,
			watch: {
				ignored: ['**/packages/shared-ts/lib/i18n/json/**'],
			},
		},
		build: {
			target: 'es2022',
			rollupOptions: isSsrBuild ? { input: './server/app.ts' } : undefined,
		},
		optimizeDeps: {
			include: optimizeDepsIncludes,
		},
		ssr: {
			noExternal:
				// process.env.NODE_ENV === 'production'
				mode === 'production'
					? [
							'@mui/system',
							'@mui/material',
							'@mui/utils',
							'@mui/icons-material',
							'@mui/styled-engine',
							// ====
							'@mui/x-date-pickers',
							'@mui/x-data-grid',
							'@mui/x-tree-view',
							'@mui/x-internals',
							// ====
							'mui-one-time-password-input',
							'@tiptap/extension-code-block-lowlight',
						]
					: [
							'mui-one-time-password-input',
							'@tiptap/extension-code-block-lowlight',
						],
		},
	};
});
