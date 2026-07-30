import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/health')({
	staticData: { crumbs: 'shell' },
	server: {
		handlers: {
			GET: () => Response.json({ status: 'ok' }),
		},
	},
});
