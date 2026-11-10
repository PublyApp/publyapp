import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

declare const buildKey: () => string[];

// RED: a dynamic key with no exemption marker is a failure, never a pass.
const UnresolvableKey = () => {
	useQuery({ queryKey: buildKey(), queryFn: () => Promise.resolve([]) });
	return null;
};

export const Route = createFileRoute('/_authed-layout/unresolvable-key')({
	component: UnresolvableKey,
});
