import { parseAsString, useQueryState } from 'nuqs';

export const useAuditLogInspect = () => {
	const [inspectedLogId, setInspectedLogId] = useQueryState(
		'inspect',
		parseAsString,
	);

	const openInspect = (logId: string) => {
		setInspectedLogId(logId);
	};

	const closeInspect = () => {
		setInspectedLogId(null);
	};

	return { inspectedLogId, openInspect, closeInspect };
};
