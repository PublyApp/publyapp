import { Popover } from '@base-ui/react/popover';
import { IconPencil } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	DEFAULT_ICON_COLOR_PICKER_OPTION,
	getIconColorPickerOption,
	ICON_COLOR_PICKER_OPTIONS,
} from '~/components/ui/icon-color-picker-options';
import { ScrollArea } from '~/components/ui/scroll-area';
import { SearchInput } from '~/components/ui/search-input';
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

const PROFILE_TONES = ['0', '1', '2', '3', '4', '5', '6', '7'] as const;
const DEFAULT_TONE = PROFILE_TONES[0];

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
		getIconColorPickerOption(value.icon) ?? DEFAULT_ICON_COLOR_PICKER_OPTION;
	const activeTone = getIconColorPickerTone(value.tone) ?? DEFAULT_TONE;
	const filteredIconOptions = useMemo(() => {
		const query = search.trim().toLocaleLowerCase();
		if (!query) {
			return ICON_COLOR_PICKER_OPTIONS;
		}

		return ICON_COLOR_PICKER_OPTIONS.filter((option) => {
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
				{/* Decorative-only affordance pin (#992): the tile gave no sign it
				opens a picker. Purely visual — aria-hidden + pointer-events-none so
				it cannot become a nested interactive element inside this trigger
				button, and it follows the trigger's own disabled:opacity-50. */}
				<span
					aria-hidden="true"
					data-testid="profile-icon-picker-pin"
					className="publy-profile-detail-tile-pin pointer-events-none ring-2 ring-background"
				>
					<IconPencil aria-hidden="true" className="size-3.5" />
				</span>
			</Popover.Trigger>

			<Popover.Portal>
				<Popover.Positioner
					sideOffset={8}
					align="start"
					className="z-(--publy-z-menu)"
				>
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
							<SearchInput
								value={search}
								onValueChange={setSearch}
								aria-label={t('profile-icon-search')}
								placeholder={t('profile-icon-search-placeholder')}
								clearLabel={t('clear-profile-icon-search')}
								size="compact"
								className="mt-2"
							/>
							<ScrollArea
								scrollAreaLabel={t('common:scroll-area-label')}
								className="mt-3 max-h-48"
							>
								<div className="grid grid-cols-4 gap-2 p-0.5">
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
							</ScrollArea>
						</section>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
};

export { IconColorPicker };
