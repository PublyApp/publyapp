import { createFileRoute, Outlet } from '@tanstack/react-router';

// Task 1.4 stub — the real authed shell (session gate in beforeLoad, error boundary,
// dark-mode toggle, runtime env) lands in Task 2.5. This pathless layout wraps the
// authed routes (/staff/staff-users, /_auth-echo) declared in src/routes.ts.
// NOTE: the createFileRoute id below must match the id codegen emits for this layout
// (the VFR layout id 'authed-layout'); verified against routeTree.gen.ts.
export const Route = createFileRoute('/_authed-layout')({
	component: AuthedLayout,
});

function AuthedLayout() {
	return (
		<div className="p-2">
			<div>Authed shell (stub)</div>
			<Outlet />
		</div>
	);
}
