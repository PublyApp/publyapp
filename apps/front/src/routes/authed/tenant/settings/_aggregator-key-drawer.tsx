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
import { useResponseMessageTranslator } from '~/lib/i18n/use-response-message-translator';
import {
	type AggregatorRow,
	useSaveAggregatorKeyMutation,
} from '~/lib/query/aggregators';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

const getSchema = (message: string) =>
	z.object({ apiKey: z.string().trim().min(8, { message }) });

type FormValues = z.infer<ReturnType<typeof getSchema>>;

/** Save or rotate an organisation's own aggregator key. Generic: the name and
 * help link come from the aggregator row. The key is a secret: it is a password
 * field, lives only in form state and is wiped on close; the page afterwards
 * shows the last 4 characters only. */
export const AggregatorKeyDrawer = ({
	aggregator,
	onOpenChange,
	tenantId,
}: {
	/** The aggregator whose key is being set; `null` keeps the drawer closed. */
	aggregator: AggregatorRow | null;
	onOpenChange: (open: boolean) => void;
	tenantId: string;
}) => {
	const { t } = useTranslation(['settings']);
	const translateResponseMessage = useResponseMessageTranslator();
	const saveMutation = useSaveAggregatorKeyMutation();
	const name = aggregator?.displayName ?? '';
	const resolver = useMemo(
		() => zodResolver(getSchema(t('aggregator-key-too-short'))),
		[t],
	);
	const methods = useForm<FormValues>({
		resolver,
		defaultValues: { apiKey: '' },
	});

	const onSubmit = methods.handleSubmit(async (values) => {
		if (aggregator === null) {
			return;
		}
		try {
			await saveMutation.mutateAsync({
				tenantId,
				kind: aggregator.kind,
				apiKey: values.apiKey,
			});
			methods.reset();
			onOpenChange(false);
		} catch (error) {
			const failure = toApiFailure(error);
			const keyError =
				failure.kind === 'validation'
					? failure.fieldErrors['apiKey']?.[0]
					: undefined;
			if (keyError !== undefined) {
				methods.setError('apiKey', { message: keyError });
				return;
			}
			methods.setError('root', {
				message: getFailureMessage(failure, {
					translate: translateResponseMessage,
					fallback: t('common:an-error-occurred'),
				}),
			});
		}
	});

	return (
		<Drawer
			open={aggregator !== null}
			onOpenChange={(next) => {
				if (!next) {
					methods.reset();
				}
				onOpenChange(next);
			}}
		>
			<DrawerContent data-testid="aggregator-key-drawer">
				<DrawerHeader>
					<DrawerTitle>{t('aggregator-drawer-title', { name })}</DrawerTitle>
				</DrawerHeader>
				<DrawerForm methods={methods} onSubmit={onSubmit}>
					<DrawerBody>
						<Field.Text
							name="apiKey"
							type="password"
							label={t('aggregator-key-label', { name })}
							helperText={t('aggregator-key-help', { name })}
							data-testid="aggregator-api-key"
						/>
						{aggregator?.keyHelpUrl ? (
							<a
								href={aggregator.keyHelpUrl}
								target="_blank"
								rel="noreferrer"
								className="text-primary text-sm underline"
							>
								{t('aggregator-key-get', { name })}
							</a>
						) : null}
						{methods.formState.errors.root?.message ? (
							<p role="alert" className="text-destructive text-sm">
								{methods.formState.errors.root.message}
							</p>
						) : null}
					</DrawerBody>
					<DrawerFooter>
						<Button type="submit" disabled={saveMutation.isPending}>
							{t('aggregator-key-submit')}
						</Button>
					</DrawerFooter>
				</DrawerForm>
			</DrawerContent>
		</Drawer>
	);
};
