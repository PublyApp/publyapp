import { Faker } from '@faker-js/faker';

import { pricingTypes, pricingModels } from '@aktiveo/shared/types/aiTool.types';
import { classNames } from '@aktiveo/shared/utils/constants';

export const aiToolFactory = async (faker: Faker) => {
	const aiTool = new Parse.Object(classNames.AI_TOOL);

	aiTool.set('name', faker.company.buzzNoun());
	aiTool.set('description', faker.company.buzzPhrase());
	aiTool.set('tags', faker.lorem.words({ min: 3, max: 7 }).split(' '));
	aiTool.set('pricingType', faker.helpers.arrayElement(pricingTypes));
	aiTool.set('pricingModel', faker.helpers.arrayElement(pricingModels));

	return aiTool;
};
