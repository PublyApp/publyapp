import { Button } from '@heroui/react';
import { createFileRoute } from '@tanstack/react-router';

// Task 1.5 raw-TS-transpilation proof: import a constant from the workspace TS
// package @org/shared-ts (ships raw .ts). It renders in SSR, so a green standalone
// boot proves `ssr.noExternal` transpiles workspace TS (no ERR_UNKNOWN_FILE_EXTENSION).
import { SESSION_TOKEN_HEADER_KEY } from '@org/shared-ts/lib/constants';

export const Route = createFileRoute('/')({
	component: Home,
});

function Home() {
	return (
		<div className="p-2 flex flex-col gap-4">
			<h3>Welcome Home!!!</h3>
			{/* Task 1.3 render proof: a styled HeroUI v3 Button (provider-less).
			    v3 uses `variant` (not v2's `color`) — values: primary | secondary |
			    tertiary | ghost | outline | danger | danger-soft. */}
			<Button variant="primary">HeroUI v3 works</Button>
			{/* Task 1.5: a value from the raw-TS workspace package, rendered in SSR. */}
			<div data-testid="shared-ts-proof">
				session header key: {SESSION_TOKEN_HEADER_KEY}
			</div>
		</div>
	);
}
