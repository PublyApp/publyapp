import { IconAlertTriangle } from '@tabler/icons-react';

/** Matches the fail-closed redaction envelope produced by the API's
 * `PayloadRedaction` helper (`{"redacted":true,...}`). Anything else —
 * including unparsable junk — counts as NOT redacted: the banner must never
 * cry wolf over a payload the staff member can actually read. */
export const isPayloadRedacted = (
	payload: string | null | undefined,
): boolean => {
	if (!payload) {
		return false;
	}

	try {
		const parsed = JSON.parse(payload) as { redacted?: unknown };
		return parsed.redacted === true;
	} catch {
		return false;
	}
};

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
