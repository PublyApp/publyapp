import type { Config } from '@react-router/dev/config';

import { PRE_RENDER_PATHS } from '@org/shared/lib/constants';

export default {
	// override the default app directory
	appDirectory: 'src',

	// Server-side render by default, to enable SPA mode set this to `false`
	ssr: true,

	// specific paths
	prerender: PRE_RENDER_PATHS as unknown as string[],
} satisfies Config;
