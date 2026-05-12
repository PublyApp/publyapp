import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
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
					placeholder={searchPlaceholder ?? t('search')}
					InputProps={{
						startAdornment: (
							<InputAdornment position="start">
								<Iconify icon="eva:search-fill" width={16} />
							</InputAdornment>
						),
					}}
				/>
			</Box>
			<Box sx={{ overflowY: 'auto', flexGrow: 1 }}>
				{loading ? (
					map([0, 1, 2, 3, 4], (i) => (
						<Box key={i} sx={{ px: 1.5, py: 0.5 }}>
							<Skeleton variant="text" />
						</Box>
					))
				) : filtered.length === 0 ? (
					<Box sx={{ p: 2, textAlign: 'center' }}>
						<Typography variant="body2" sx={{ color: 'text.secondary' }}>
							{emptyLabel ?? t('no-results-found')}
						</Typography>
					</Box>
				) : (
					map(grouped, (section) => (
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
								<FormControlLabel
									key={opt.value}
									sx={{
										display: 'flex',
										mx: 0,
										px: 1.5,
										py: 0.25,
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
											}}
										>
											{opt.label}
										</Typography>
									}
								/>
							))}
						</Box>
					))
				)}
			</Box>
		</Box>
	);
};
