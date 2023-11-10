import type { BaseAttributes } from 'parse';

export const imageFormatTypes = ['thumbnail', 'small', 'medium', 'large'] as const;

export type ImageFormatType = (typeof imageFormatTypes)[number];

export type AppFile = BaseAttributes &
	// BaseFileFields &
	// ImageOnlyFields
	BaseFileFields &
	ImageOnlyFields & {
		provider: string; // only local for now
		mimeType: string; // mime type
		alternativeText?: string;
		caption?: string;
		formats?: Record<ImageFormatType, ImageFormatData>; // this one is form image types only
	};

export type BaseFileFields = {
	path: string;
	name: string;
	url: string;
	size: number;
};

export type ImageOnlyFields = {
	// only for image types
	width?: number;
	height?: number;
};

export type ImageFormatData = Omit<BaseFileFields, 'path'> & ImageOnlyFields;

export type AppFileWithPointers = AppFile & {
	folder: string | Parse.Object; // or object
};
