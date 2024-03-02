import { type BaseAttributes } from 'parse';

export type IPostSeries = BaseAttributes & {
	translation: Record<string, string>;
	published: boolean;
};
