import type { Config } from '@react-router/dev/config';

export default {
	// override the default app directory
	appDirectory: 'src',

	// Server-side render by default, to enable SPA mode set this to `false`
	ssr: true,

	// specific paths
	prerender: ['/', '/login'],
} satisfies Config;
