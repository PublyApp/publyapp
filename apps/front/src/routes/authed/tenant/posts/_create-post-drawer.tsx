import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Field } from '~/components/field';
import { Button } from '~/components/ui/button';
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerBody,
	DrawerFooter,
	DrawerForm,
} from '~/components/ui/drawer';
import { savePost, invalidateTenantPosts } from '~/lib/query/tenant-posts';
import {
	useTenantProjectsQuery,
	toTenantProjectItems,
} from '~/lib/query/tenant-projects';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { getFailureMessage } from '@org/shared-ts/lib/api-failure/to-api-failure';

const getSchema = (t: (k: string) => string) =>
	z.object({
		body: z
			.string()
			.trim()
			.min(1, { message: t('posts:body-required') })
			.max(20000, { message: t('posts:body-too-long') }),
		projectId: z.string().nullable().optional(),
	});

type FormValues = z.infer<ReturnType<typeof getSchema>>;

export const CreatePostDrawer = ({
	open,
	onOpenChange,
	tenantId,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	tenantId: string;
}) => {
	const { t } = useTranslation(['posts', 'common']);
	const qc = useQueryClient();
	const projectsQuery = useTenantProjectsQuery({ tenantId });
	const projectItems = toTenantProjectItems(projectsQuery.data);
	const methods = useForm<FormValues>({
		resolver: zodResolver(getSchema(t)),
		defaultValues: { body: '', projectId: null },
	});
	// useWatch subscribes to the field instead of calling `methods.watch()`
	// during render — the render-time `watch()` read makes React Hook Form an
	// incompatible library for this component and the compiler skips it.
	const body = useWatch({ control: methods.control, name: 'body' }) ?? '';

	const onSubmit = methods.handleSubmit(async (values) => {
		try {
			await savePost({
				body: values.body,
				projectId: values.projectId ?? null,
				tenantId,
			});
			await invalidateTenantPosts(qc, tenantId);
			methods.reset();
			onOpenChange(false);
		} catch (error) {
			const failure = toApiFailure(error);
			if (failure.kind === 'validation' && failure.fieldErrors) {
				for (const [k, msgs] of Object.entries(failure.fieldErrors)) {
					methods.setError(k as keyof FormValues, {
						message: msgs[0],
					});
				}
				if (!failure.fieldErrors.body && !failure.fieldErrors.projectId) {
					methods.setError('root', {
						message:
							getFailureMessage(failure, {
								fallback: t('common:an-error-occurred'),
							}) ?? undefined,
					});
				}
				return;
			}
			methods.setError('root', {
				message:
					getFailureMessage(failure, {
						fallback: t('common:an-error-occurred'),
					}) ?? undefined,
			});
		}
	});

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent width={736} data-testid="tenant-posts-create-drawer">
				<DrawerHeader>
					<DrawerTitle>{t('posts:new-post')}</DrawerTitle>
				</DrawerHeader>
				<DrawerForm methods={methods} onSubmit={onSubmit}>
					<DrawerBody>
						<Field.Textarea
							name="body"
							label={t('posts:body-label')}
							placeholder={t('posts:body-placeholder')}
							rows={8}
							aria-describedby="post-body-counter"
							data-testid="tenant-posts-create-body"
						/>
						<p
							id="post-body-counter"
							className={
								body.length > 20000
									? 'text-[var(--publy-danger)] text-xs'
									: 'text-muted-foreground text-xs'
							}
						>
							{body.length} / 20000
						</p>
						{methods.formState.errors.root ? (
							<p className="text-sm text-destructive" role="alert">
								{methods.formState.errors.root.message}
							</p>
						) : null}
						<Field.Select
							name="projectId"
							label={t('posts:project-label')}
							placeholder={t('posts:project-placeholder')}
							options={projectItems.map((p) => ({
								value: p.id,
								label: p.name,
							}))}
						/>
						{projectItems.length === 0 ? (
							<p className="text-muted-foreground text-xs">
								{t('posts:no-projects-yet')}
							</p>
						) : null}
					</DrawerBody>
					<DrawerFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							{t('common:cancel')}
						</Button>
						<Button
							type="submit"
							variant="default"
							disabled={methods.formState.isSubmitting}
							data-testid="tenant-posts-create-save"
						>
							{methods.formState.isSubmitting
								? t('posts:saving')
								: t('posts:save')}
						</Button>
					</DrawerFooter>
				</DrawerForm>
			</DrawerContent>
		</Drawer>
	);
};
