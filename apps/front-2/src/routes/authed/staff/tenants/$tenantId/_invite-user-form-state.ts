export const parseInviteeEmails = (value: string): string[] => {
	const emails: string[] = [];
	const seen = new Set<string>();

	for (const candidate of value.split(/[\s,]+/)) {
		const email = candidate.trim();
		const identity = email.toLowerCase();
		if (!email || seen.has(identity)) {
			continue;
		}

		emails.push(email);
		seen.add(identity);
	}

	return emails;
};
