import { Button } from '@heroui/react';
import { createFileRoute } from '@tanstack/react-router';

export const IndexRoute = () => (
	<div className="space-y-4">
		<h1 className="text-2xl font-semibold">Welcome to front-2</h1>
		<p className="text-sm text-slate-700">
			Minimal buildable TanStack Start shell.
		</p>
		<Button variant="primary">HeroUI placeholder</Button>
	</div>
);

export const Route = createFileRoute('/')({
	component: IndexRoute,
});
