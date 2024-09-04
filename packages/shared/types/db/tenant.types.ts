import type { BaseAttributes } from 'parse';

export type TenantAttributes = {
	name: string;
};

export type ITenant = BaseAttributes & TenantAttributes;

export type ITenantWithRelations = ITenant /* & {} */;

export type ITenantWithParseRelations = ITenant /* & {} */;
