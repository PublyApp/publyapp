import type { BaseAttributes } from 'parse';

export const imageFormatTypes = ['thumbnail', 'small', 'medium', 'large'] as const;

export type ImageFormatType = (typeof imageFormatTypes)[number];

export type AppFile = BaseAttributes &
	// BaseFileFields &
	// ImageOnlyFields
	BaseFileFields &
	ImageOnlyFields & {
		displayName: string;
		provider: string;
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	meta?: Record<string, any>;
};

export type ImageOnlyFields = {
	// only for image types
	width?: number;
	height?: number;
};

export type ImageFormatData = Omit<BaseFileFields, 'path'> & ImageOnlyFields;

export type AppFileWithRelations = AppFile & {
	folder: string /* | Parse.Object; // or object */; // TODO: verify iif it really give a string
};

export type AppFileWithParseRelations = AppFile & {
	folder: Parse.Object; // or object
};
