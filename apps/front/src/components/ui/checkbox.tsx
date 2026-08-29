import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { IconCheck, IconMinus } from '@tabler/icons-react';
import { cn } from '~/lib/utils';

const Checkbox = ({ className, ...props }: CheckboxPrimitive.Root.Props) => {
	return (
		<CheckboxPrimitive.Root
			data-slot="checkbox"
			className={cn(
				'flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-[color:var(--publy-border-strong)] bg-background transition-shadow outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground',
				className,
			)}
			{...props}
		>
			<CheckboxPrimitive.Indicator
				data-slot="checkbox-indicator"
				className="grid place-content-center text-current"
			>
				{props.indeterminate ? (
					<IconMinus data-icon="minus" className="size-3.5 stroke-[2.5]" />
				) : (
					<IconCheck data-icon="check" className="size-3.5 stroke-[2.5]" />
				)}
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
};

export { Checkbox };
