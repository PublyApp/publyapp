import { IconInfoCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Field } from '~/components/field';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DrawerBody, DrawerFooter } from '~/components/ui/drawer';
import { IconColorPicker } from '~/components/ui/icon-color-picker';
import type { ProfileEditDetailsFormState } from '~/lib/profiles/use-profile-edit-details-form';

/** The one copy the two profile scopes do not share: the tenant surface names
 * the tenant in its placeholder (#980 keeps the catalogue split). */
type ProfileNamePlaceholderKey =
	| 'profile-name-placeholder'
	| 'tenant-profile-name-placeholder';

/**
 * The body and footer of the profile "edit details" drawer form, rendered
 * identically on the staff (`staff/profiles/$profileId`) and tenant
 * (`staff/tenants/$tenantId/profiles`) surfaces. The state comes from
 * `useProfileEditDetailsForm`; the `Drawer` / `DrawerContent` /
 * `DrawerHeader` shell and the `DrawerForm` itself stay in each route, because
 * each route is the drawer call site its `data-testid`, description and
 * cache wiring belong to.
 */
const ProfileEditDetailsFormContent = ({
	form,
	namePlaceholderKey,
}: {
	form: ProfileEditDetailsFormState;
	namePlaceholderKey: ProfileNamePlaceholderKey;
}) => {
	const { t } = useTranslation('common');
	const { t: tProfiles } = useTranslation('staff-tenant-profiles');
	const methods = form.methods;

	return (
		<>
			<DrawerBody className="space-y-5">
				<div className="space-y-1.5">
					<div className="grid items-end gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
						<IconColorPicker
							value={{
								icon: form.displayedStyle.icon,
								tone: form.displayedStyle.tone,
							}}
							disabled={form.isFormLocked}
							onChange={form.handleStyleChange}
						/>
						<Field.Text
							name="name"
							label={t('profile-name')}
							placeholder={t(namePlaceholderKey)}
							isDisabled={form.isFormLocked}
							fullWidth
						/>
					</div>
					<div className="flex min-h-6 items-center justify-between gap-3 text-xs sm:pl-[68px]">
						<p className="text-muted-foreground">
							{tProfiles('profile-icon-picker-hint')}
						</p>
						{form.hasCustomStyle ? (
							<Button
								type="button"
								variant="link"
								size="xs"
								disabled={form.isFormLocked}
								className="h-auto px-0 text-xs"
								onClick={form.restoreAutomaticStyle}
							>
								{tProfiles('restore-automatic-profile-style')}
							</Button>
						) : null}
					</div>
				</div>
				<Field.Textarea
					name="description"
					label={t('description')}
					placeholder={t('profile-description-placeholder')}
					rows={5}
					isDisabled={form.isFormLocked}
				/>
				<div className="flex items-start gap-2.5 rounded-[var(--publy-radius-card)] bg-muted/40 p-3 text-sm text-muted-foreground shadow-[var(--publy-shadow-ring)]">
					<IconInfoCircle
						aria-hidden="true"
						className="mt-0.5 size-4 shrink-0"
					/>
					<p>{tProfiles('profile-details-management-note')}</p>
				</div>
				{methods.formState.errors.root?.server?.message ? (
					<p className="text-sm text-destructive" role="alert">
						{methods.formState.errors.root.server.message}
					</p>
				) : null}
			</DrawerBody>
			<DrawerFooter>
				<Button
					type="button"
					variant="ghost"
					disabled={form.isFormLocked}
					onClick={form.requestClose}
				>
					{t('cancel')}
				</Button>
				<Button type="submit" disabled={!form.canSave}>
					{t('save-changes')}
				</Button>
			</DrawerFooter>
		</>
	);
};

/** The discard-confirmation both profile drawers show when a dirty draft is
 * dismissed; it is a sibling of `DrawerContent`, never nested inside it. */
const ProfileEditDetailsDiscardDialog = ({
	form,
}: {
	form: ProfileEditDetailsFormState;
}) => {
	const { t } = useTranslation('common');

	return (
		<ConfirmDialog
			isOpen={form.isDiscardConfirmOpen}
			title={t('unsaved-changes-dialog-title')}
			description={t('unsaved-changes-dialog-description')}
			confirmLabel={t('leave-page')}
			tone="danger"
			onOpenChange={form.setDiscardConfirmOpen}
			onConfirm={form.confirmLeave}
		/>
	);
};

export { ProfileEditDetailsDiscardDialog, ProfileEditDetailsFormContent };
