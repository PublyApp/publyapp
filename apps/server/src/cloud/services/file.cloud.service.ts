// /* eslint-disable no-underscore-dangle */
// import type { NewAttributes } from 'parse';

// import sizeOf from 'image-size';
// import sharp from 'sharp';
// import z from 'zod';

// import type { AppFile, FormatData } from '@shared/types/appFile.types';
// import { className } from '@shared/utils/constants';

// // import { USE_MASTER_KEY } from "@server/utils/constants";

// type FileCloudServiceProps = {
// 	base64: string;
// 	fileName: string;
// 	fileType: string;
// 	sessionToken: string;
// };

// const metaDataSchema = z.object({
// 	width: z.number().optional(),
// 	height: z.number().optional(),
// 	size: z.number(),
// });

// type IMetaData = z.infer<typeof metaDataSchema>;

// export default class FileCloudService {
// 	readonly fileName!: string;

// 	readonly fileType!: string;

// 	readonly base64!: string;

// 	readonly sessionToken!: string;

// 	private _original?: Parse.File;

// 	public get original() {
// 		return this._original;
// 	}

// 	private _thumbnail?: Parse.File;

// 	public get thumbnail() {
// 		return this._thumbnail;
// 	}

// 	readonly base64PrefixRegex = /^data:image\/\w+;base64,/;

// 	private sharpBase64!: string; /*  = this.base64.replace(this.base64PrefixRegex, ''); */

// 	private sharpBuffer!: Buffer; // = Buffer.from(this.sharpBase64, 'base64');

// 	constructor(props: FileCloudServiceProps) {
// 		this.sessionToken = props.sessionToken;

// 		this.fileName = props.fileName;
// 		this.fileType = props.fileType;
// 		this.base64 = this.getFullBase64(props.base64);

// 		this.sharpBase64 = this.base64.replace(this.base64PrefixRegex, '');
// 		this.sharpBuffer = Buffer.from(this.sharpBase64, 'base64');
// 	}

// 	static addSuffixToFileName(fileName: string, suffix: string) {
// 		// Use a regex to match the last dot in the file name
// 		const regex = /(\.[^.]+)$/;

// 		// Replace the last dot with the suffix and the dot
// 		return fileName.replace(regex, `-${suffix}$1`);
// 	}

// 	async saveOriginal() {
// 		const original = new Parse.File(
// 			FileCloudService.addSuffixToFileName(this.fileName, 'original'),
// 			{ base64: this.base64 },
// 			this.fileType,
// 		);

// 		const { height, width } = sizeOf(this.sharpBuffer);
// 		const size = this.sharpBuffer.byteLength;

// 		const metaData: IMetaData = {
// 			height,
// 			width,
// 			// height: 444,
// 			// width: 444,
// 			size,
// 		};
// 		original.setMetadata(metaData);

// 		this._original = await original.save({ sessionToken: this.sessionToken });
// 	}

// 	private getFullBase64(base64: string) {
// 		// if (base64.startsWith(...))
// 		if (base64.match(this.base64PrefixRegex)) {
// 			return base64;
// 		}

// 		return `data:${this.fileType};base64,'${base64}`;
// 	}

// 	async saveThumbnail() {
// 		const buffer = await sharp(this.sharpBuffer).resize(100, 100).toBuffer();
// 		const base64 = buffer.toString('base64');

// 		const thumbnail = new Parse.File(
// 			FileCloudService.addSuffixToFileName(this.fileName, 'thumbnail'),
// 			{ base64: this.getFullBase64(base64) },
// 			this.fileType,
// 		);

// 		const { height, width } = sizeOf(buffer);
// 		const size = buffer.byteLength;

// 		const metaData: IMetaData = {
// 			height,
// 			width,
// 			// height: 444,
// 			// width: 444,
// 			size,
// 		};
// 		thumbnail.setMetadata(metaData);

// 		this._thumbnail = await thumbnail.save({ sessionToken: this.sessionToken });
// 		// this._thumbnail.addMetadata('size')
// 	}

// 	private static getFormatData(file: Parse.File): FormatData {
// 		const dimensions = metaDataSchema.parse(file.metadata());
// 		return {
// 			...dimensions,
// 			url: file.url(),
// 			name: file.name(),
// 		};
// 	}

// 	async save({ useMasterKey }: { useMasterKey: boolean } = { useMasterKey: false }) {
// 		await Promise.all([this.saveOriginal(), this.saveThumbnail()]);

// 		if (!this._original || !this._thumbnail) {
// 			throw new Error('[FileCloudService.save]: one ore more formats are missing before saving');
// 		}

// 		const appFileAttributes: NewAttributes<AppFile> = {
// 			...FileCloudService.getFormatData(this._original),
// 			provider: 'local', // ! only local file system for now
// 			type: this.fileType,
// 			formats: {
// 				thumbnail: FileCloudService.getFormatData(this._original),
// 				small: FileCloudService.getFormatData(this._original),
// 				medium: FileCloudService.getFormatData(this._original),
// 				large: FileCloudService.getFormatData(this._original),
// 			},
// 		};

// 		const appFile = new Parse.Object(className.APP_FILE, appFileAttributes);

// 		return appFile.save(null, { useMasterKey });
// 	}
// }
