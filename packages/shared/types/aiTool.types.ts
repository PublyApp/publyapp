import type { BaseAttributes } from 'parse';

export const PRICING_TYPES = ['free', 'freemium', 'paid'] as const;

export const pricingType = {
	FREE: PRICING_TYPES[0],
	FREEMIUM: PRICING_TYPES[1],
	PAID: PRICING_TYPES[2],
} as const;

export const PRICING_MODELS = ['pay-per-use', 'subscription', 'free'] as const;

export const pricingModel = {
	PAY_PER_USE: PRICING_MODELS[0],
	SUBSCRIPTION: PRICING_MODELS[1],
	FREE: PRICING_MODELS[2],
} as const;

export type PricingType = (typeof pricingType)[keyof typeof pricingType];
export type PricingModel = (typeof pricingModel)[keyof typeof pricingModel];

export type AITool = {
	name: string;
	description: string;
	tags: string[];
	pricingType: PricingType;
	pricingModel: PricingModel;
	image: string;
} & BaseAttributes;
