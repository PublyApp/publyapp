import { Skeleton } from '~/components/ui/skeleton';

const SKELETON_ROW_KEYS = ['h-1', 'h-2', 'h-3', 'h-4', 'h-5', 'h-6'] as const;

/** The loading body of the shared history: the same bordered box and row
 * rhythm as the real feed, so the page never jumps when the data lands. */
export const HistorySkeleton = ({ testId }: { testId: string }) => (
	<div
		className="flex flex-col gap-5"
		data-testid={`${testId}-loading`}
		aria-hidden="true"
	>
		<div className="flex flex-col gap-2">
			<Skeleton className="ml-1 h-4 w-24" />
			<div className="overflow-clip rounded-[var(--publy-radius-control)] border bg-background">
				{SKELETON_ROW_KEYS.map((key) => (
					<div
						key={key}
						className="flex min-h-12 items-center gap-3 border-b px-3 py-2 last:border-b-0"
					>
						<Skeleton className="size-8 shrink-0 rounded-[10px]" />
						<Skeleton className="h-3 w-64" />
						<Skeleton className="ml-auto h-5 w-20 rounded-[10px]" />
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-3 w-10" />
					</div>
				))}
			</div>
		</div>
	</div>
);
