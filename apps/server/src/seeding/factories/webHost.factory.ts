import type { Faker } from '@faker-js/faker';

import { ParseWebHost } from '@shared/lib/parse/classes/webHost.class';

// import { className } from '@shared/utils/constants';

export const webHostFactory = async (faker: Faker) => {
	const webHost = new ParseWebHost({
		translations: {
			en: {
				name: faker.company.buzzNoun(),
				description: faker.company.buzzPhrase(),
			},
		},
	});

	return new Parse.Object(webHost.className, webHost.attributes);
};
