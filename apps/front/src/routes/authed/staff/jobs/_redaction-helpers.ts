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
