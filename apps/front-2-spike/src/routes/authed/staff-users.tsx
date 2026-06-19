import { createFileRoute } from '@tanstack/react-router';

// Task 1.4 stub — the real staff list (SSR loader prime + browser-Kiota Query +
// HeroUI/TanStack Table + RHF/Zod dialog) lands in Tasks 2.6/2.7. The route id below
// must match the one codegen emits (URL /staff/staff-users) — verified against
// routeTree.gen.ts and copied verbatim by Task 2.6.
export const Route = createFileRoute('/_authed-layout/staff/staff-users')({
	component: StaffUsersPage,
});

function StaffUsersPage() {
	return <div className="p-2">Staff users (stub)</div>;
}
