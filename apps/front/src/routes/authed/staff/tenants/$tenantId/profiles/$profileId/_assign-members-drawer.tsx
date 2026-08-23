import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';

import { useAssignMembersState } from './_assign-members-state-hook';
import { AssignMembersTable } from './_assign-members-table';

export const AssignMembersDrawer = ({
	tenantId,
	profileId,
	isOpen,
	onOpenChange,
	onSessionExpired,
}: {
	tenantId: string;
	profileId: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const {
		controller,
		usersQuery,
		rows,
		resolutionQuery,
		assignedIds,
		resolvedIds,
		pendingIds,
		handleToggle,
	} = useAssignMembersState({
		tenantId,
		profileId,
		isOpen,
		onSessionExpired,
	});

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) {
					onOpenChange(false);
				}
			}}
		>
			<DrawerContent data-testid="assign-members-drawer">
				<DrawerHeader>
					<DrawerTitle>{t('assign-members')}</DrawerTitle>
					<DrawerDescription>
						{t('assign-members-drawer-description')}
					</DrawerDescription>
				</DrawerHeader>
				<DrawerBody className="flex min-h-0 flex-1 flex-col gap-3">
					<AssignMembersTable
						tenantId={tenantId}
						t={t}
						assignedIds={assignedIds}
						resolvedIds={resolvedIds}
						pendingIds={pendingIds}
						onToggle={(row, checked) => {
							void handleToggle(row, checked);
						}}
						rows={rows}
						usersQuery={usersQuery}
						controller={controller}
						resolutionQuery={resolutionQuery}
					/>
				</DrawerBody>
				<DrawerFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						{t('close')}
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
};
