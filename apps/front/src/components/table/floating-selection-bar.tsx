import { IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';

const EXIT_ANIMATION_MS = 220;

export const FLOATING_SELECTION_BAR_ACTION_BUTTON_CLASS_NAME =
	'h-8 rounded-[10px] px-2.5 text-[13px]';
const FLOATING_SELECTION_BAR_ICON_BUTTON_CLASS_NAME = 'size-8 rounded-[10px]';

export type FloatingSelectionBarProps = {
	selectedCount: number;
	visibleCount: number;
	allVisibleSelected: boolean;
	onClear: () => void;
	onSelectAllVisible: () => void;
	children: ReactNode;
};

/** Floating bottom-center selection action bar (design-002 / gray-ui parity).
 * Portalled to `document.body` — `.app-shell-main` sets
 * `container-type: inline-size`, which establishes a containing block for
 * `position: fixed` descendants, so a non-portalled bar would be trapped
 * inside the scroll area instead of pinned to the viewport. */
export const FloatingSelectionBar = ({
	selectedCount,
	visibleCount,
	allVisibleSelected,
	onClear,
	onSelectAllVisible,
	children,
}: FloatingSelectionBarProps) => {
	const { t } = useTranslation('common');
	const [shouldRender, setShouldRender] = useState(selectedCount > 0);
	const [isVisible, setIsVisible] = useState(selectedCount > 0);
	const exitTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		if (exitTimeoutRef.current !== null) {
			window.clearTimeout(exitTimeoutRef.current);
			exitTimeoutRef.current = null;
		}

		if (selectedCount > 0) {
			const frameId = window.requestAnimationFrame(() => {
				setShouldRender(true);
				setIsVisible(true);
			});

			return () => window.cancelAnimationFrame(frameId);
		}

		const timeoutId = window.setTimeout(() => {
			setIsVisible(false);
			exitTimeoutRef.current = window.setTimeout(() => {
				setShouldRender(false);
				exitTimeoutRef.current = null;
			}, EXIT_ANIMATION_MS);
		}, 0);

		return () => {
			window.clearTimeout(timeoutId);
			if (exitTimeoutRef.current !== null) {
				window.clearTimeout(exitTimeoutRef.current);
				exitTimeoutRef.current = null;
			}
		};
	}, [selectedCount]);

	if (!shouldRender) {
		return null;
	}

	const showSelectAllVisible =
		selectedCount > 0 && selectedCount < visibleCount && !allVisibleSelected;

	// React-doctor/no-unguarded-browser-global-in-render-or-hook-init: the
	// portal target (`document.body`) is a browser global. `FloatingSelectionBar`
	// is only ever mounted under authenticated surfaces that are CSR-only
	// (`apps/front/src/routes/authed/**` is registered with `ssr: false` via
	// the authed route group), so `document` is always defined when this
	// component renders in the browser. Guard the access explicitly so a
	// future call site that mounts it under an SSR surface does not
	// crash on the server, and so the rule's detector sees the guard.
	if (typeof document === 'undefined') {
		return null;
	}

	return createPortal(
		<div
			className="pointer-events-none fixed z-(--publy-z-selection-bar) flex justify-center px-1 sm:px-2"
			style={{
				bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
				left: 0,
				width: '100%',
			}}
		>
			<div
				data-testid="floating-selection-bar"
				className={cn(
					'publy-selection-bar pointer-events-auto flex w-fit max-w-full transform-gpu items-center gap-1 overflow-x-auto rounded-2xl border px-1.5 py-1.5 will-change-[transform,opacity]',
					'transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
					isVisible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
				)}
			>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className={FLOATING_SELECTION_BAR_ICON_BUTTON_CLASS_NAME}
					onClick={onClear}
					aria-label={t('clear-selection')}
				>
					<IconX className="size-4" />
				</Button>

				<div className="publy-selection-bar-divider flex h-8 shrink-0 items-center gap-1.5 border-r pr-2">
					<span className="text-xs font-medium sm:text-sm" aria-live="polite">
						{t('selected-count', { count: selectedCount })}
					</span>
					{showSelectAllVisible ? (
						<>
							<span aria-hidden="true" className="publy-selection-bar-muted">
								•
							</span>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-7 rounded-md px-2 text-xs font-medium underline-offset-4 hover:underline"
								onClick={onSelectAllVisible}
							>
								{t('select-all-visible', { count: visibleCount })}
							</Button>
						</>
					) : null}
				</div>

				<div className="flex items-center gap-1">{children}</div>
			</div>
		</div>,
		document.body,
	);
};
