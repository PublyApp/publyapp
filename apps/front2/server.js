import 'dotenv/config';

if (process.env.NODE_ENV === 'production') {
	await import('./build/server/index.js');
} else {
	await import('./server/dev.js');
}
