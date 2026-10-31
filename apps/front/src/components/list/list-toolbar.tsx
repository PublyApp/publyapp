import { useEffect, type ReactNode, type RefObject } from 'react';
import { cn } from '~/lib/utils';

/**
 * A list page's pinned search row (Shopkart OS `list-toolbar.tsx`): the
 * search field, then the toolbar buttons. It wraps by itself; from `md` it
 * stays pinned at the top of the page (its background reaching up into the
 * page padding), on a phone it pins under the topbar. It publishes its own
 * height as `--search-height` so the table header can pin under it — the
 * offset is computed from the real `--page-pad-top`, not a hard-coded 32px
 * (#2274 §2.10).
 */
export const ListToolbar = ({
	testId,
	top,
	tabs = false,
	search,
	children,
	onHeightChange,
}: {
	testId?: string;
	top: RefObject<HTMLElement | null>;
	/** Whether the tabs stand above it (it then takes their place in the scroll). */
	tabs?: boolean;
	search: ReactNode;
	children: ReactNode;
	/** The measured height, so the page can pin the table header under it. */
	onHeightChange?: (height: number) => void;
}) => {
	useEffect(() => {
		const row = top.current;
		if (!row) {
			return;
		}

		const publish = () => onHeightChange?.(row.offsetHeight);
		publish();
		if (typeof ResizeObserver === 'undefined') {
			return;
		}

		const observer = new ResizeObserver(publish);
		observer.observe(row);
		return () => observer.disconnect();
	}, [top, onHeightChange]);

	return (
		<section
			ref={top}
			data-testid={testId ? `${testId}-toolbar` : undefined}
			data-list-toolbar=""
			data-tabs={tabs || undefined}
			className={cn(
				'flex scroll-mt-32 flex-wrap items-center justify-between gap-3 bg-background shadow-[0_-8px_0_var(--background)] transition-transform duration-200 ease-out max-md:sticky max-md:z-(--publy-z-raised) max-md:-mx-4 max-md:px-4 max-md:py-2 md:sticky md:z-(--publy-z-raised) md:-my-2 md:py-2',
				'max-md:top-[calc(var(--page-pad-top)*-1)] md:top-[calc(var(--page-pad-top)*-1)]',
			)}
		>
			{search}
			<div className="no-scrollbar -m-1 flex max-w-full min-w-0 items-center gap-2 overflow-x-auto p-1 whitespace-nowrap max-md:-mx-4 max-md:max-w-[calc(100%+2rem)] max-md:px-4">
				{children}
			</div>
		</section>
	);
};
