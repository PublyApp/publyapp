/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');

const dotenv = require('dotenv');

/**
 * Merge .env files
 * @param {string[]} envPaths - Array of paths to .env files
 * @param {string} outputPath - Path to the output .env file
 */
const mergeEnvFiles = (envPaths, outputPath) => {
	const envVariables = {};

	// Read and merge .env files
	envPaths.forEach((envPath) => {
		const envConfig = dotenv.parse(fs.readFileSync(envPath));

		for (const [key, value] of Object.entries(envConfig)) {
			envVariables[key] = value;
		}
	});

	// Write merged .env file
	const envContent = Object.entries(envVariables)
		.map(([key, value]) => {
			return `${key}=${value}`;
		})
		.join('\n');
	fs.writeFileSync(outputPath, envContent);

	console.log(`Merged .env file created at ${outputPath}`);
};

// Example usage:
const envPaths = [
	path.resolve(__dirname, '../apps/server/.env.production'),
	path.resolve(__dirname, '../apps/front/.env.production'),
];
const outputPath = path.resolve(__dirname, '../.env.production');

mergeEnvFiles(envPaths, outputPath);
