import { Faker } from '@faker-js/faker';

import { PRICING_MODELS, PRICING_TYPES } from '@devist/shared/types/aiTool.types';
import { className } from '@devist/shared/utils/constants';

export const aiToolFactory = async (faker: Faker) => {
	const aiTool = new Parse.Object(className.AI_TOOL);

	aiTool.set('name', faker.company.buzzNoun());
	aiTool.set('description', faker.company.buzzPhrase());
	aiTool.set('tags', faker.lorem.words({ min: 3, max: 7 }).split(' '));
	aiTool.set('pricingType', faker.helpers.arrayElement(PRICING_TYPES));
	aiTool.set('pricingModel', faker.helpers.arrayElement(PRICING_MODELS));
	aiTool.set('image', faker.image.url());

	return aiTool;
};
