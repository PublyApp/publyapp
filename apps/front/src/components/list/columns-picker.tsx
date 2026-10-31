import {
	IconColumns3,
	IconGripVertical,
	IconPin,
	IconRestore,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '~/components/ui/popover';
import { cn } from '~/lib/utils';

import { hiddenColumns, moveColumn, toggleColumn } from './list-columns';
import type { ColumnSpecs } from './list-types';

/** A 2px insertion line above the row the dragged column would land before. */
const INSERT_ABOVE = 'shadow-[inset_0_2px_0_var(--primary)]';

/**
 * Columns (Shopkart OS `columns-picker.tsx`): the shown columns, reordered by
 * native drag-and-drop and ticked to hide; the hidden ones below, a click
 * adds one at the end; « Colonnes par défaut » resets the order (disabled
 * while already default). The first column is pinned.
 */
export const ColumnsPicker = ({
	shown,
	onChange,
	onReset,
	columns,
	locked,
	isDefault,
}: {
	shown: string[];
	onChange: (next: string[]) => void;
	onReset: () => void;
	columns: ColumnSpecs;
	locked: string;
	isDefault: boolean;
}) => {
	const { t } = useTranslation('common');
	const [dragged, setDragged] = useState<string | null>(null);
	const [over, setOver] = useState<string | null>(null);

	const end = () => {
		setDragged(null);
		setOver(null);
	};

	const drop = (before: string | null) => {
		if (dragged) {
			onChange(moveColumn(shown, dragged, before, locked));
		}
		end();
	};

	const hidden = hiddenColumns(shown, columns.keys());

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button variant="outline" className="hidden h-9 md:inline-flex" />
				}
			>
				<IconColumns3 data-icon="inline-start" />
				{t('list-columns')}
				<span className="rounded-[var(--publy-radius-chip)] bg-secondary px-1.5 text-xs tabular-nums">
					{shown.length}
				</span>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80">
				<div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
					<span className="min-w-0 flex-1 truncate">
						{t('list-columns-drag-hint')}
					</span>
					<span className="shrink-0 whitespace-nowrap">
						{t('list-columns-shown', { count: shown.length })}
					</span>
				</div>
				<ul
					onDragOver={(event) => event.preventDefault()}
					onDrop={() => drop(null)}
					className="max-h-80 overflow-y-auto"
				>
					{shown.map((id) => {
						const column = columns.get(id);
						if (!column) {
							return null;
						}

						const Icon = column.icon;
						const pinned = id === locked;
						return (
							<li
								key={id}
								draggable={!pinned}
								onDragStart={(event) => {
									event.dataTransfer.effectAllowed = 'move';
									event.dataTransfer.setData('text/plain', id);
									setDragged(id);
								}}
								onDragOver={(event) => {
									event.preventDefault();
									event.stopPropagation();
									setOver(pinned ? null : id);
								}}
								onDrop={(event) => {
									event.stopPropagation();
									drop(id);
								}}
								onDragEnd={end}
								className={cn(
									'flex h-8 items-center gap-2 rounded-[var(--publy-radius-menu-item)] px-2 text-sm hover:bg-secondary',
									over === id && dragged !== id && INSERT_ABOVE,
									dragged === id && 'opacity-50',
								)}
							>
								{pinned ? (
									<IconPin className="size-4 text-muted-foreground" />
								) : (
									<IconGripVertical className="size-4 cursor-grab text-muted-foreground" />
								)}
								<Checkbox
									checked
									disabled={pinned}
									aria-label={column.label}
									onCheckedChange={() =>
										onChange(toggleColumn(shown, id, locked))
									}
								/>
								<Icon
									aria-hidden="true"
									className="size-4 shrink-0 text-muted-foreground"
								/>
								<span className="truncate">{column.label}</span>
							</li>
						);
					})}
				</ul>
				{hidden.length > 0 ? (
					<>
						<p className="border-t px-2 pt-2 pb-1 text-xs text-muted-foreground">
							{t('list-columns-hidden')}
						</p>
						<ul>
							{hidden.map((id) => {
								const column = columns.get(id);
								if (!column) {
									return null;
								}

								const Icon = column.icon;
								return (
									<li key={id}>
										<button
											type="button"
											onClick={() => onChange(toggleColumn(shown, id, locked))}
											className="flex h-8 w-full items-center gap-2 rounded-[var(--publy-radius-menu-item)] px-2 text-left text-sm hover:bg-secondary"
										>
											<span className="size-4" />
											<span className="size-4 shrink-0 rounded-[2px] border-[1.5px] border-input" />
											<Icon
												aria-hidden="true"
												className="size-4 shrink-0 text-muted-foreground"
											/>
											<span className="truncate">{column.label}</span>
										</button>
									</li>
								);
							})}
						</ul>
					</>
				) : null}
				<Button
					variant="ghost"
					size="sm"
					className="mt-1 w-full justify-start"
					onClick={onReset}
					disabled={isDefault}
				>
					<IconRestore data-icon="inline-start" />
					{t('list-columns-reset')}
				</Button>
			</PopoverContent>
		</Popover>
	);
};
