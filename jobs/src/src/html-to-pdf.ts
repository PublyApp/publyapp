/* eslint-disable prefer-arrow/prefer-arrow-functions */
/* eslint-disable func-style */
import { Storage } from '@google-cloud/storage';
import { MongoClient } from 'mongodb';
import { chromium } from 'playwright';
import { v4 as uuIdV4 } from 'uuid';
import { z } from 'zod';

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

	const fileName = `${input.tenantId}/${uuIdV4()}.pdf`;
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

async function generateSignedUrl(fileName: string, expiresInSeconds: number = 3600): Promise<string> {
	const [url] = await storage
		.bucket(BUCKET_NAME)
		.file(fileName)
		.getSignedUrl({
			action: 'read',
			expires: Date.now() + expiresInSeconds * 1000,
		});
	return url;
}

async function saveMetadataToMongo(fileName: string, tenantId: string): Promise<void> {
	const signedUrl = await generateSignedUrl(fileName);
	const db = mongoClient.db(DATABASE_NAME);
	const collection = db.collection(COLLECTION_NAME);
	await collection.insertOne({
		tenantId,
		fileName,
		signedUrl,
		createdAt: new Date(),
	});
}

// export async function getSignedUrlFromMetadata(fileName: string, expiresInSeconds: number = 3600): Promise<string> {
// 	return generateSignedUrl(fileName, expiresInSeconds);
// }

async function convertHTMLToPDFHandler(input: HtmlToPdfInput) {
	await mongoClient.connect();

	const { buffer, fileName } = await generatePdf(input);
	await uploadToGCS(buffer, fileName);
	await saveMetadataToMongo(fileName, input.tenantId);

	console.log(`PDF generated and stored: ${fileName}`);
}

export const convertHTMLToPDF = getJobTypeFunction({ schema: convertSchema, handler: convertHTMLToPDFHandler });
