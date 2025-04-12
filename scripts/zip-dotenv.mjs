import fs from 'node:fs';
import path from 'node:path';

import archiver from 'archiver';

/**
 * Create a zip file with the given .env files
 * @param {string[]} envPaths - Array of paths to .env files
 * @param {string} outputZipPath - Path to the output zip file
 */
const zipEnvFiles = (envPaths, outputZipPath) => {
	// Create a file to stream archive data to
	const output = fs.createWriteStream(outputZipPath);
	const archive = archiver('zip', {
		zlib: { level: 9 }, // Sets the compression level
	});

	// Listen for all archive data to be written
	output.on('close', () => {
		console.log(`${archive.pointer()} total bytes`);
		console.log(`Zip file created at ${outputZipPath}`);
	});

	// Catch any errors
	archive.on('error', (err) => {
		throw err;
	});

	// Pipe archive data to the file
	archive.pipe(output);

	// Append .env files to the archive
	_.forEach(envPaths, (envPath) => {
		const fileName = path.basename(envPath);
		archive.file(envPath, { name: fileName });
	});

	// Finalize the archive (i.e., finalize the zip file)
	archive.finalize();
};

// Example usage:
const envPaths = [
	path.resolve(__dirname, '../apps/server/.env.production'),
	path.resolve(__dirname, '../apps/front/.env.production'),
];
const outputZipPath = path.resolve(__dirname, '../.env.production.zip');

zipEnvFiles(envPaths, outputZipPath);
