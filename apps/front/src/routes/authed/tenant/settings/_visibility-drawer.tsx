import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Field } from '~/components/field';
import { Button } from '~/components/ui/button';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerFooter,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import {
	SOCIAL_VISIBILITIES,
	type SocialAccountRow,
	useSetSocialAccountVisibilityMutation,
} from '~/lib/query/social-accounts';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

/** Option label keys (explicit `settings:` prefix, see social-accounts.ts). */
const VISIBILITY_LABEL_KEYS = {
	public: 'settings:visibility-public',
	unlisted: 'settings:visibility-unlisted',
	private: 'settings:visibility-private',
} as const satisfies Record<(typeof SOCIAL_VISIBILITIES)[number], string>;

const schema = z.object({ visibility: z.enum(SOCIAL_VISIBILITIES) });
type FormValues = z.infer<typeof schema>;

/** Default visibility of one Mastodon / Pixelfed account (#2186): every post
 * published to it from now on is sent with it; posts already published keep theirs. */
export const VisibilityDrawer = ({
	account,
	tenantId,
	onOpenChange,
}: {
	/** Null while closed. */
	account: SocialAccountRow | null;
	tenantId: string;
	onOpenChange: (open: boolean) => void;
}) => {
	const { t } = useTranslation(['settings', 'common']);
	const mutation = useSetSocialAccountVisibilityMutation();
	const options = useMemo(
		() =>
			SOCIAL_VISIBILITIES.map((value) => ({
				value,
				label: t(VISIBILITY_LABEL_KEYS[value]),
			})),
		[t],
	);
	const methods = useForm<FormValues>({
		resolver: zodResolver(schema),
		values: { visibility: account?.defaultVisibility ?? 'public' },
	});

	const onSubmit = methods.handleSubmit(async (values) => {
		if (account === null) {
			return;
		}
		try {
			await mutation.mutateAsync({
				tenantId,
				socialAccountId: account.id,
				visibility: values.visibility,
			});
			onOpenChange(false);
		} catch (error) {
			methods.setError('root', {
				message: getFailureMessage(toApiFailure(error), {
					fallback: t('common:an-error-occurred'),
				}),
			});
		}
	});

	return (
		<Drawer
			open={account !== null}
			onOpenChange={(next) => {
				if (!next) {
					methods.reset();
				}
				onOpenChange(next);
			}}
		>
			<DrawerContent data-testid="social-account-visibility-drawer">
				<DrawerHeader>
					<DrawerTitle>
						{t('settings:visibility-title', {
							handle: account?.displayHandle ?? '',
						})}
					</DrawerTitle>
				</DrawerHeader>
				<DrawerForm methods={methods} onSubmit={onSubmit}>
					<DrawerBody>
						<Field.Select
							name="visibility"
							label={t('settings:visibility-label')}
							options={options}
							helperText={t('settings:visibility-help')}
							isDisabled={mutation.isPending}
						/>
						{methods.formState.errors.root?.message ? (
							<p role="alert" className="text-destructive text-sm">
								{methods.formState.errors.root.message}
							</p>
						) : null}
					</DrawerBody>
					<DrawerFooter>
						<Button type="submit" disabled={mutation.isPending}>
							{t('settings:visibility-save')}
						</Button>
					</DrawerFooter>
				</DrawerForm>
			</DrawerContent>
		</Drawer>
	);
};
