// Test-only support for drawer-form.test.tsx (fix/990).
//
// Creates the guard's per-run fixture temp directory and registers its
// cleanup on every termination path: a synchronous 'exit' handler (crashes,
// assertion failures, graceful exits) and explicit SIGINT/SIGTERM handlers
// (cancellation — a signal does NOT run 'exit' handlers, round 13's
// IMPORTANT 4: a cancelled CI run used to leak the whole directory).
//
// The signal handlers clean up and then RE-RAISE the signal that killed the
// process (round 17's IMPORTANT 5): the run must die of what actually
// cancelled it — `process.exit(1)` fabricated an unrelated failure status
// and `process.exit(0)` turned a cancellation into a success. After the
// handler removes itself, the re-raised signal takes the default action, so
// the process terminates with the signal's own status (exit event with
// code null, signal "SIGTERM").
//
// Plain CommonJS on purpose: the SIGTERM probe in the guard suite spawns a
// bare `node -e` child that requires THIS module, so the child exercises
// the exact wiring the guard uses instead of a copy.
'use strict';

const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

/**
 * @param {string} prefix
 * @returns {{ dir: string, remove: () => void }}
 */
const createGuardTempDir = (prefix) => {
	const dir = mkdtempSync(path.join(tmpdir(), prefix));
	const remove = () => rmSync(dir, { recursive: true, force: true });
	process.on('exit', remove);
	const handleSignal = (/** @type {NodeJS.Signals} */ signal) => {
		remove();
		process.removeListener(signal, handleSignal);
		process.kill(process.pid, signal);
	};
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, handleSignal);
	}
	return { dir, remove };
};

module.exports = { createGuardTempDir };
