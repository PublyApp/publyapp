import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ListPanelEntry = {
	key: string;
	label: string;
	icon: ReactNode;
	count: number;
	active: boolean;
	onClick: () => void;
};

export type ListPanelGroup = {
	key: string;
	title: string;
	entries: ListPanelEntry[];
};

const PanelGroup = ({ group }: { group: ListPanelGroup }) => {
	if (group.entries.length === 0) {
		return null;
	}

	return (
		<div
			className="flex flex-col border-b px-4 py-2"
			data-list-panel-group={group.key}
		>
			<div className="flex h-8 items-center px-2 font-mono text-sm font-medium text-sidebar-foreground opacity-65">
				{group.title}
			</div>
			{group.entries.map((entry) => (
				<button
					key={entry.key}
					type="button"
					data-active={entry.active || undefined}
					onClick={entry.onClick}
					className="flex h-11 items-center gap-2 rounded-[var(--publy-radius-md)] px-2 text-sm text-sidebar-foreground hover:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground data-active:shadow-[var(--publy-shadow-chrome)] md:h-8 [&_svg]:size-4 [&_svg]:shrink-0"
				>
					{entry.icon}
					<span className="truncate">{entry.label}</span>
					<span className="ml-auto text-xs tabular-nums opacity-70">
						{entry.count}
					</span>
				</button>
			))}
		</div>
	);
};

/**
 * A list page's side panel (Shopkart OS `filter-panel.tsx`): one group per
 * panel filter, each entry carrying its count. Portalled into the staff
 * shell's panel slot, which only exists from `lg` — below that the shell has
 * no panel and the filter menu alone drives the list.
 */
export const ListFilterPanel = ({
	groups,
	targetId,
}: {
	groups: ListPanelGroup[];
	targetId: string;
}) => {
	const [target, setTarget] = useState<HTMLElement | null>(null);

	// The shell's slot is committed before this page's effect runs: portal
	// after mount, never during a render that cannot yet see it.
	useEffect(() => {
		// oxlint-disable-next-line react/set-state-in-effect -- the portal target must exist in the committed DOM
		setTarget(document.getElementById(targetId));
	}, [targetId]);

	if (!target) {
		return null;
	}

	return createPortal(
		<div className="flex flex-col" data-list-filter-panel="">
			{groups.map((group) => (
				<PanelGroup key={group.key} group={group} />
			))}
		</div>,
		target,
	);
};
