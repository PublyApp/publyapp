#!/usr/bin/env node
// `just db-*` guard (#2305): the AppHost owns the local Postgres, so the database only
// exists while `just dev` runs. Fail with the owner-facing message instead of a raw
// Npgsql connection error.

import { connect } from 'node:net';
import process from 'node:process';

const MESSAGE = "La base locale ne tourne pas : lance d'abord just dev.\n";
const socket = connect(5454, '127.0.0.1');

// A connect timeout (#2317): a silent handshake wait must not hang `just db-migrate`.
socket.setTimeout(3000);

socket.on('connect', () => {
	socket.end();
	// Explicit success (#2317): do not rely on the event loop draining to exit.
	process.exit(0);
});

socket.on('timeout', () => {
	socket.destroy();
	process.stderr.write(MESSAGE);
	process.exit(1);
});

socket.on('error', () => {
	process.stderr.write(MESSAGE);
	process.exit(1);
});
