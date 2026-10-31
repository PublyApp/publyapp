import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { cn } from '~/lib/utils';

/**
 * A non-modal anchored panel (Shopkart's popover): it follows its trigger
 * while the page scrolls, unlike a DropdownMenu (which is modal and locks
 * the page). Ported from Shopkart OS `ui/popover.tsx`, styled with PublyApp
 * tokens and the shared z-index scale.
 */
const Popover = (props: PopoverPrimitive.Root.Props) => (
	<PopoverPrimitive.Root data-slot="popover" {...props} />
);

const PopoverTrigger = (props: PopoverPrimitive.Trigger.Props) => (
	<PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
);

const PopoverContent = ({
	className,
	align = 'start',
	side = 'bottom',
	sideOffset = 6,
	collisionPadding = 16,
	...props
}: PopoverPrimitive.Popup.Props &
	Pick<
		PopoverPrimitive.Positioner.Props,
		'align' | 'side' | 'sideOffset' | 'collisionPadding'
	>) => (
	<PopoverPrimitive.Portal>
		<PopoverPrimitive.Positioner
			className="isolate z-(--publy-z-menu) outline-none"
			align={align}
			side={side}
			sideOffset={sideOffset}
			collisionPadding={collisionPadding}
		>
			<PopoverPrimitive.Popup
				data-slot="popover-content"
				className={cn(
					'z-(--publy-z-menu) max-h-(--available-height) origin-(--transform-origin) overflow-y-auto rounded-[var(--publy-radius-control)] border border-border/90 bg-popover/97 p-1 text-sm text-popover-foreground shadow-[var(--publy-shadow-menu)] backdrop-blur-sm outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
					className,
				)}
				{...props}
			/>
		</PopoverPrimitive.Positioner>
	</PopoverPrimitive.Portal>
);

export { Popover, PopoverContent, PopoverTrigger };
