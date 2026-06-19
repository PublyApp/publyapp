import { createFileRoute } from '@tanstack/react-router';

// Task 1.4 stub — the real SSR identity-echo route (client.auth.userAuthData.get()
// for the token-distinct isolation test) lands in Task 4.4. Route id must match the
// codegen output (URL /_auth-echo) — verified against routeTree.gen.ts.
export const Route = createFileRoute('/_authed-layout/_auth-echo')({
	component: AuthEchoPage,
});

function AuthEchoPage() {
	return <div className="p-2">Auth echo (stub)</div>;
}
