import { createFileRoute } from '@tanstack/react-router';

// RED: the marker no longer covers any query call.
const StaleExempt = () => {
	// preload-exempt: this used to cover a query the page no longer renders
	const size = 1;
	return size > 0 ? null : null;
};

export const Route = createFileRoute('/_authed-layout/stale-exempt')({
	component: StaleExempt,
});
