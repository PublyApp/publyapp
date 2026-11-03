import type { ReactNode } from 'react';

/**
 * The one appear/disappear animation (Shopkart OS `collapse.tsx`): a grid
 * track going `0fr` ↔ `1fr` (never `width`/`height`), the content fading and
 * sliding. Closed, it stays mounted but is `inert` and `aria-hidden`, so it
 * leaves the tab order and the accessibility tree.
 *
 * `axis="x"` (default) is a button in a toolbar and gives back the bar's gap
 * with a negative margin; `axis="y"` is a block in a page column and gives
 * back the vertical gap above it. The motion itself lives in `app.css`.
 */
export const Collapse = ({
	open,
	axis = 'x',
	from = 'left',
	className,
	children,
}: {
	open: boolean;
	axis?: 'x' | 'y';
	from?: 'left' | 'right';
	className?: string;
	children: ReactNode;
}) => (
	<div
		data-collapse={axis}
		data-from={from}
		data-open={open || undefined}
		aria-hidden={!open || undefined}
		inert={!open}
		className={className}
	>
		<div>
			<div>{children}</div>
		</div>
	</div>
);
