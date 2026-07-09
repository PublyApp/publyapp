import { IconDots } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Button } from '~/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';

/**
 * Trailing ⋯ row menu for data tables: 28px ghost trigger opening a 196px
 * Gray UI menu. Compose items with DropdownMenuItem/DropdownMenuSeparator.
 */
export const DataTableRowActions = ({
	ariaLabel,
	children,
	testId,
}: {
	ariaLabel: string;
	children: ReactNode;
	testId?: string;
}) => (
	<DropdownMenu>
		<DropdownMenuTrigger
			render={
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={ariaLabel}
					data-testid={testId}
					className="size-7 text-muted-foreground"
				/>
			}
		>
			<IconDots className="size-4" />
		</DropdownMenuTrigger>
		<DropdownMenuContent align="end" sideOffset={6}>
			{children}
		</DropdownMenuContent>
	</DropdownMenu>
);
