import { IconAlertTriangle } from '@tabler/icons-react';

export { isPayloadRedacted } from './_redaction-helpers';

export const RedactionBanner = ({ label }: { label: string }) => (
	<div
		role="note"
		data-testid="payload-redaction-banner"
		className="flex items-start gap-2 rounded-[var(--publy-radius-sm)] border border-border bg-muted p-3 text-[13px] text-foreground"
	>
		<IconAlertTriangle
			aria-hidden="true"
			className="mt-0.5 size-4 shrink-0 text-muted-foreground"
		/>
		<span>{label}</span>
	</div>
);
