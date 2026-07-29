import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import filter from 'lodash/filter';
import map from 'lodash/map';
import { useMemo, useState } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import type { MultiSelectChipFilterOption } from './multi-select-chip-filter.types';

type Props = {
	options: MultiSelectChipFilterOption[];
	selected: string[];
	onToggle: (value: string) => void;
	loading?: boolean;
	searchPlaceholder?: string;
	emptyLabel?: string;
	groupOrder?: string[];
};

type GroupedSection = {
	group: string | null;
	items: MultiSelectChipFilterOption[];
};

const LOADING_ROW_KEYS = [
	'loading-row-one',
	'loading-row-two',
	'loading-row-three',
	'loading-row-four',
	'loading-row-five',
];

type RenderBodyArgs = {
	loading?: boolean;
	grouped: GroupedSection[];
	filteredCount: number;
	emptyLabel: string;
	selected: string[];
	onToggle: (value: string) => void;
};

const MultiSelectChipFilterListBody = ({
	loading,
	grouped,
	filteredCount,
	emptyLabel,
	selected,
	onToggle,
}: RenderBodyArgs) => {
	if (loading) {
		return map(LOADING_ROW_KEYS, (key) => (
			<Box key={key} sx={{ px: 1.5, py: 0.5 }}>
				<Skeleton variant="text" />
			</Box>
		));
	}
	if (filteredCount === 0) {
		return (
			<Box sx={{ p: 2, textAlign: 'center' }}>
				<Typography variant="body2" sx={{ color: 'text.secondary' }}>
					{emptyLabel}
				</Typography>
			</Box>
		);
	}
	return map(grouped, (section) => (
		<Box key={section.group ?? '_'} sx={{ py: 0.5 }}>
			{section.group && (
				<Typography
					variant="overline"
					sx={{
						display: 'block',
						px: 1.5,
						color: 'text.secondary',
					}}
				>
					{section.group}
				</Typography>
			)}
			{map(section.items, (opt) => (
				<Tooltip
					key={opt.value}
					title={opt.label}
					placement="right"
					enterDelay={600}
					enterNextDelay={300}
				>
					<FormControlLabel
						sx={{
							display: 'flex',
							mx: 0,
							px: 1.5,
							py: 0.25,
							overflow: 'hidden',
							'& .MuiFormControlLabel-label': {
								flexGrow: 1,
								minWidth: 0,
								overflow: 'hidden',
							},
							'&:hover': { bgcolor: 'action.hover' },
						}}
						control={
							<Checkbox
								size="small"
								checked={selected.includes(opt.value)}
								onChange={() => onToggle(opt.value)}
							/>
						}
						label={
							<Typography
								variant="body2"
								sx={{
									fontFamily: 'monospace',
									fontSize: '0.8rem',
									whiteSpace: 'nowrap',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
								}}
							>
								{opt.label}
							</Typography>
						}
					/>
				</Tooltip>
			))}
		</Box>
	));
};

const groupOptions = (
	options: MultiSelectChipFilterOption[],
	explicitOrder?: string[],
): GroupedSection[] => {
	const hasGroups = options.some((o) => o.group);
	if (!hasGroups) {
		return [{ group: null, items: options }];
	}
	const byGroup = new Map<string, MultiSelectChipFilterOption[]>();
	for (const opt of options) {
		const key = opt.group ?? '';
		const list = byGroup.get(key) ?? [];
		list.push(opt);
		byGroup.set(key, list);
	}
	const allKeys = [...byGroup.keys()];
	const sortedKeys = explicitOrder
		? [
				...explicitOrder.filter((k) => byGroup.has(k)),
				...allKeys.filter((k) => !explicitOrder.includes(k)).sort(),
			]
		: allKeys.sort();
	return sortedKeys.map((key) => ({
		group: key,
		items: byGroup.get(key) ?? [],
	}));
};

export const MultiSelectChipFilterList = ({
	options,
	selected,
	onToggle,
	loading,
	searchPlaceholder,
	emptyLabel,
	groupOrder,
}: Props) => {
	const { t } = useTranslate();
	const [search, setSearch] = useState('');
	const searchLabel = searchPlaceholder ?? t('search');

	const filtered = useMemo(() => {
		const needle = search.trim().toLowerCase();
		if (!needle) return options;
		return filter(options, (o) => o.label.toLowerCase().includes(needle));
	}, [options, search]);

	const grouped = useMemo(
		() => groupOptions(filtered, groupOrder),
		[filtered, groupOrder],
	);

	return (
		<Box
			sx={{
				display: 'flex',
				flexDirection: 'column',
				width: 280,
				maxHeight: 360,
			}}
		>
			<Box
				sx={{
					p: 1,
					borderBottom: '1px solid',
					borderColor: 'divider',
				}}
			>
				<TextField
					size="small"
					fullWidth
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder={searchLabel}
					slotProps={{
						htmlInput: {
							'aria-label': searchLabel,
						},
						input: {
							startAdornment: (
								<InputAdornment position="start">
									<Iconify icon="eva:search-fill" width={16} />
								</InputAdornment>
							),
						},
					}}
				/>
			</Box>
			<Box sx={{ overflowY: 'auto', overflowX: 'hidden', flexGrow: 1 }}>
				<MultiSelectChipFilterListBody
					loading={loading}
					grouped={grouped}
					filteredCount={filtered.length}
					emptyLabel={emptyLabel ?? t('no-results-found')}
					selected={selected}
					onToggle={onToggle}
				/>
			</Box>
		</Box>
	);
};
