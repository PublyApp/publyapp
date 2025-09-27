#!/usr/bin/env node

import { execSync } from 'node:child_process';

// Configuration
const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'your-username';
const REPO_NAME = process.env.REPO_NAME || 'publyapp';
const REGISTRY = 'ghcr.io';
const TAG = process.argv[2] || 'latest';

// Colors for console output
const colors = {
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	reset: '\x1b[0m',
	bold: '\x1b[1m'
};

function log(message, color = 'reset') {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command, description) {
	try {
		log(`📦 ${description}...`, 'green');
		execSync(command, { stdio: 'inherit' });
		return true;
	} catch (error) {
		log(`❌ Failed to ${description.toLowerCase()}`, 'red');
		log(`Command: ${command}`, 'yellow');
		process.exit(1);
	}
}

function checkDockerLogin() {
	try {
		const result = execSync('docker info', { encoding: 'utf8' });
		if (!result.includes('ghcr.io')) {
			log('⚠️  You need to login to GitHub Container Registry first:', 'yellow');
			log('docker login ghcr.io -u YOUR_GITHUB_USERNAME -p YOUR_GITHUB_TOKEN', 'blue');
			log('');
			log('You can create a GitHub Personal Access Token at:', 'blue');
			log('https://github.com/settings/tokens', 'blue');
			log('Make sure to give it \'write:packages\' permission', 'blue');
			process.exit(1);
		}
	} catch (_error) {
		log('⚠️  Could not check Docker login status. Please ensure you\'re logged in to ghcr.io', 'yellow');
		process.exit(1);
	}
}

function checkEnvironmentVariables() {
	const requiredVars = ['POSTGRES_CONNECTION_STRING', 'FRONT_URL'];
	const missing = requiredVars.filter(varName => !process.env[varName]);

	if (missing.length > 0) {
		log('⚠️  Missing required environment variables:', 'yellow');
		missing.forEach(varName => {
			log(`  - ${varName}`, 'red');
		});
		log('');
		log('Please set these environment variables before running the script.', 'blue');
		process.exit(1);
	}
}

function main() {
	log('🚀 Building and pushing Docker images to GitHub Container Registry', 'green');
	log(`Repository: ${REGISTRY}/${GITHUB_USERNAME}/${REPO_NAME}`, 'yellow');
	log(`Tag: ${TAG}`, 'yellow');
	log('');

	// Check prerequisites
	checkDockerLogin();
	checkEnvironmentVariables();

	// Build API image
	const apiImageTag = `${REGISTRY}/${GITHUB_USERNAME}/${REPO_NAME}/api:${TAG}`;
	const apiBuildCommand = [
		'docker build',
		'-f apps/api/Dockerfile',
		`-t ${apiImageTag}`,
		'.'
	].join(' ');

	execCommand(apiBuildCommand, 'Building API image');

	// Build Frontend image
	const frontImageTag = `${REGISTRY}/${GITHUB_USERNAME}/${REPO_NAME}/front:${TAG}`;
	const frontBuildCommand = [
		'docker build',
		'-f apps/front/Dockerfile',
		`-t ${frontImageTag}`,
		'.'
	].join(' ');

	execCommand(frontBuildCommand, 'Building Frontend image');

	// Push API image
	execCommand(`docker push ${apiImageTag}`, 'Pushing API image');

	// Push Frontend image
	execCommand(`docker push ${frontImageTag}`, 'Pushing Frontend image');

	// Success message
	log('');
	log('✅ Successfully built and pushed images!', 'green');
	log(`API Image: ${apiImageTag}`, 'yellow');
	log(`Frontend Image: ${frontImageTag}`, 'yellow');
	log('');
	log('🎯 Next steps:', 'green');
	log('1. Update your Dokploy deployment to use these images', 'blue');
	log('2. Or use the docker-compose.prod.yml file for deployment', 'blue');
	log('');
	log('📋 Image URLs for Dokploy:', 'green');
	log(`API: ${apiImageTag}`, 'blue');
	log(`Frontend: ${frontImageTag}`, 'blue');
}

// Run the script
main();
