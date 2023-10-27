import type { BaseAttributes } from 'parse';

export const imageFormatTypes = ['thumbnail', 'small', 'medium', 'large'] as const;

export type ImageFormatType = (typeof imageFormatTypes)[number];

export type AppFile = BaseAttributes &
	FormatData & {
		provider: string; // only local for now
		mimeType: string; // mime type
		alternativeText?: string;
		caption?: string;
		formats?: Record<ImageFormatType, FormatData>; // this one is form image types only
	};

export type FormatData = {
	name: string;
	url: string;
	size: number;
	// only for image types
	width?: number;
	height?: number;
};
