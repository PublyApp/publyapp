import { index, layout, route } from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { getLastPath } from '@org/shared-ts/utils/string.utils';

// Marketing routes
export const marketingRoutes = [
	layout('routes/marketing/_layout/marketing-layout.tsx', [
		index('routes/marketing/home/home-page.tsx'),
		route(
			getLastPath(
				FRONT_PATH_NAMES.generatedHomepages.details(':generatedHomepageId'),
				2,
			),
			'routes/marketing/homepage-gen/generated-homepage-page.tsx',
		),
	]),
];
