import { Popover } from '@base-ui/react/popover';
import {
	IconAdjustments,
	IconBriefcase,
	IconBuilding,
	IconCalendar,
	IconChartBar,
	IconKey,
	IconLock,
	IconMail,
	IconMessage,
	IconPencil,
	IconPhoto,
	IconSettings,
	IconShieldCheck,
	IconStar,
	IconUsersGroup,
	IconWorld,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterInput } from '~/components/ui/filter-input';
import { cn } from '~/lib/utils';

type IconColorPickerValue = {
	icon?: string;
	tone?: string;
};

type IconColorPickerProps = {
	value: IconColorPickerValue;
	onChange: (next: IconColorPickerValue) => void;
	disabled?: boolean;
	'aria-label'?: string;
};

type IconOption = {
	name: string;
	labelKey: string;
	Icon: Icon;
};

const ICON_OPTIONS: readonly IconOption[] = [
	{
		name: 'shield-check',
		labelKey: 'profile-icon-shield-check',
		Icon: IconShieldCheck,
	},
	{ name: 'key', labelKey: 'profile-icon-key', Icon: IconKey },
	{ name: 'lock', labelKey: 'profile-icon-lock', Icon: IconLock },
	{ name: 'star', labelKey: 'profile-icon-star', Icon: IconStar },
	{
		name: 'briefcase',
		labelKey: 'profile-icon-briefcase',
		Icon: IconBriefcase,
	},
	{
		name: 'adjustments',
		labelKey: 'profile-icon-adjustments',
		Icon: IconAdjustments,
	},
	{
		name: 'users-group',
		labelKey: 'profile-icon-users-group',
		Icon: IconUsersGroup,
	},
	{
		name: 'settings',
		labelKey: 'profile-icon-settings',
		Icon: IconSettings,
	},
	{ name: 'pencil', labelKey: 'profile-icon-pencil', Icon: IconPencil },
	{ name: 'photo', labelKey: 'profile-icon-photo', Icon: IconPhoto },
	{
		name: 'calendar',
		labelKey: 'profile-icon-calendar',
		Icon: IconCalendar,
	},
	{
		name: 'chart-bar',
		labelKey: 'profile-icon-chart-bar',
		Icon: IconChartBar,
	},
	{
		name: 'message',
		labelKey: 'profile-icon-message',
		Icon: IconMessage,
	},
	{ name: 'mail', labelKey: 'profile-icon-mail', Icon: IconMail },
	{ name: 'world', labelKey: 'profile-icon-world', Icon: IconWorld },
	{
		name: 'building',
		labelKey: 'profile-icon-building',
		Icon: IconBuilding,
	},
];

const PROFILE_TONES = ['0', '1', '2', '3', '4', '5', '6', '7'] as const;
const DEFAULT_ICON_OPTION = ICON_OPTIONS[0] as IconOption;
const DEFAULT_TONE = PROFILE_TONES[0];

const getIconColorPickerOption = (icon?: string): IconOption | undefined =>
	ICON_OPTIONS.find((option) => option.name === icon);

export const getIconColorPickerIcon = (icon?: string): Icon | undefined =>
	getIconColorPickerOption(icon)?.Icon;

const getIconColorPickerTone = (tone?: string): string | undefined =>
	PROFILE_TONES.find((option) => option === tone);

const IconColorPicker = ({
	value,
	onChange,
	disabled = false,
	'aria-label': ariaLabel,
}: IconColorPickerProps) => {
	const { t } = useTranslation('staff-tenant-profiles');
	const [search, setSearch] = useState('');
	const activeIconOption =
		getIconColorPickerOption(value.icon) ?? DEFAULT_ICON_OPTION;
	const activeTone = getIconColorPickerTone(value.tone) ?? DEFAULT_TONE;
	const filteredIconOptions = useMemo(() => {
		const query = search.trim().toLocaleLowerCase();
		if (!query) {
			return ICON_OPTIONS;
		}

		return ICON_OPTIONS.filter((option) => {
			const label = t(option.labelKey).toLocaleLowerCase();
			return label.includes(query) || option.name.includes(query);
		});
	}, [search, t]);

	return (
		<Popover.Root onOpenChange={(open) => !open && setSearch('')}>
			<Popover.Trigger
				type="button"
				disabled={disabled}
				aria-label={ariaLabel ?? t('choose-icon-and-color')}
				className="publy-profile-detail-tile cursor-pointer transition-[filter,box-shadow] hover:brightness-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
				data-tone={activeTone}
			>
				<activeIconOption.Icon aria-hidden="true" className="size-6" />
			</Popover.Trigger>

			<Popover.Portal>
				<Popover.Positioner sideOffset={8} align="start" className="z-50">
					<Popover.Popup className="w-[min(320px,calc(100vw-24px))] rounded-[var(--publy-radius-card)] bg-popover p-4 text-popover-foreground shadow-[var(--publy-shadow-ring)] outline-none">
						<section aria-labelledby="icon-color-picker-color-heading">
							<h2
								id="icon-color-picker-color-heading"
								className="text-xs font-semibold text-foreground"
							>
								{t('choose-color')}
							</h2>
							<div className="mt-2 flex flex-wrap gap-2">
								{PROFILE_TONES.map((tone) => {
									const color = t(`profile-tone-${tone}`);

									return (
										<button
											key={tone}
											type="button"
											aria-label={t('choose-profile-tone', { color })}
											aria-pressed={activeTone === tone}
											className={cn(
												'publy-profile-icon-tile transition-[box-shadow,filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring',
												activeTone === tone && 'ring-2 ring-ring',
											)}
											data-tone={tone}
											onClick={() =>
												onChange({ icon: activeIconOption.name, tone })
											}
										>
											<span
												aria-hidden="true"
												className="size-2 rounded-[3px] bg-current"
											/>
										</button>
									);
								})}
							</div>
						</section>

						<section
							aria-labelledby="icon-color-picker-icon-heading"
							className="mt-4"
						>
							<h2
								id="icon-color-picker-icon-heading"
								className="text-xs font-semibold text-foreground"
							>
								{t('choose-icon')}
							</h2>
							<FilterInput
								value={search}
								onValueChange={setSearch}
								aria-label={t('profile-icon-search')}
								placeholder={t('profile-icon-search-placeholder')}
								clearLabel={t('clear-profile-icon-search')}
								className="mt-2 h-9"
							/>
							<div className="mt-3 grid max-h-48 grid-cols-4 gap-2 overflow-y-auto p-0.5">
								{filteredIconOptions.map((option) => {
									const label = t(option.labelKey);

									return (
										<button
											key={option.name}
											type="button"
											aria-label={label}
											aria-pressed={activeIconOption.name === option.name}
											title={label}
											className={cn(
												'flex h-10 items-center justify-center rounded-[var(--publy-radius-input)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring',
												activeIconOption.name === option.name &&
													'bg-muted text-foreground',
											)}
											onClick={() =>
												onChange({ icon: option.name, tone: activeTone })
											}
										>
											<option.Icon aria-hidden="true" className="size-5" />
										</button>
									);
								})}
							</div>
						</section>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
};

export { IconColorPicker };
export type { IconColorPickerProps, IconColorPickerValue };
