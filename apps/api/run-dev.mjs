import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const chokidar = await import('chokidar');

const watcher = chokidar.watch([
	'Program.cs',
	'Src',
], {
	ignored: /node_modules/,
	persistent: true,
	ignoreInitial: true,
});

console.log('Watching Program.cs and Src folder for changes...');

let dotnetProcess = null;
let isRestarting = false;

const runDotnet = () => {
	return spawn('dotnet', ['run'], {
		stdio: 'inherit',
		cwd: import.meta.dirname,
	});
};

const onCloseDotnet = (code) => {
	console.log(`dotnet process exited with code ${code}`);
	dotnetProcess = null;
	isRestarting = false;
};

const killProcess = async (process) => {
	return new Promise((resolve) => {
		if (!process || process.killed) {
			resolve();
			return;
		}

		process.on('exit', resolve);
		process.kill('SIGTERM');

		// Force kill after 5 seconds if it doesn't exit gracefully
		setTimeout(5000).then(() => {
			if (!process.killed) {
				console.log('Force killing dotnet process...');
				process.kill('SIGKILL');
			}
		});
	});
};

const restartDotnet = async () => {
	if (isRestarting) {
		console.log('Restart already in progress, skipping...');
		return;
	}

	isRestarting = true;
	console.log('Restarting dotnet process...');

	// Kill the previous process and wait for it to exit
	if (dotnetProcess) {
		await killProcess(dotnetProcess);
		// Give a small delay to ensure file handles are released
		await setTimeout(1000);
	}

	// Start a new process
	dotnetProcess = runDotnet();
	dotnetProcess.on('close', onCloseDotnet);
};

watcher.on('all', async (event, path) => {
	console.log(`[${event}] ${path}`);
	await restartDotnet();
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
	console.log('\nShutting down...');
	watcher.close();
	if (dotnetProcess) {
		await killProcess(dotnetProcess);
	}
	process.exit(0);
});

process.on('SIGTERM', async () => {
	console.log('\nShutting down...');
	watcher.close();
	if (dotnetProcess) {
		await killProcess(dotnetProcess);
	}
	process.exit(0);
});

// Start the initial process
dotnetProcess = runDotnet();
dotnetProcess.on('close', onCloseDotnet);
