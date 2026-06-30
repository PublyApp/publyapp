import { Button } from '@heroui/react';
import { createFileRoute } from '@tanstack/react-router';

export const IndexRoute = () => (
	<div className="space-y-4">
		<h1 className="text-2xl font-semibold">Welcome to the front-2 shell</h1>
		<p className="text-sm text-slate-700 dark:text-slate-300">
			Theme and sidebar state are managed in the shared front-2 shell store.
		</p>
		<Button variant="solid" color="primary">
			HeroUI shell is active
		</Button>
	</div>
);

export const Route = createFileRoute('/')({
	component: IndexRoute,
});
