/**
 * Per-worktree e2e Compose environment helpers.
 *
 * The docker-compose.test.yml stack publishes ports on loopback using
 * `E2E_PORT_*` env vars (with fallback to the canonical base ports).
 * These helpers let e2e specs read the same port offsets the compose
 * stack is actually listening on, so a private (remapped-port) stack
 * works without editing spec source.
 *
 * On CI, COMPOSE_PROJECT_NAME is set by the workflow and ports use the
 * defaults (no offset), so these helpers resolve to the canonical URLs.
 */

const DEFAULT_WEB_PORT = 8080;
const DEFAULT_WEBSECURE_PORT = 8443;
const DEFAULT_COUNTER_PORT = 8800;
const DEFAULT_TOXIPROXY_PORT = 8474;

const port = (envVar: string, defaultPort: number): number =>
	Number.parseInt(process.env[envVar] ?? String(defaultPort), 10);

export const E2E_PORTS = {
	web: port('E2E_PORT_TRAEFIK_WEB', DEFAULT_WEB_PORT),
	websecure: port('E2E_PORT_TRAEFIK_WEBSECURE', DEFAULT_WEBSECURE_PORT),
	requestCounter: port('E2E_PORT_REQUEST_COUNTER', DEFAULT_COUNTER_PORT),
	toxiproxy: port('E2E_PORT_TOXIPROXY', DEFAULT_TOXIPROXY_PORT),
} as const;

export const FRONT_URL = `https://front.localhost:${E2E_PORTS.websecure}`;
export const API_URL = `https://api.front.localhost:${E2E_PORTS.websecure}`;
export const COUNTER_URL = `http://127.0.0.1:${E2E_PORTS.requestCounter}`;
export const TOXIPROXY_API_URL = `http://127.0.0.1:${E2E_PORTS.toxiproxy}`;
