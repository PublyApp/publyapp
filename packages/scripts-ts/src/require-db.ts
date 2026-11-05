#!/usr/bin/env node
// `just db-*` guard (#2305): the AppHost owns the local Postgres, so the database only
// exists while `just dev` runs. Fail with the owner-facing message instead of a raw
// Npgsql connection error.

import { connect } from 'node:net';
import process from 'node:process';

const socket = connect(5454, '127.0.0.1');

socket.on('connect', () => {
	socket.end();
});

socket.on('error', () => {
	process.stderr.write(
		"La base locale ne tourne pas : lance d'abord just dev.\n",
	);
	process.exit(1);
});
