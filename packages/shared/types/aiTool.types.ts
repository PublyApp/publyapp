import { BaseAttributes } from 'parse';

// import { BaseDocument } from './mongoDB.types';

export const pricingType = {
	FREE: 'free',
	FREEMIUM: 'freemium',
	PAID: 'paid',
} as const;

export const pricingTypes = Object.values(pricingType);

export const pricingModel = {
	PAY_PER_USE: 'pay-per-use',
	SUBSCRIPTION: 'subscription',
	FREE: 'free',
} as const;

export const pricingModels = Object.values(pricingModel);

export type PricingType = (typeof pricingType)[keyof typeof pricingType];
export type PricingModel = (typeof pricingModel)[keyof typeof pricingModel];

export type AITool = {
	name: string;
	description: string;
	tags: string[];
	pricingType: PricingType;
	pricingModel: PricingModel;
} & BaseAttributes;
