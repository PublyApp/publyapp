import Tooltip from '@mui/material/Tooltip';
import type { ReactElement } from 'react';

type SelectionLockedControlProps = {
	isSelectionMode: boolean;
	disabledReason: string;
	describeChild?: boolean;
	tooltipId?: string;
	children: ReactElement;
};

export const SelectionLockedControl = ({
	isSelectionMode,
	disabledReason,
	describeChild,
	tooltipId,
	children,
}: SelectionLockedControlProps) => {
	return (
		<Tooltip
			title={isSelectionMode ? disabledReason : ''}
			arrow
			describeChild={describeChild}
			disableHoverListener={!isSelectionMode}
			slotProps={tooltipId ? { tooltip: { id: tooltipId } } : undefined}
		>
			{children}
		</Tooltip>
	);
};
