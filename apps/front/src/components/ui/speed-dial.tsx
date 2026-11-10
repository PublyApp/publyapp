import { IconPlus, type TablerIcon } from '@tabler/icons-react';
import { createElement, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '~/lib/utils';

import {
	exitDelay,
	prefersReducedMotion,
	staggerFromEnd,
	usePresence,
	useScrollLock,
	type PresenceState,
} from './speed-dial-presence';

export type SpeedDialAction = {
	id: string;
	label: string;
	icon: TablerIcon;
	onSelect: () => void;
};

/** The actions leave together in 140 ms; the veil fades out with them. */
const EXIT_MS = 140;
/** Each action enters 40 ms after the one below it. */
const STAGGER_MS = 40;

/** One action's look in each presence state: rising in from 12 px at 90 %,
 * sinking out to 8 px at 95 %. */
const ACTION_LOOK = {
	enter: 'translate-y-3 scale-90 opacity-0',
	open: 'duration-[260ms] ease-[var(--publy-motion-ease)]',
	exit: 'pointer-events-none translate-y-2 scale-95 opacity-0 duration-[140ms] ease-[var(--publy-motion-ease)]',
	closed: '',
} satisfies Record<PresenceState, string>;

/**
 * The mobile floating action button and its actions, below md only (Shopkart
 * OS `components/speed-dial.tsx`). Tapping it turns its + into a × and stacks
 * `actions` above it (top to bottom; the last is the nearest and enters
 * first) over a blurred veil. The veil, Escape or choosing an action closes
 * it; an action runs once the exit animation is over. Not a base-ui surface,
 * so it locks the page's scroll itself. A single action runs at once: the
 * button shows its icon and label, no disclosure.
 *
 * Portalled to `document.body`: `.app-shell-main` sets `container-type`,
 * which makes it the containing block of a fixed descendant, and the button
 * must stay pinned to the viewport.
 */
export const SpeedDial = ({
	label,
	actions,
}: {
	label: string;
	actions: readonly SpeedDialAction[];
}) => {
	const single = actions.length === 1 ? actions[0] : undefined;
	const [open, setOpen] = useState(false);
	const { mounted, state } = usePresence(open, EXIT_MS);
	const button = useRef<HTMLButtonElement>(null);
	useScrollLock(open);

	useEffect(() => {
		if (!open) {
			return undefined;
		}
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setOpen(false);
				button.current?.focus();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open]);

	// The action waiting for the exit animation: dropped if the speed-dial
	// unmounts first.
	const pending = useRef<number | undefined>(undefined);
	useEffect(() => () => window.clearTimeout(pending.current), []);

	/** Focus goes back to the button before the action runs: the chosen
	 * action's button is leaving, and a drawer the action opens hands focus
	 * back, on close, to the element focused when it opened. */
	const choose = (action: SpeedDialAction) => {
		setOpen(false);
		button.current?.focus();
		pending.current = window.setTimeout(
			action.onSelect,
			exitDelay(EXIT_MS, prefersReducedMotion()),
		);
	};

	const close = () => {
		setOpen(false);
		button.current?.focus();
	};

	if (actions.length === 0 || typeof document === 'undefined') {
		return null;
	}

	return createPortal(
		<>
			{mounted ? (
				<>
					<div
						aria-hidden="true"
						onClick={close}
						className={cn(
							'fixed inset-0 z-(--publy-z-selection-bar) bg-[color-mix(in_srgb,var(--background)_72%,transparent)] backdrop-blur-[3px] transition-opacity md:hidden',
							state === 'open'
								? 'duration-[180ms] ease-[var(--publy-motion-ease)]'
								: 'pointer-events-none opacity-0 duration-[140ms] ease-[var(--publy-motion-ease)]',
						)}
					/>
					<div className="fixed right-[22px] bottom-[calc(88px+env(safe-area-inset-bottom))] z-(--publy-z-fab) flex flex-col items-end gap-3.5 md:hidden">
						{actions.map((action, index) => {
							return (
								<button
									key={action.id}
									type="button"
									onClick={() => choose(action)}
									style={{
										transitionDelay:
											state === 'open'
												? `${staggerFromEnd(index, actions.length, STAGGER_MS)}ms`
												: undefined,
									}}
									className={cn(
										'flex items-center gap-3 transition-[opacity,translate,scale]',
										ACTION_LOOK[state],
									)}
								>
									<span className="rounded-[var(--publy-radius-small-control)] bg-popover-surface px-3 py-2 text-sm font-medium whitespace-nowrap text-popover-foreground shadow-[var(--effect-popover)]">
										{action.label}
									</span>
									<span className="flex size-11 shrink-0 items-center justify-center rounded-[var(--publy-radius-control)] bg-card text-foreground shadow-[var(--effect-raised-control)]">
										{createElement(action.icon, {
											className: 'size-[19px]',
											'aria-hidden': true,
										})}
									</span>
								</button>
							);
						})}
					</div>
				</>
			) : null}
			<button
				ref={button}
				type="button"
				data-speed-dial=""
				onClick={() =>
					single ? single.onSelect() : setOpen((value) => !value)
				}
				aria-expanded={single ? undefined : open}
				aria-label={single?.label ?? label}
				className="fixed right-4 bottom-[calc(16px+env(safe-area-inset-bottom))] z-(--publy-z-fab) flex size-14 animate-[publy-speed-dial-in_350ms_var(--publy-motion-ease)] items-center justify-center rounded-[18px] bg-primary text-primary-foreground shadow-[var(--effect-primary-raised),var(--publy-shadow-menu)] md:hidden"
			>
				{single ? (
					createElement(single.icon, {
						className: 'size-6',
						'aria-hidden': true,
					})
				) : (
					<IconPlus
						aria-hidden="true"
						className={cn(
							'size-6 transition-transform duration-[280ms] ease-[var(--publy-motion-ease)]',
							open && 'rotate-45',
						)}
					/>
				)}
			</button>
		</>,
		document.body,
	);
};
