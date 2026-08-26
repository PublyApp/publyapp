import { zodResolver } from '@hookform/resolvers/zod';
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
import type { SocialAccountRow } from '~/lib/query/social-accounts';
import {
	useConnectSocialAccountMutation,
	useReconnectSocialAccountMutation,
} from '~/lib/query/social-accounts';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import { AttachProjectsField } from './_attach-projects-field';

const APP_PASSWORD_HELP_URL = 'https://bsky.app/settings/app-passwords';

export type DrawerMode = 'connect' | 'reconnect';

const getSchema = (t: (k: string) => string, mode: DrawerMode) =>
	z.object({
		identifier:
			mode === 'reconnect'
				? z.string()
				: z
						.string()
						.trim()
						.min(3, { message: t('drawer-identifier-help') }),
		appPassword: z.string().min(1, { message: t('drawer-app-password-help') }),
		projectIds: z.array(z.string()),
	});

type FormValues = z.infer<ReturnType<typeof getSchema>>;

/** Connect AND reconnect share this drawer (spec §3): reconnect prefills the
 * handle, keeps the identifier read-only (C2 resolves by stored DID), and
 * hides the attachments step. Provider failures are surfaced AS-IS through
 * their settings-namespace keys; nothing generic. The app-password string
 * lives ONLY in RHF state and the form resets on close. */
export const BlueskyConnectDrawer = ({
	mode,
	open,
	onOpenChange,
	tenantId,
	account,
}: {
	mode: DrawerMode;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	tenantId: string;
	account?: SocialAccountRow;
}) => {
	const { t } = useTranslation(['settings']);
	const connectMutation = useConnectSocialAccountMutation();
	const reconnectMutation = useReconnectSocialAccountMutation();
	const methods = useForm<FormValues>({
		resolver: zodResolver(getSchema(t, mode)),
		defaultValues: {
			identifier: account?.displayHandle ?? '',
			appPassword: '',
			projectIds: [],
		},
	});

	const onSubmit = methods.handleSubmit(async (values) => {
		try {
			if (mode === 'reconnect' && account) {
				await reconnectMutation.mutateAsync({
					tenantId,
					socialAccountId: account.id,
					appPassword: values.appPassword,
				});
			} else {
				await connectMutation.mutateAsync({
					tenantId,
					identifier: values.identifier,
					appPassword: values.appPassword,
				});
			}
			methods.reset();
			onOpenChange(false);
		} catch (error) {
			const failure = toApiFailure(error);

			// Field errors first: C2 keys the refused-credentials 422 on
			// `appPassword` — map it onto the field so the message sits next to
			// the input it invalidates.
			const appPasswordError =
				failure.kind === 'validation'
					? failure.fieldErrors['appPassword']?.[0]
					: undefined;
			if (appPasswordError !== undefined) {
				methods.setError('appPassword', { message: appPasswordError });
				return;
			}

			// Everything else: root error resolved through getFailureMessage —
			// the server's sanitised detail/title wins (transparent-cause rule);
			// only unknown shapes get the generic fallback.
			methods.setError('root', {
				message: getFailureMessage(failure, {
					fallback: t('common:an-error-occurred'),
				}),
			});
		}
	});

	return (
		<Drawer
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					methods.reset();
				}
				onOpenChange(next);
			}}
		>
			<DrawerContent data-testid={`bluesky-${mode}-drawer`}>
				<DrawerHeader>
					<DrawerTitle>
						{t(
							mode === 'connect'
								? 'drawer-connect-title'
								: 'drawer-reconnect-title',
						)}
					</DrawerTitle>
				</DrawerHeader>
				<DrawerForm methods={methods} onSubmit={onSubmit}>
					<DrawerBody>
						<Field.Text
							name="identifier"
							label={t('drawer-identifier-label')}
							isDisabled={mode === 'reconnect'}
							data-testid="bluesky-identifier"
						/>
						<Field.Text
							name="appPassword"
							type="password"
							label={t('drawer-app-password-label')}
							helperText={t('drawer-app-password-help')}
							data-testid="bluesky-app-password"
						/>
						<a href={APP_PASSWORD_HELP_URL} target="_blank" rel="noreferrer">
							{t('drawer-app-password-help-link')}
						</a>
						{methods.formState.errors.root?.message ? (
							<p role="alert" className="text-destructive text-sm">
								{methods.formState.errors.root.message}
							</p>
						) : null}
						{mode === 'connect' ? (
							<AttachProjectsField name="projectIds" tenantId={tenantId} />
						) : null}
					</DrawerBody>
					<DrawerFooter>
						<Button type="submit">
							{t(
								mode === 'connect'
									? 'drawer-submit-connect'
									: 'drawer-submit-reconnect',
							)}
						</Button>
					</DrawerFooter>
				</DrawerForm>
			</DrawerContent>
		</Drawer>
	);
};
