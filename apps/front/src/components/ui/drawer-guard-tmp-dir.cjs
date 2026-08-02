// Test-only support for drawer-form.test.tsx (fix/990).
//
// Creates the guard's per-run fixture temp directory and registers its
// cleanup on every termination path: a synchronous 'exit' handler (crashes,
// assertion failures, graceful exits) and explicit SIGINT/SIGTERM handlers
// (cancellation — a signal does NOT run 'exit' handlers, round 13's
// IMPORTANT 4: a cancelled CI run used to leak the whole directory).
//
// Plain CommonJS on purpose: the SIGTERM probe in the guard suite spawns a
// bare `node -e` child that requires THIS module, so the child exercises
// the exact wiring the guard uses instead of a copy.
'use strict';

const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const createGuardTempDir = (prefix) => {
	const dir = mkdtempSync(path.join(tmpdir(), prefix));
	const remove = () => rmSync(dir, { recursive: true, force: true });
	process.on('exit', remove);
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, () => {
			remove();
			// A cleanup handler must not turn a cancelled run into a
			// successful one: `process.exit(0)` masked the real exit code
			// (and pre-empted every other signal handler) on Ctrl-C / CI
			// cancellation. Exit non-zero instead.
			process.exit(1);
		});
	}
	return { dir, remove };
};

module.exports = { createGuardTempDir };
