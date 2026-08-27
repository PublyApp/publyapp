#!/usr/bin/env node
/**
 * Derives per-worktree Compose project name and host port offsets for the
 * front e2e stack (apps/front/docker-compose.test.yml).
 *
 * Problem (#1642): docker-compose.test.yml had a hardcoded
 * `name: publyapp-front2-real-test`, so Compose indexed on that name — not
 * on the file path. Every worktree on the machine drove the SAME containers,
 * and a `down -v` from one tree destroyed another tree's stack (volumes
 * included).
 *
 * Solution (voie A — isolation par arbre): derive the project name from the
 * worktree path, and offset the published host ports so two simultaneous
 * stacks don't collide on the same port.
 *
 * This script emits shell `export` lines that can be `eval`'d, or sets
 * environment variables when invoked with `--set`.
 *
 * The worktree path is hashed to a stable, deterministic port offset so the
 * same tree always maps to the same ports (repeatable debugging). Each worktree
 * gets a 10-port band: offset 0 uses ports 8xxx, offset 10 uses ports 8xxx+10,
 * etc. The hash is bounded so we never exceed the available ephemeral range.
 *
 * Port map (base → offset+base):
 *   traefik web:       8080 + offset
 *   traefik websecure:  8443 + offset
 *   request-counter:   8800 + offset
 *   toxiproxy:         8474 + offset
 */

import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONT_DIR = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'..',
);

// Canonical e2e hostname — unchanged, same as before (#1642).
const E2E_FRONT_HOST = 'front.localhost';
const E2E_API_HOST = 'api.front.localhost';

// Base ports (must match docker-compose.test.yml's `:8080`, `:8443`, `:8800`, `:8474`).
const BASE_PORTS = {
	traefik_web: 8080,
	traefik_websecure: 8443,
	request_counter: 8800,
	toxiproxy: 8474,
};

// Band size: enough headroom between worktrees.
const PORT_BAND = 10;
// Max offset to stay within ephemeral port range (60100+).
const MAX_OFFSETS = 500;

// Docker Compose limits project names to 64 characters. Trim and suffix with
// a short hash to stay within bounds while keeping uniqueness.
const MAX_PROJECT_NAME_LENGTH = 64;

function deriveWorktreeName(): string {
	const cwd = process.cwd();

	// If we're inside a worktree, git gives us the worktree path.
	// Otherwise, derive from the front directory path basename.
	if (cwd.startsWith(FRONT_DIR)) {
		// We're in apps/front or a subdirectory — use the worktree root
		return deriveFromPath(cwd);
	}

	// Check if we're in a git worktree
	return deriveFromPath(cwd);
}

function deriveFromPath(p: string): string {
	const parts = p.split('/');
	const wtIndex = parts.findIndex((part) => part.startsWith('wt-'));
	if (wtIndex >= 0) {
		return parts[wtIndex];
	}
	// Fall back to the basename of the path
	return parts[parts.length - 1] || 'wt-unknown';
}

function hashToIndex(seed: string): number {
	const hash = createHash('sha256').update(seed).digest('hex');
	const firstFour = hash.slice(0, 4);
	const num = parseInt(firstFour, 16);
	return (num % MAX_OFFSETS) * PORT_BAND;
}

export function computeEnv(): Record<string, string> {
	const worktreeName = deriveWorktreeName();
	const offset = hashToIndex(worktreeName);
	const projectNameBase = `publyapp-e2e-${worktreeName}`;
	// Ensure project name fits within Docker Compose's 64-char limit.
	// If the derived name is too long, truncate and append a short hash
	// suffix to preserve uniqueness.
	const shortHash = createHash('sha256')
		.update(worktreeName)
		.digest('hex')
		.slice(0, 4);
	const composeProjectName =
		projectNameBase.length <= MAX_PROJECT_NAME_LENGTH
			? projectNameBase
			: `${projectNameBase.slice(0, MAX_PROJECT_NAME_LENGTH - 5)}-${shortHash}`;

	return {
		COMPOSE_PROJECT_NAME: composeProjectName,
		E2E_PORT_TRAEFIK_WEB: String(BASE_PORTS.traefik_web + offset),
		E2E_PORT_TRAEFIK_WEBSECURE: String(BASE_PORTS.traefik_websecure + offset),
		E2E_PORT_REQUEST_COUNTER: String(BASE_PORTS.request_counter + offset),
		E2E_PORT_TOXIPROXY: String(BASE_PORTS.toxiproxy + offset),
		E2E_BASE_URL: `https://${E2E_FRONT_HOST}:${BASE_PORTS.traefik_websecure + offset}`,
		E2E_API_BASE_URL: `https://${E2E_API_HOST}:${BASE_PORTS.traefik_websecure + offset}`,
	};
}

function main() {
	const env = computeEnv();
	const isSet = process.argv.includes('--set');

	if (isSet) {
		// Print as export statements for shell eval
		for (const [key, value] of Object.entries(env)) {
			process.stdout.write(`${key}=${value}\n`);
		}
	} else {
		// Print as shell export lines
		for (const [key, value] of Object.entries(env)) {
			// Quote if contains special chars
			if (/[^a-zA-Z0-9_]/.test(value)) {
				process.stdout.write(`export ${key}="${value}"\n`);
			} else {
				process.stdout.write(`export ${key}=${value}\n`);
			}
		}
	}
}

main();
