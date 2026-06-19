import { createFileRoute } from '@tanstack/react-router';

// Task 1.4 stub — the real login form (HeroUI Input/Button + RHF + login server fn)
// lands in Task 2.4. This exists so the VFR tree can resolve the /login route.
export const Route = createFileRoute('/login')({
	component: LoginPage,
});

function LoginPage() {
	return <div className="p-2">Login (stub)</div>;
}
