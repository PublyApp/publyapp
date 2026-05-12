import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import type { TFunction } from 'i18next';
import map from 'lodash/map';

import { useTranslate } from '#app/hooks/use-translate.ts';
import { dayjs, type Dayjs } from '#app/utils/format-time.ts';

import type { DateRange, DateRangePreset } from './date-range-filter.types';

type PresetEntry = {
	id: Exclude<DateRangePreset, 'custom'>;
	getLabel: (t: TFunction) => string;
	compute: () => DateRange;
};

const startOf = (d: Dayjs) => d.startOf('day');
const endOf = (d: Dayjs) => d.endOf('day');

export const DATE_RANGE_PRESETS: PresetEntry[] = [
	{
		id: 'today',
		getLabel: (t) => t('today'),
		compute: () => ({
			from: startOf(dayjs()),
			to: endOf(dayjs()),
		}),
	},
	{
		id: 'yesterday',
		getLabel: (t) => t('yesterday'),
		compute: () => ({
			from: startOf(dayjs().subtract(1, 'day')),
			to: endOf(dayjs().subtract(1, 'day')),
		}),
	},
	{
		id: 'last-7-days',
		getLabel: (t) => t('last-n-days', { count: 7 }),
		compute: () => ({
			from: startOf(dayjs().subtract(6, 'day')),
			to: endOf(dayjs()),
		}),
	},
	{
		id: 'last-30-days',
		getLabel: (t) => t('last-n-days', { count: 30 }),
		compute: () => ({
			from: startOf(dayjs().subtract(29, 'day')),
			to: endOf(dayjs()),
		}),
	},
	{
		id: 'last-90-days',
		getLabel: (t) => t('last-n-days', { count: 90 }),
		compute: () => ({
			from: startOf(dayjs().subtract(89, 'day')),
			to: endOf(dayjs()),
		}),
	},
];

const rangesEqual = (a: DateRange, b: DateRange): boolean => {
	const sameFrom =
		(a.from === null && b.from === null) ||
		(a.from != null && b.from != null && a.from.isSame(b.from, 'day'));
	const sameTo =
		(a.to === null && b.to === null) ||
		(a.to != null && b.to != null && a.to.isSame(b.to, 'day'));
	return sameFrom && sameTo;
};

export const activePresetFor = (value: DateRange): DateRangePreset => {
	if (value.from === null && value.to === null) {
		return 'custom';
	}
	const match = DATE_RANGE_PRESETS.find((p) => rangesEqual(p.compute(), value));
	return match?.id ?? 'custom';
};

type DateRangeFilterPresetsProps = {
	active: DateRangePreset;
	onSelectPreset: (next: DateRange) => void;
};

export const DateRangeFilterPresets = ({
	active,
	onSelectPreset,
}: DateRangeFilterPresetsProps) => {
	const { t } = useTranslate();

	return (
		<Box
			sx={{
				display: 'flex',
				flexDirection: 'column',
				gap: 0.5,
				p: 1,
				borderRight: '1px solid',
				borderColor: 'divider',
				minWidth: 160,
			}}
		>
			{map(DATE_RANGE_PRESETS, (preset) => (
				<Button
					key={preset.id}
					size="small"
					variant={active === preset.id ? 'contained' : 'text'}
					color={active === preset.id ? 'primary' : 'inherit'}
					sx={{ justifyContent: 'flex-start' }}
					onClick={() => onSelectPreset(preset.compute())}
				>
					{preset.getLabel(t as TFunction)}
				</Button>
			))}
		</Box>
	);
};
