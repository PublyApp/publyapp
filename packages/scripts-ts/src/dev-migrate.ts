#!/usr/bin/env node
// AppHost `migrate` resource (#2305), cwd apps/api. Applies migrations; on failure writes a
// French explanation that `just dev` prints in the owner's terminal.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const ERROR_FILE = path.join('.artifacts', 'dev-migrate-error.txt');

export const migrationFailureMessage = (pending, efOutput) => {
	const applying = [...efOutput.matchAll(/Applying migration '([^']+)'/g)].map(
		(match) => match[1],
	);
	const failed = applying.at(-1) ?? pending[0] ?? '(inconnue)';
	const pgError =
		efOutput
			.split('\n')
			.find((line) => line.includes('PostgresException'))
			?.replace(/^.*PostgresException[^:]*:\s*/, '')
			.trim() ?? 'aucun message Postgres';
	return [
		`La migration ${failed} de cette branche n'a pas pu s'appliquer à la base locale.`,
		"Pourquoi : cette base est propre à ce dossier, et elle a été migrée par une version précédente de la branche (changement de branche ou rebase) d'une façon que la branche actuelle ne connaît pas.",
		`Erreur Postgres : ${pgError}`,
		"Pour repartir d'une base propre : just db-reset — attention, ça efface toutes les données locales.",
	].join('\n');
};

const ef = (args) =>
	spawnSync('dotnet', ['tool', 'run', 'dotnet-ef', ...args, '--no-build'], {
		encoding: 'utf8',
	});

const pendingMigrations = () => {
	const out = ef(['migrations', 'list', '--json']).stdout ?? '';
	const json = out.slice(out.indexOf('['), out.lastIndexOf(']') + 1);
	try {
		return JSON.parse(json)
			.filter((migration) => !migration.applied)
			.map((migration) => migration.id);
	} catch {
		return [];
	}
};

const main = () => {
	const pending = pendingMigrations();
	const result = ef(['database', 'update']);
	process.stdout.write(result.stdout ?? '');
	if (result.status === 0) {
		return;
	}
	const message = migrationFailureMessage(
		pending,
		`${result.stdout ?? ''}\n${result.stderr ?? ''}`,
	);
	mkdirSync(path.dirname(ERROR_FILE), { recursive: true });
	writeFileSync(ERROR_FILE, message);
	process.stderr.write(`${message}\n`);
	process.exit(1);
};

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	main();
}
