import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed-layout/tenant')({
	component: TenantShellPlaceholder,
});

function TenantShellPlaceholder() {
	return (
		<div>
			<h1>Tenant</h1>
		</div>
	);
}
