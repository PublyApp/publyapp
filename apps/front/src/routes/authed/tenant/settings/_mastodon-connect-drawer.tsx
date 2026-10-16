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
import {
	type FediverseProvider,
	useStartMastodonConnectMutation,
} from '~/lib/query/mastodon-connect';
import type { SocialAccountRow } from '~/lib/query/social-accounts';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

/** The instance host of a stored Mastodon handle (`name@host`), for reconnect. */
const hostOf = (account: SocialAccountRow | undefined): string =>
	account?.displayHandle.split('@').pop() ?? '';

/** Per-network copy keys (explicit `settings:` prefix, see social-accounts.ts). */
const COPY = {
	mastodon: {
		connectTitle: 'settings:mastodon-connect-title',
		reconnectTitle: 'settings:mastodon-reconnect-title',
		label: 'settings:mastodon-instance-label',
		help: 'settings:mastodon-instance-help',
		submit: 'settings:mastodon-submit',
	},
	pixelfed: {
		connectTitle: 'settings:pixelfed-connect-title',
		reconnectTitle: 'settings:pixelfed-reconnect-title',
		label: 'settings:pixelfed-instance-label',
		help: 'settings:pixelfed-instance-help',
		submit: 'settings:pixelfed-submit',
	},
} satisfies Record<FediverseProvider, Record<string, string>>;

const getSchema = (help: string) =>
	z.object({
		instance: z.string().trim().min(3, { message: help }),
	});

type FormValues = z.infer<ReturnType<typeof getSchema>>;

/** Mastodon and Pixelfed share this drawer (#2175). Connect AND reconnect: the user names their instance, the
 * API returns the instance's authorize URL and the browser goes there; the
 * instance sends it back to the integrations page, which finishes the flow. */
export const MastodonConnectDrawer = ({
	open,
	onOpenChange,
	tenantId,
	account,
	provider = 'mastodon',
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	tenantId: string;
	account?: SocialAccountRow;
	provider?: FediverseProvider;
}) => {
	const { t } = useTranslation(['settings']);
	const copy = COPY[provider];
	const startMutation = useStartMastodonConnectMutation();
	const methods = useForm<FormValues>({
		resolver: zodResolver(getSchema(t(copy.help))),
		defaultValues: { instance: hostOf(account) },
	});

	const onSubmit = methods.handleSubmit(async (values) => {
		try {
			const authorizeUrl = await startMutation.mutateAsync({
				tenantId,
				instance: values.instance,
				provider,
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
				data-testid={`${provider}-${account ? 'reconnect' : 'connect'}-drawer`}
			>
				<DrawerHeader>
					<DrawerTitle>
						{t(account ? copy.reconnectTitle : copy.connectTitle)}
					</DrawerTitle>
				</DrawerHeader>
				<DrawerForm methods={methods} onSubmit={onSubmit}>
					<DrawerBody>
						<Field.Text
							name="instance"
							label={t(copy.label)}
							helperText={t(copy.help)}
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
							{t(copy.submit)}
						</Button>
					</DrawerFooter>
				</DrawerForm>
			</DrawerContent>
		</Drawer>
	);
};
