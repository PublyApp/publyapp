import { data } from 'react-router';

import { APP_NAME } from '@org/shared-ts/lib/constants';

import { getGeneratedHomepageById } from '#app/generated/homepage-gen/registry.ts';
import { getServerLoader } from '#app/lib/react-router/server-data.server.ts';

import type { Route } from './+types/generated-homepage-page';

const getPageTitle = (title: string) => {
	return `${title} | Homepage Gen | ${APP_NAME}`;
};

export const meta = (args: Route.MetaArgs) => {
	return args.loaderData?.meta ?? [];
};

export const loader = getServerLoader({
	loader: async ({ params, z }) => {
		const generatedHomepage = getGeneratedHomepageById(
			params.generatedHomepageId,
		);

		if (generatedHomepage === null) {
			throw data(
				{
					title: z.t('page-not-found'),
					description:
						'The generated homepage you requested does not exist yet.',
				},
				{ status: 404 },
			);
		}

		return data({
			generatedHomepage: generatedHomepage.entry,
			meta: [{ title: getPageTitle(generatedHomepage.entry.title) }],
		});
	},
});

const GeneratedHomepagePage = ({ loaderData }: Route.ComponentProps) => {
	const generatedHomepage = getGeneratedHomepageById(
		loaderData.generatedHomepage.id,
	);

	if (generatedHomepage === null) {
		return null;
	}

	const GeneratedHomepage = generatedHomepage.Component;

	return <GeneratedHomepage />;
};

export default GeneratedHomepagePage;
