import * as React from 'react';
import SimpleBarCore from 'simplebar-core';
import { cn } from '~/lib/utils';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';

/**
 * SSR-safe shared scroll area primitive (#840).
 *
 * Strategy: the exact DOM structure SimpleBar's engine expects is rendered
 * natively on BOTH the server and the client (so hydration matches and there
 * is no remount), and `SimpleBarCore` is instantiated imperatively on mount.
 * The core's `initDOM()` adopts pre-rendered nodes instead of mutating the
 * tree, which keeps React's virtual DOM in sync with reality. On the server,
 * `SimpleBarCore.init()` bails out (`canUseDOM`), so SSR output stays static
 * markup with native scrolling as the no-JS fallback.
 *
 * The ref forwarded to consumers is THE REAL SCROLLER — SimpleBar's inner
 * content wrapper, the element that actually receives `scrollTop` writes and
 * emits `scroll` events. This keeps programmatic scrolling working for
 * callers that used to hold a ref to a plain `overflow-auto` div.
 *
 * The stock simplebar stylesheet is vendored into app.css (`.simplebar-*`
 * rules) because its raw literals (hex colours, numeric z-indexes, un-tokened
 * durations) violate this repo's design-token and z-index guards; the vendored
 * copy routes everything through publy tokens and adds the auto-hide policy:
 * reveal on hover/wheel/touch/focus-within/drag, reduced-motion kills the
 * fade, forced-colors mode forces the scrollbar visible.
 */

const CLASS_NAMES = {
	contentEl: 'simplebar-content',
	contentWrapper: 'simplebar-content-wrapper',
	offset: 'simplebar-offset',
	mask: 'simplebar-mask',
	wrapper: 'simplebar-wrapper',
	// i18n-guard-ignore: no-hardcoded-ui-literal — SimpleBar engine's internal CSS-class token for a geometry probe node; never rendered as UI copy.
	placeholder: 'simplebar-placeholder',
	scrollbar: 'simplebar-scrollbar',
	track: 'simplebar-track',
	heightAutoObserverWrapperEl: 'simplebar-height-auto-observer-wrapper',
	heightAutoObserverEl: 'simplebar-height-auto-observer',
	visible: 'simplebar-visible',
	horizontal: 'simplebar-horizontal',
	vertical: 'simplebar-vertical',
	hover: 'simplebar-hover',
	dragging: 'simplebar-dragging',
	scrolling: 'simplebar-scrolling',
	scrollable: 'simplebar-scrollable',
	mouseEntered: 'simplebar-mouse-entered',
} satisfies NonNullable<
	import('simplebar-core').SimpleBarOptions['classNames']
>;

type ScrollAreaProps = React.ComponentPropsWithoutRef<'div'> & {
	/**
	 * Accessible name for the scroller. Rendered as an aria-label on the real
	 * scrolling element. Required: an unnamed scrollable region fails audit
	 * review, and the engine's own default label ("scrollable content") is
	 * English-only.
	 */
	scrollAreaLabel: string;
	/**
	 * Tab index for the real scroller. Defaults to -1 (never in the tab
	 * order): popups manage focus themselves. Leaf regions whose content is
	 * NOT otherwise keyboard-reachable pass 0 so keyboard users can scroll
	 * them (e.g. the audit-log payload block).
	 */
	scrollerTabIndex?: number;
};

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
	(
		{ children, className, scrollAreaLabel, scrollerTabIndex = -1, ...props },
		forwardedRef,
	) => {
		const rootRef = React.useRef<HTMLDivElement | null>(null);
		const scrollerRef = React.useRef<HTMLDivElement | null>(null);

		React.useEffect(() => {
			if (!rootRef.current) return undefined;
			let instance: SimpleBarCore | null = null;
			try {
				instance = new SimpleBarCore(rootRef.current, {
					classNames: CLASS_NAMES,
				});
			} catch (error) {
				logger.error('ScrollArea failed to initialize', { error });
			}
			return () => instance?.unMount();
		}, []);

		React.useImperativeHandle(forwardedRef, () => {
			if (!scrollerRef.current) {
				throw new Error(
					'ScrollArea ref accessed before mount — the real scroller does not exist yet',
				);
			}
			return scrollerRef.current;
		});

		return (
			<div
				ref={rootRef}
				data-simplebar="init"
				data-slot="scroll-area"
				className={cn('relative', className)}
				{...props}
			>
				<div className="simplebar-wrapper">
					{/* Geometry probes the engine reads (never painted, never
					   interactive) — they must exist or recalculate() bails out. */}
					<div className="simplebar-height-auto-observer-wrapper">
						<div className="simplebar-height-auto-observer" />
					</div>
					<div className="simplebar-mask">
						<div className="simplebar-offset">
							<div
								ref={scrollerRef}
								className="simplebar-content-wrapper"
								tabIndex={scrollerTabIndex}
								role="region"
								aria-label={scrollAreaLabel}
							>
								<div className="simplebar-content">{children}</div>
							</div>
						</div>
					</div>
					<div className="simplebar-placeholder" />
				</div>
				<div className="simplebar-track simplebar-horizontal">
					<div className="simplebar-scrollbar" />
				</div>
				<div className="simplebar-track simplebar-vertical">
					<div className="simplebar-scrollbar" />
				</div>
			</div>
		);
	},
);

export { ScrollArea };
