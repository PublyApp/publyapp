import { cn } from '~/lib/utils';

const BODY_MAX_LENGTH = 20000;

/** "123 / 20000": the draft-storage guard, red once exceeded. */
export const PostBodyCounter = ({
	length,
	id,
}: {
	length: number;
	id?: string;
}) => (
	<p
		id={id}
		className={cn(
			'text-xs',
			length > BODY_MAX_LENGTH
				? 'text-[var(--publy-danger)]'
				: 'text-muted-foreground',
		)}
	>
		{length} / {BODY_MAX_LENGTH}
	</p>
);
