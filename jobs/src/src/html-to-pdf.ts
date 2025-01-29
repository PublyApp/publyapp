/* eslint-disable no-await-in-loop */
/* eslint-disable prefer-arrow/prefer-arrow-functions */
/* eslint-disable func-style */
import { Storage } from '@google-cloud/storage';
import _ from 'lodash';
import { MongoClient } from 'mongodb';
import { nanoid } from 'nanoid';
import { chromium } from 'playwright';
import { z } from 'zod';

import { sleep } from '@/shared/utils/any.utils';

import { getJobTypeFunction } from './utils';

const convertSchema = z.object({
	type: z.union([z.literal('url'), z.literal('html')]),
	value: z.string(),
	tenantId: z.string(),
});

// Define discriminated union for input
type HtmlToPdfInput = z.infer<typeof convertSchema>;
// 	| { type: 'url'; value: string; tenantId: string }
// 	| { type: 'html'; value: string; tenantId: string };

const BUCKET_NAME = 'your-bucket-name';
const MONGO_URI = 'your-mongodb-uri';
const DATABASE_NAME = 'your-database';
const COLLECTION_NAME = 'pdf_files';
const storage = new Storage();
const mongoClient = new MongoClient(MONGO_URI);

async function generatePdf(input: HtmlToPdfInput): Promise<{ buffer: Buffer; fileName: string }> {
	const browser = await chromium.launch();
	const context = await browser.newContext();
	const page = await context.newPage();

	if (input.type === 'url') {
		await page.goto(input.value, { waitUntil: 'networkidle' });
	} else {
		await page.setContent(input.value, { waitUntil: 'networkidle' });
	}

	const fileName = `${input.tenantId}/${nanoid()}.pdf`;
	const buffer = await page.pdf({ format: 'A4' });

	await browser.close();
	return { buffer, fileName };
}

async function uploadToGCS(buffer: Buffer, fileName: string): Promise<string> {
	const bucket = storage.bucket(BUCKET_NAME);
	const file = bucket.file(fileName);

	const stream = file.createWriteStream({ resumable: false });
	stream.end(buffer);
	await new Promise((resolve, reject) => {
		stream.on('finish', resolve);
		stream.on('error', reject);
	});

	await file.makePrivate(); // Ensure the file is not public
	return fileName;
}

async function saveMetadataToMongo(fileName: string, tenantId: string): Promise<void> {
	const db = mongoClient.db(DATABASE_NAME);
	const collection = db.collection(COLLECTION_NAME);
	await collection.insertOne({
		tenantId,
		fileName,
		createdAt: new Date(),
	});
}

const handler1 = async (input: HtmlToPdfInput) => {
	await mongoClient.connect();

	const { buffer, fileName } = await generatePdf(input);
	await uploadToGCS(buffer, fileName);
	await saveMetadataToMongo(fileName, input.tenantId);

	console.log(`PDF generated and stored: ${fileName}`);
};

const handler2 = getJobTypeFunction({ schema: convertSchema, handler: handler1 });

const getHasEnoughCredits = async (timeOut: number) => {
	await sleep(timeOut);
	return _.get([false, false, false, true], _.toInteger(_.random(0, 3)), false);
};

const controllerCode = {
	ERR_EXPIRED_CREDITS: 'ERR_EXPIRED_CREDITS',
	ERR_ASYNC_LOOP: 'ERR_ASYNC_LOOP',
	MAIN_FUNC_SUCCESS: 'MAIN_FUNC_SUCCESS',
} as const;

type ControllerCode = ValueOf<typeof controllerCode>;

export class AbortError extends Error {
	code: ControllerCode;

	constructor(message: string, code: ControllerCode) {
		super(message);
		this.code = code;
	}
}

const getControlledFunction = ({ handler }: { handler: AsyncFunction }) => {
	return async (params: unknown) => {
		const controller = new AbortController();

		controller.signal.onabort = (_e) => {
			if ([controllerCode.ERR_EXPIRED_CREDITS, controllerCode.ERR_ASYNC_LOOP].includes(controller.signal.reason)) {
				throw new AbortError('Function aborted', controller.signal.reason as never);
			}
		};

		const asyncLoop = async (intervalTime = 5000) => {
			let hasEnoughCredits;

			do {
				hasEnoughCredits = await getHasEnoughCredits(intervalTime);
			} while (!controller.signal.aborted && hasEnoughCredits);

			if (!hasEnoughCredits) {
				controller.abort(controllerCode.ERR_EXPIRED_CREDITS);
			}
		};

		asyncLoop(5000).catch((error) => {
			console.log('Error in async loop: ', error);
			controller.abort(controllerCode.ERR_ASYNC_LOOP);
		});

		// main thread intensive task
		await handler(params);

		controller.abort(controllerCode.MAIN_FUNC_SUCCESS);
	};
};

export const convertHTMLToPDF = getControlledFunction({ handler: handler2 });
