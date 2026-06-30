import { Button } from '@heroui/react';
import { createFileRoute } from '@tanstack/react-router';

export const LoginRoute = () => (
	<div className="space-y-4">
		<h1 className="text-2xl font-semibold">Sign in</h1>
		<p className="text-sm text-slate-700 dark:text-slate-300">
			Use the auth placeholder page to validate shell surfaces and navigation.
		</p>
		<Button variant="primary">Sign in</Button>
	</div>
);

export const Route = createFileRoute('/login')({
	component: LoginRoute,
});
