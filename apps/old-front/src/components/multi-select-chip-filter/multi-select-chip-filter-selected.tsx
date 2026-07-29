import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import map from 'lodash/map';

import { useTranslate } from '#app/hooks/use-translate.ts';

import type { MultiSelectChipFilterOption } from './multi-select-chip-filter.types';

type Props = {
	options: MultiSelectChipFilterOption[];
	selected: string[];
	onRemove: (value: string) => void;
	onClearAll: () => void;
};

export const MultiSelectChipFilterSelected = ({
	options,
	selected,
	onRemove,
	onClearAll,
}: Props) => {
	const { t } = useTranslate();
	const byValue = new Map(options.map((o) => [o.value, o]));

	return (
		<Box
			sx={{
				display: 'flex',
				flexDirection: 'column',
				width: 280,
				maxHeight: 360,
				borderLeft: '1px solid',
				borderColor: 'divider',
			}}
		>
			<Box
				sx={{
					flexGrow: 1,
					overflowY: 'auto',
					p: 1.5,
					display: 'flex',
					flexWrap: 'wrap',
					gap: 0.5,
					alignContent: 'flex-start',
				}}
			>
				{selected.length === 0 ? (
					<Typography variant="body2" sx={{ color: 'text.disabled' }}>
						{t('selected-count', { count: 0 })}
					</Typography>
				) : (
					map(selected, (val) => {
						const opt = byValue.get(val);
						return (
							<Chip
								key={val}
								size="small"
								label={opt?.label ?? val}
								onDelete={() => onRemove(val)}
								sx={{
									fontFamily: 'monospace',
									fontSize: '0.75rem',
								}}
							/>
						);
					})
				)}
			</Box>
			<Box
				sx={{
					p: 1,
					borderTop: '1px solid',
					borderColor: 'divider',
					display: 'flex',
					justifyContent: 'flex-end',
				}}
			>
				<Button
					size="small"
					color="inherit"
					onClick={onClearAll}
					disabled={selected.length === 0}
				>
					{t('clear-all')}
				</Button>
			</Box>
		</Box>
	);
};
