import { Button } from '@heroui/react';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
	component: Home,
});

function Home() {
	return (
		<div className="p-2 flex flex-col gap-4">
			<h3>Welcome Home!!!</h3>
			{/* Task 1.3 render proof: a styled HeroUI v3 Button (provider-less). */}
			<Button color="primary">HeroUI v3 works</Button>
		</div>
	);
}
