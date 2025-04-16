import _ from 'lodash';

import { Storage } from '@google-cloud/storage';
import { MongoClient } from 'mongodb';
import { nanoid } from 'nanoid';
import { chromium } from 'playwright';
import { z } from 'zod';

import { className } from '@/shared/lib/constants';
import { sleep } from '@/shared/utils/any.utils';

import { getJobTypeFunction } from '../utils/utils';

const convertSchema = z.object({
	type: z.union([z.literal('url'), z.literal('html')]),
	value: z.string(),
	tenantId: z.string(),
});

type HtmlToPdfInput = z.infer<typeof convertSchema>;

const BUCKET_NAME = 'your-bucket-name';
const MONGO_URI = 'your-mongodb-uri';
const DATABASE_NAME = 'your-database';
const COLLECTION_NAME = 'pdf_files';
const storage = new Storage();
const mongoClient = new MongoClient(MONGO_URI);

const generatePdf = async (
	input: HtmlToPdfInput,
): Promise<{ buffer: Buffer; fileName: string }> => {
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
};

const uploadToGCS = async (buffer: Buffer, fileName: string) => {
	const bucket = storage.bucket(BUCKET_NAME);
	const file = bucket.file(fileName);

	const stream = file.createWriteStream({ resumable: false });
	stream.end(buffer);
	await new Promise((resolve, reject) => {
		stream.on('finish', resolve);
		stream.on('error', reject);
	});

	await file.makePrivate(); // Ensure the file is not public
	const [metadata] = await file.getMetadata();

	return Number(metadata.size) / 1024 / 1024;
};

const saveMetadataToMongo = async (
	fileName: string,
	tenantId: string,
	cpuTime: number,
	ramUsage: number,
	fileSizeMB: number,
): Promise<void> => {
	const creditsUsed = cpuTime * 0.5 + ramUsage * 0.2 + fileSizeMB * 0.1;
	const db = mongoClient.db(DATABASE_NAME);
	const collection = db.collection(COLLECTION_NAME);
	await collection.insertOne({
		tenantId,
		fileName,
		cpuTime,
		ramUsage,
		fileSizeMB,
		creditsUsed,
		createdAt: new Date(),
	});
};

const getResourceUsage = () => {
	const cpuUsage = process.cpuUsage().user / 1e6; // Convert microseconds to milliseconds
	const ramUsage = process.memoryUsage().heapUsed / 1024 / 1024; // Convert bytes to MB
	return { cpuUsage, ramUsage };
};

let RESOURCE_USAGE_CHECKPOINT: ReturnType<typeof getResourceUsage> = {
	cpuUsage: 0,
	ramUsage: 0,
};

const updateAndCheckCredits = async (
	tenantId: string,
	options: {
		cpuUsage: number;
		ramUsage: number;
		fileSizeMB: number;
	},
): Promise<boolean> => {
	const db = mongoClient.db(DATABASE_NAME);
	const tenantsCollection = db.collection(className.TENANT);

	const { cpuUsage, fileSizeMB, ramUsage } = options;

	const creditCost = cpuUsage * 0.5 + ramUsage * 0.2 + fileSizeMB * 0.1;
	const result = await tenantsCollection.findOneAndUpdate(
		{ tenantId },
		{ $inc: { credits: -creditCost } },
		{ returnDocument: 'after' },
	);

	return result?.value?.credits > 0;
};

const getResourceUsageInterval: typeof getResourceUsage = () => {
	const lastCheckPoint = _.assign({}, RESOURCE_USAGE_CHECKPOINT);
	const usageNow = getResourceUsage();

	RESOURCE_USAGE_CHECKPOINT = usageNow;

	return {
		cpuUsage: usageNow.cpuUsage - lastCheckPoint.cpuUsage,
		ramUsage: usageNow.ramUsage - lastCheckPoint.ramUsage,
	};
};

const handler1 = async (input: HtmlToPdfInput) => {
	await mongoClient.connect();

	const { buffer, fileName } = await generatePdf(input);
	const fileSizeMB = await uploadToGCS(buffer, fileName);
	const { cpuUsage, ramUsage } = getResourceUsageInterval();
	await saveMetadataToMongo(
		fileName,
		input.tenantId,
		cpuUsage,
		ramUsage,
		fileSizeMB,
	);
	await updateAndCheckCredits(input.tenantId, {
		cpuUsage,
		ramUsage,
		fileSizeMB,
	});

	console.log(`PDF generated and stored: ${fileName}`);
};

const handler2 = getJobTypeFunction({
	schema: convertSchema,
	handler: handler1,
});

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
		try {
			const controller = new AbortController();

			controller.signal.onabort = (_e) => {
				if (
					[
						controllerCode.ERR_EXPIRED_CREDITS,
						controllerCode.ERR_ASYNC_LOOP,
					].includes(controller.signal.reason)
				) {
					throw new AbortError(
						'Function aborted',
						controller.signal.reason as never,
					);
				}
			};

			const asyncLoop = async (intervalTime = 5000) => {
				let hasEnoughCredits: boolean;

				let elapsedTime = 0;
				let iterationIndex = 0;

				do {
					if (iterationIndex > 0) {
						await sleep(intervalTime - elapsedTime);
					}

					const t1 = Date.now();
					const { cpuUsage, ramUsage } = getResourceUsageInterval();
					hasEnoughCredits = await updateAndCheckCredits(
						_.get(params, 'tenantId', ''),
						{
							cpuUsage,
							ramUsage,
							fileSizeMB: 0,
						},
					); // Small periodic deductions
					const t2 = Date.now();
					elapsedTime = t2 - t1;

					iterationIndex += 1;
				} while (!controller.signal.aborted && hasEnoughCredits);

				if (!hasEnoughCredits) {
					controller.abort(controllerCode.ERR_EXPIRED_CREDITS);
				} else {
					// if controller has been aborted
					// the reason is likely == controllerCode.MAIN_FUNC_SUCCESS
					const { cpuUsage, ramUsage } = getResourceUsageInterval();
					hasEnoughCredits = await updateAndCheckCredits(
						_.get(params, 'tenantId', ''),
						{
							cpuUsage,
							ramUsage,
							fileSizeMB: 0,
						},
					);
				}
			};

			asyncLoop(5000).catch((error) => {
				console.log('Error in async loop: ', error);
				controller.abort(controllerCode.ERR_ASYNC_LOOP);
			});

			// main thread intensive task
			await handler(params);

			controller.abort(controllerCode.MAIN_FUNC_SUCCESS);
		} catch (error) {
			const { cpuUsage, ramUsage } = getResourceUsageInterval();
			await updateAndCheckCredits(_.get(params, 'tenantId', ''), {
				cpuUsage,
				ramUsage,
				fileSizeMB: 0,
			});
			throw error;
		}
	};
};

export const convertHTMLToPDF = getControlledFunction({ handler: handler2 });
