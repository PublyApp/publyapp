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
import { useLanguageKeyedZodResolver } from '~/lib/hooks/use-language-keyed-zod-resolver';
import {
	type SocialAccountRow,
	useConnectDiscordWebhookMutation,
} from '~/lib/query/social-accounts';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

const getSchema = (t: (k: string) => string) =>
	z.object({
		webhookUrl: z
			.string()
			.trim()
			.min(10, { message: t('discord-webhook-help') }),
	});

type FormValues = z.infer<ReturnType<typeof getSchema>>;

/** Connect AND reconnect share this drawer: Discord needs no OAuth, so the user
 * pastes an incoming-webhook URL and the API verifies it. A reconnect pastes a
 * fresh URL (a deleted webhook cannot be revived). The URL is a secret: it lives
 * only in form state, is shown as a password field and is wiped on close. */
export const DiscordConnectDrawer = ({
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
	const connectMutation = useConnectDiscordWebhookMutation();
	// Language-keyed resolver: schema + resolver built once per language, not
	// once per render.
	const resolver = useLanguageKeyedZodResolver<FormValues>(
		getSchema,
		'settings',
	);
	const methods = useForm<FormValues>({
		resolver,
		defaultValues: { webhookUrl: '' },
	});

	const onSubmit = methods.handleSubmit(async (values) => {
		try {
			await connectMutation.mutateAsync({
				tenantId,
				webhookUrl: values.webhookUrl,
				socialAccountId: account?.id,
			});
			methods.reset();
			onOpenChange(false);
		} catch (error) {
			const failure = toApiFailure(error);
			const urlError =
				failure.kind === 'validation'
					? failure.fieldErrors['webhookUrl']?.[0]
					: undefined;
			if (urlError !== undefined) {
				methods.setError('webhookUrl', { message: urlError });
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
				data-testid={`discord-${account ? 'reconnect' : 'connect'}-drawer`}
			>
				<DrawerHeader>
					<DrawerTitle>
						{t(account ? 'discord-reconnect-title' : 'discord-connect-title')}
					</DrawerTitle>
				</DrawerHeader>
				<DrawerForm methods={methods} onSubmit={onSubmit}>
					<DrawerBody>
						<Field.Text
							name="webhookUrl"
							type="password"
							label={t('discord-webhook-label')}
							helperText={t('discord-webhook-help')}
							data-testid="discord-webhook-url"
						/>
						{methods.formState.errors.root?.message ? (
							<p role="alert" className="text-destructive text-sm">
								{methods.formState.errors.root.message}
							</p>
						) : null}
					</DrawerBody>
					<DrawerFooter>
						<Button type="submit" disabled={connectMutation.isPending}>
							{t('discord-submit')}
						</Button>
					</DrawerFooter>
				</DrawerForm>
			</DrawerContent>
		</Drawer>
	);
};
