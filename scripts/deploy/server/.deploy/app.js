/* eslint-disable @typescript-eslint/no-var-requires */

// eslint-disable-next-line import/no-unresolved, import/extensions
require('./apps/server/dist/index');

// const http = require('http');

// const server = http.createServer((req, res) => {
// 	res.writeHead(200, { 'Content-Type': 'text/plain' });
// 	const message = 'It works!\n';
// 	const version = `NodeJS ${process.versions.node}\n`;
// 	const response = [message, version].join('\n');
// 	res.end(response);
// });
// server.listen();
