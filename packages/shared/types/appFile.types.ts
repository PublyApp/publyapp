import type { BaseAttributes } from 'parse';

export const formatTypes = ['thumbnail', 'small', 'large', 'medium'] as const;

export type FormatType = (typeof formatTypes)[number];

export type AppFile = BaseAttributes &
	FormatData & {
		provider: string; // only local for now
		type: string; // mime type
		alternativeText?: string;
		caption?: string;
		formats?: Record<FormatType, FormatData>; // this one is form image types only
	};

export type FormatData = {
	name: string;
	url: string;
	width?: number;
	height?: number;
	size: number;
};
