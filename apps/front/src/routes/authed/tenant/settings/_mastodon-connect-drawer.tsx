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
import { useStartMastodonConnectMutation } from '~/lib/query/mastodon-connect';
import type { SocialAccountRow } from '~/lib/query/social-accounts';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

/** The instance host of a stored Mastodon handle (`name@host`), for reconnect. */
const hostOf = (account: SocialAccountRow | undefined): string =>
	account?.displayHandle.split('@').pop() ?? '';

const getSchema = (t: (k: string) => string) =>
	z.object({
		instance: z
			.string()
			.trim()
			.min(3, { message: t('mastodon-instance-help') }),
	});

type FormValues = z.infer<ReturnType<typeof getSchema>>;

/** Connect AND reconnect share this drawer: the user names their instance, the
 * API returns the instance's authorize URL and the browser goes there; the
 * instance sends it back to the integrations page, which finishes the flow. */
export const MastodonConnectDrawer = ({
	open,
	onOpenChange,
	tenantId,
	account,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	tenantId: string;
	account?: SocialAccountRow;
}) => {
	const { t } = useTranslation(['settings']);
	const startMutation = useStartMastodonConnectMutation();
	const methods = useForm<FormValues>({
		resolver: zodResolver(getSchema(t)),
		defaultValues: { instance: hostOf(account) },
	});

	const onSubmit = methods.handleSubmit(async (values) => {
		try {
			const authorizeUrl = await startMutation.mutateAsync({
				tenantId,
				instance: values.instance,
			});
			window.location.assign(authorizeUrl);
		} catch (error) {
			const failure = toApiFailure(error);
			const instanceError =
				failure.kind === 'validation'
					? failure.fieldErrors['instance']?.[0]
					: undefined;
			if (instanceError !== undefined) {
				methods.setError('instance', { message: instanceError });
				return;
			}
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
			<DrawerContent
				data-testid={`mastodon-${account ? 'reconnect' : 'connect'}-drawer`}
			>
				<DrawerHeader>
					<DrawerTitle>
						{t(account ? 'mastodon-reconnect-title' : 'mastodon-connect-title')}
					</DrawerTitle>
				</DrawerHeader>
				<DrawerForm methods={methods} onSubmit={onSubmit}>
					<DrawerBody>
						<Field.Text
							name="instance"
							label={t('mastodon-instance-label')}
							helperText={t('mastodon-instance-help')}
							isDisabled={account !== undefined}
							data-testid="mastodon-instance"
						/>
						{methods.formState.errors.root?.message ? (
							<p role="alert" className="text-destructive text-sm">
								{methods.formState.errors.root.message}
							</p>
						) : null}
					</DrawerBody>
					<DrawerFooter>
						<Button type="submit" disabled={startMutation.isPending}>
							{t('mastodon-submit')}
						</Button>
					</DrawerFooter>
				</DrawerForm>
			</DrawerContent>
		</Drawer>
	);
};
