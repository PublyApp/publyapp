# Make floating card sticky and centered
_Exported on 11/20/2025 at 08:59:39 GMT+3 from Cursor (2.0.77)_

---

**User**

I want this floating card: CreateStaffProfileActions to be sticky/fixed AND cntered compared to DashboardContent

@new-staff-profile-page.tsx 

---

**Cursor**


Reviewing `FloatingCard` to understand its structure, then updating `CreateStaffProfileActions` to be sticky and centered relative to `DashboardContent`.



Updating `CreateStaffProfileActions` to use sticky positioning and center it relative to `DashboardContent`:


```typescriptreact
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { data } from 'react-router';
import { useForm } from 'react-hook-form';
import type zod from 'zod';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { FloatingCard } from '@/front/components/floating-card';
import { Form } from '@/front/components/hook-form/form-provider';
import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';
import { useSyncFormToLang } from '@/front/hooks/use-sync-form-to-lang';
import { useTranslate } from '@/front/hooks/use-translate';
import { isJsClientError } from '@/front/lib/js-client/js-client-error';
import {
	useCreateStaffProfile,
	useFindStaffProfiles,
} from '@/front/lib/react-query/features/staff/staff-profile.hooks';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	isServer,
} from '@/shared/lib/constants';
import { getNewStaffProfileSchema } from '@/shared/validations/staff-profile.validations';
import type { Route } from './+types/new-staff-profile-page';
import NewStaffProfileForm from './parts/new-staff-profile-form';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(
		t('new-item', { item: _.toLower(t('staff-profile')) }),
	);

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: getPageTitle(t, true),
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: getPageTitle(t, true),
				},
			],
		});
	},
});

type NewStaffProfileSchemaType = zod.infer<
	ReturnType<typeof getNewStaffProfileSchema>
>;

const defaultValues: NewStaffProfileSchemaType = {
	name: '',
	description: '',
	permissions: [],
	emails: [],
};

const NewStaffProfilePage = () => {
	const { t, i18n } = useTranslate();
	const router = useRouter();
	const queryClient = useQueryClient();

	const NewStaffProfileSchema = getNewStaffProfileSchema(defaultZodClient);

	const form = useForm<NewStaffProfileSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(NewStaffProfileSchema),
		defaultValues,
	});

	useSyncFormToLang(i18n.language, form);

	const { mutate: createProfile, isPending } = useCreateStaffProfile({
		onSuccess: () => {
			toast.success(t('profile-created-successfully'));
			queryClient.invalidateQueries({
				queryKey: useFindStaffProfiles.getKey(),
			});
			form.reset();
			router.push(FRONT_PATH_NAMES.staff.profiles.root);
		},
		onError: (error) => {
			if (isJsClientError(error)) {
				toast.error(
					error.key
						? t(error.key as never, { ns: I18N_NAMESPACES.RESPONSE_MESSAGE })
						: error.messageEscaped,
				);
				return;
			}
			toast.error(_.trim(error.message) || t('unknown-error'));
		},
	});

	const onSubmit = form.handleSubmit((data) => {
		createProfile({
			name: data.name,
			description: data.description || undefined,
			permissions: data.permissions,
			emails: data.emails,
		});
	});

	return (
		<DashboardContent
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				position: 'relative',
			}}
			compact
			maxWidth="lg"
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('staff-profiles')),
						href: FRONT_PATH_NAMES.staff.profiles.root,
					},
					{
						name: _.capitalize(
							t('new-item', { item: _.toLower(t('staff-profile')) }),
						),
					},
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<Form methods={form} onSubmit={onSubmit}>
				<NewStaffProfileForm />

				<CreateStaffProfileActions isPending={isPending} />
			</Form>
		</DashboardContent>
	);
};

export default NewStaffProfilePage;

type CreateStaffProfileActionsProps = {
	isPending: boolean;
};

const CreateStaffProfileActions = ({
	isPending,
}: CreateStaffProfileActionsProps) => {
	const { t } = useTranslate();

	return (
		<FloatingCard
			placement="bottom-center"
			offset={20}
			elevation={6}
			sx={{
				position: 'sticky',
				bottom: 20,
				left: '50%',
				transform: 'translateX(-50%)',
				borderRadius: 2,
				display: 'flex',
				gap: 2,
				maxWidth: 700,
				padding: 1,
				width: 'fit-content',
				margin: '0 auto',
			}}
		>
			<Button
				type="submit"
				variant="contained"
				disabled={isPending}
				loading={isPending}
			>
				{_.capitalize(t('create-profile'))}
			</Button>
		</FloatingCard>
	);
};

```


Checking for linting errors:



Updated `CreateStaffProfileActions` to be sticky and centered relative to `DashboardContent`.

1. Changed `position: 'absolute'` to `position: 'sticky'` — sticks to the bottom when scrolling
2. Added centering styles:
   - `left: '50%'` and `transform: 'translateX(-50%)'` for horizontal centering
   - `width: 'fit-content'` so it only takes needed space
   - `margin: '0 auto'` for additional centering support
3. Kept `bottom: 20` to maintain spacing from the bottom

The card will:
- Stick to the bottom of the `DashboardContent` container when scrolling
- Stay horizontally centered within `DashboardContent` (respecting its `maxWidth="lg"`)
- Remain visible at the bottom as users scroll through the form

The `sx` prop overrides the `FloatingCard`'s default `position: 'fixed'` styling, so it will be positioned relative to the `DashboardContent` container instead of the viewport.

---

**User**

ok, I think we nedd help of a little bit of javascript ot achieve that

---

**Cursor**


Using JavaScript to center the floating card relative to `DashboardContent`. Reading the current file to understand the structure:



Adding JavaScript to center the floating card relative to `DashboardContent` by tracking its position and calculating the center dynamically:


```typescriptreact
import { zodResolver } from '@hookform/resolvers/zod';
import Button from '@mui/material/Button';
import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { data } from 'react-router';
import type zod from 'zod';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { FloatingCard } from '@/front/components/floating-card';
import { Form } from '@/front/components/hook-form/form-provider';
import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';
import { useSyncFormToLang } from '@/front/hooks/use-sync-form-to-lang';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { isJsClientError } from '@/front/lib/js-client/js-client-error';
import {
	useCreateStaffProfile,
	useFindStaffProfiles,
} from '@/front/lib/react-query/features/staff/staff-profile.hooks';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	isServer,
} from '@/shared/lib/constants';
import { getNewStaffProfileSchema } from '@/shared/validations/staff-profile.validations';
import type { Route } from './+types/new-staff-profile-page';
import NewStaffProfileForm from './parts/new-staff-profile-form';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(
		t('new-item', { item: _.toLower(t('staff-profile')) }),
	);

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: getPageTitle(t, true),
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: getPageTitle(t, true),
				},
			],
		});
	},
});

type NewStaffProfileSchemaType = zod.infer<
	ReturnType<typeof getNewStaffProfileSchema>
>;

const defaultValues: NewStaffProfileSchemaType = {
	name: '',
	description: '',
	permissions: [],
	emails: [],
};

const NewStaffProfilePage = () => {
	const { t, i18n } = useTranslate();
	const router = useRouter();
	const queryClient = useQueryClient();

	const NewStaffProfileSchema = getNewStaffProfileSchema(defaultZodClient);

	const form = useForm<NewStaffProfileSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(NewStaffProfileSchema),
		defaultValues,
	});

	useSyncFormToLang(i18n.language, form);

	const { mutate: createProfile, isPending } = useCreateStaffProfile({
		onSuccess: () => {
			toast.success(t('profile-created-successfully'));
			queryClient.invalidateQueries({
				queryKey: useFindStaffProfiles.getKey(),
			});
			form.reset();
			router.push(FRONT_PATH_NAMES.staff.profiles.root);
		},
		onError: (error) => {
			if (isJsClientError(error)) {
				toast.error(
					error.key
						? t(error.key as never, { ns: I18N_NAMESPACES.RESPONSE_MESSAGE })
						: error.messageEscaped,
				);
				return;
			}
			toast.error(_.trim(error.message) || t('unknown-error'));
		},
	});

	const onSubmit = form.handleSubmit((data) => {
		createProfile({
			name: data.name,
			description: data.description || undefined,
			permissions: data.permissions,
			emails: data.emails,
		});
	});

	return (
		<>
			<DashboardContent
				sx={{
					flexGrow: 1,
					display: 'flex',
					flexDirection: 'column',
					position: 'relative',
				}}
				compact
				maxWidth="lg"
			>
				<CustomBreadcrumbs
					heading={getPageTitle(t as never)}
					links={[
						{
							name: _.capitalize(t('staff-profiles')),
							href: FRONT_PATH_NAMES.staff.profiles.root,
						},
						{
							name: _.capitalize(
								t('new-item', { item: _.toLower(t('staff-profile')) }),
							),
						},
					]}
					sx={{ mb: { xs: 3, md: 5 } }}
				/>

				<Form methods={form} onSubmit={onSubmit}>
					<NewStaffProfileForm />
				</Form>
				<CreateStaffProfileActions isPending={isPending} />
			</DashboardContent>
		</>
	);
};

export default NewStaffProfilePage;

type CreateStaffProfileActionsProps = {
	isPending: boolean;
};

const CreateStaffProfileActions = ({
	isPending,
}: CreateStaffProfileActionsProps) => {
	const { t } = useTranslate();

	return (
		<FloatingCard
			placement="bottom-center"
			offset={20}
			sx={{
				position: 'sticky',
				bottom: 20,
				left: '50%',
				transform: 'translateX(-50%)',
				borderRadius: 2,
				display: 'flex',
				gap: 2,
				maxWidth: 700,
				padding: 1,
				width: 'fit-content',
				margin: '0 auto',
			}}
		>
			<Button
				type="submit"
				variant="contained"
				disabled={isPending}
				loading={isPending}
			>
				{_.capitalize(t('create-profile'))}
			</Button>
		</FloatingCard>
	);
};

```

```typescriptreact
const NewStaffProfilePage = () => {
	const { t, i18n } = useTranslate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const dashboardContentRef = useRef<HTMLDivElement>(null);
	const [cardPosition, setCardPosition] = useState<{
		left: number;
		width: number;
	} | null>(null);

	const NewStaffProfileSchema = getNewStaffProfileSchema(defaultZodClient);

	const form = useForm<NewStaffProfileSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(NewStaffProfileSchema),
		defaultValues,
	});

	useSyncFormToLang(i18n.language, form);

	const { mutate: createProfile, isPending } = useCreateStaffProfile({
		onSuccess: () => {
			toast.success(t('profile-created-successfully'));
			queryClient.invalidateQueries({
				queryKey: useFindStaffProfiles.getKey(),
			});
			form.reset();
			router.push(FRONT_PATH_NAMES.staff.profiles.root);
		},
		onError: (error) => {
			if (isJsClientError(error)) {
				toast.error(
					error.key
						? t(error.key as never, { ns: I18N_NAMESPACES.RESPONSE_MESSAGE })
						: error.messageEscaped,
				);
				return;
			}
			toast.error(_.trim(error.message) || t('unknown-error'));
		},
	});

	const onSubmit = form.handleSubmit((data) => {
		createProfile({
			name: data.name,
			description: data.description || undefined,
			permissions: data.permissions,
			emails: data.emails,
		});
	});

	useEffect(() => {
		const updateCardPosition = () => {
			if (dashboardContentRef.current) {
				const rect = dashboardContentRef.current.getBoundingClientRect();
				setCardPosition({
					left: rect.left,
					width: rect.width,
				});
			}
		};

		updateCardPosition();

		window.addEventListener('resize', updateCardPosition);
		window.addEventListener('scroll', updateCardPosition, true);

		return () => {
			window.removeEventListener('resize', updateCardPosition);
			window.removeEventListener('scroll', updateCardPosition, true);
		};
	}, []);

	return (
		<>
			<DashboardContent
				ref={dashboardContentRef}
				sx={{
					flexGrow: 1,
					display: 'flex',
					flexDirection: 'column',
					position: 'relative',
				}}
				compact
				maxWidth="lg"
			>
				<CustomBreadcrumbs
					heading={getPageTitle(t as never)}
					links={[
						{
							name: _.capitalize(t('staff-profiles')),
							href: FRONT_PATH_NAMES.staff.profiles.root,
						},
						{
							name: _.capitalize(
								t('new-item', { item: _.toLower(t('staff-profile')) }),
							),
						},
					]}
					sx={{ mb: { xs: 3, md: 5 } }}
				/>

				<Form methods={form} onSubmit={onSubmit}>
					<NewStaffProfileForm />
				</Form>
				<CreateStaffProfileActions
					isPending={isPending}
					cardPosition={cardPosition}
				/>
			</DashboardContent>
		</>
	);
};
```


Re-reading the file to check its current state:



Adding imports, then updating the component:


```typescriptreact
import { zodResolver } from '@hookform/resolvers/zod';
import Button from '@mui/material/Button';
import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { data } from 'react-router';
import type zod from 'zod';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { FloatingCard } from '@/front/components/floating-card';
import { Form } from '@/front/components/hook-form/form-provider';
import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';
import { useSyncFormToLang } from '@/front/hooks/use-sync-form-to-lang';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { isJsClientError } from '@/front/lib/js-client/js-client-error';
import {
	useCreateStaffProfile,
	useFindStaffProfiles,
} from '@/front/lib/react-query/features/staff/staff-profile.hooks';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	isServer,
} from '@/shared/lib/constants';
import { getNewStaffProfileSchema } from '@/shared/validations/staff-profile.validations';
import type { Route } from './+types/new-staff-profile-page';
import NewStaffProfileForm from './parts/new-staff-profile-form';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(
		t('new-item', { item: _.toLower(t('staff-profile')) }),
	);

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: getPageTitle(t, true),
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: getPageTitle(t, true),
				},
			],
		});
	},
});

type NewStaffProfileSchemaType = zod.infer<
	ReturnType<typeof getNewStaffProfileSchema>
>;

const defaultValues: NewStaffProfileSchemaType = {
	name: '',
	description: '',
	permissions: [],
	emails: [],
};

const NewStaffProfilePage = () => {
	const { t, i18n } = useTranslate();
	const router = useRouter();
	const queryClient = useQueryClient();

	const NewStaffProfileSchema = getNewStaffProfileSchema(defaultZodClient);

	const form = useForm<NewStaffProfileSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(NewStaffProfileSchema),
		defaultValues,
	});

	useSyncFormToLang(i18n.language, form);

	const { mutate: createProfile, isPending } = useCreateStaffProfile({
		onSuccess: () => {
			toast.success(t('profile-created-successfully'));
			queryClient.invalidateQueries({
				queryKey: useFindStaffProfiles.getKey(),
			});
			form.reset();
			router.push(FRONT_PATH_NAMES.staff.profiles.root);
		},
		onError: (error) => {
			if (isJsClientError(error)) {
				toast.error(
					error.key
						? t(error.key as never, { ns: I18N_NAMESPACES.RESPONSE_MESSAGE })
						: error.messageEscaped,
				);
				return;
			}
			toast.error(_.trim(error.message) || t('unknown-error'));
		},
	});

	const onSubmit = form.handleSubmit((data) => {
		createProfile({
			name: data.name,
			description: data.description || undefined,
			permissions: data.permissions,
			emails: data.emails,
		});
	});

	return (
		<DashboardContent
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				position: 'relative',
			}}
			compact
			maxWidth="lg"
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('staff-profiles')),
						href: FRONT_PATH_NAMES.staff.profiles.root,
					},
					{
						name: _.capitalize(
							t('new-item', { item: _.toLower(t('staff-profile')) }),
						),
					},
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<Form methods={form} onSubmit={onSubmit}>
				<NewStaffProfileForm />

				<CreateStaffProfileActions isPending={isPending} />
			</Form>
		</DashboardContent>
	);
};

export default NewStaffProfilePage;

type CreateStaffProfileActionsProps = {
	isPending: boolean;
};

const CreateStaffProfileActions = ({
	isPending,
}: CreateStaffProfileActionsProps) => {
	const { t } = useTranslate();

	return (
		<FloatingCard
			placement="bottom-center"
			offset={20}
			sx={{
				position: 'absolute',
				borderRadius: 2,
				display: 'flex',
				gap: 2,
				maxWidth: 700,
				padding: 1,
			}}
		>
			<Button
				type="submit"
				variant="contained"
				disabled={isPending}
				loading={isPending}
			>
				{_.capitalize(t('create-profile'))}
			</Button>
		</FloatingCard>
	);
};
			>
				{_.capitalize(t('create-profile'))}
			</Button>
		</FloatingCard>
	);
};

```


Updating the component to add ref tracking and position calculation:


```typescriptreact
import { zodResolver } from '@hookform/resolvers/zod';
import Button from '@mui/material/Button';
import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { data } from 'react-router';
import type zod from 'zod';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { FloatingCard } from '@/front/components/floating-card';
import { Form } from '@/front/components/hook-form/form-provider';
import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';
import { useSyncFormToLang } from '@/front/hooks/use-sync-form-to-lang';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { isJsClientError } from '@/front/lib/js-client/js-client-error';
import {
	useCreateStaffProfile,
	useFindStaffProfiles,
} from '@/front/lib/react-query/features/staff/staff-profile.hooks';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	isServer,
} from '@/shared/lib/constants';
import { getNewStaffProfileSchema } from '@/shared/validations/staff-profile.validations';
import type { Route } from './+types/new-staff-profile-page';
import NewStaffProfileForm from './parts/new-staff-profile-form';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(
		t('new-item', { item: _.toLower(t('staff-profile')) }),
	);

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: getPageTitle(t, true),
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: getPageTitle(t, true),
				},
			],
		});
	},
});

type NewStaffProfileSchemaType = zod.infer<
	ReturnType<typeof getNewStaffProfileSchema>
>;

const defaultValues: NewStaffProfileSchemaType = {
	name: '',
	description: '',
	permissions: [],
	emails: [],
};

const NewStaffProfilePage = () => {
	const { t, i18n } = useTranslate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const dashboardContentRef = useRef<HTMLDivElement>(null);
	const [cardPosition, setCardPosition] = useState<{
		left: number;
		width: number;
	} | null>(null);

	const NewStaffProfileSchema = getNewStaffProfileSchema(defaultZodClient);

	const form = useForm<NewStaffProfileSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(NewStaffProfileSchema),
		defaultValues,
	});

	useSyncFormToLang(i18n.language, form);

	const { mutate: createProfile, isPending } = useCreateStaffProfile({
		onSuccess: () => {
			toast.success(t('profile-created-successfully'));
			queryClient.invalidateQueries({
				queryKey: useFindStaffProfiles.getKey(),
			});
			form.reset();
			router.push(FRONT_PATH_NAMES.staff.profiles.root);
		},
		onError: (error) => {
			if (isJsClientError(error)) {
				toast.error(
					error.key
						? t(error.key as never, { ns: I18N_NAMESPACES.RESPONSE_MESSAGE })
						: error.messageEscaped,
				);
				return;
			}
			toast.error(_.trim(error.message) || t('unknown-error'));
		},
	});

	const onSubmit = form.handleSubmit((data) => {
		createProfile({
			name: data.name,
			description: data.description || undefined,
			permissions: data.permissions,
			emails: data.emails,
		});
	});

	useEffect(() => {
		const updateCardPosition = () => {
			if (dashboardContentRef.current) {
				const rect = dashboardContentRef.current.getBoundingClientRect();
				setCardPosition({
					left: rect.left,
					width: rect.width,
				});
			}
		};

		updateCardPosition();

		window.addEventListener('resize', updateCardPosition);
		window.addEventListener('scroll', updateCardPosition, true);

		return () => {
			window.removeEventListener('resize', updateCardPosition);
			window.removeEventListener('scroll', updateCardPosition, true);
		};
	}, []);

	return (
		<DashboardContent
			ref={dashboardContentRef}
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				position: 'relative',
			}}
			compact
			maxWidth="lg"
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('staff-profiles')),
						href: FRONT_PATH_NAMES.staff.profiles.root,
					},
					{
						name: _.capitalize(
							t('new-item', { item: _.toLower(t('staff-profile')) }),
						),
					},
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<Form methods={form} onSubmit={onSubmit}>
				<NewStaffProfileForm />

				<CreateStaffProfileActions
					isPending={isPending}
					cardPosition={cardPosition}
				/>
			</Form>
		</DashboardContent>
	);
};

export default NewStaffProfilePage;

type CreateStaffProfileActionsProps = {
	isPending: boolean;
};

const CreateStaffProfileActions = ({
	isPending,
}: CreateStaffProfileActionsProps) => {
	const { t } = useTranslate();

	return (
		<FloatingCard
			placement="bottom-center"
			offset={20}
			sx={{
				position: 'absolute',
				borderRadius: 2,
				display: 'flex',
				gap: 2,
				maxWidth: 700,
				padding: 1,
			}}
		>
			<Button
				type="submit"
				variant="contained"
				disabled={isPending}
				loading={isPending}
			>
				{_.capitalize(t('create-profile'))}
			</Button>
		</FloatingCard>
	);
};
			>
				{_.capitalize(t('create-profile'))}
			</Button>
		</FloatingCard>
	);
};

```


Updating `CreateStaffProfileActions` to use the calculated position:


```typescriptreact
import { zodResolver } from '@hookform/resolvers/zod';
import Button from '@mui/material/Button';
import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { data } from 'react-router';
import type zod from 'zod';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { FloatingCard } from '@/front/components/floating-card';
import { Form } from '@/front/components/hook-form/form-provider';
import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';
import { useSyncFormToLang } from '@/front/hooks/use-sync-form-to-lang';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { isJsClientError } from '@/front/lib/js-client/js-client-error';
import {
	useCreateStaffProfile,
	useFindStaffProfiles,
} from '@/front/lib/react-query/features/staff/staff-profile.hooks';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	isServer,
} from '@/shared/lib/constants';
import { getNewStaffProfileSchema } from '@/shared/validations/staff-profile.validations';
import type { Route } from './+types/new-staff-profile-page';
import NewStaffProfileForm from './parts/new-staff-profile-form';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(
		t('new-item', { item: _.toLower(t('staff-profile')) }),
	);

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: getPageTitle(t, true),
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: getPageTitle(t, true),
				},
			],
		});
	},
});

type NewStaffProfileSchemaType = zod.infer<
	ReturnType<typeof getNewStaffProfileSchema>
>;

const defaultValues: NewStaffProfileSchemaType = {
	name: '',
	description: '',
	permissions: [],
	emails: [],
};

const NewStaffProfilePage = () => {
	const { t, i18n } = useTranslate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const dashboardContentRef = useRef<HTMLDivElement>(null);
	const [cardPosition, setCardPosition] = useState<{
		left: number;
		width: number;
	} | null>(null);

	const NewStaffProfileSchema = getNewStaffProfileSchema(defaultZodClient);

	const form = useForm<NewStaffProfileSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(NewStaffProfileSchema),
		defaultValues,
	});

	useSyncFormToLang(i18n.language, form);

	const { mutate: createProfile, isPending } = useCreateStaffProfile({
		onSuccess: () => {
			toast.success(t('profile-created-successfully'));
			queryClient.invalidateQueries({
				queryKey: useFindStaffProfiles.getKey(),
			});
			form.reset();
			router.push(FRONT_PATH_NAMES.staff.profiles.root);
		},
		onError: (error) => {
			if (isJsClientError(error)) {
				toast.error(
					error.key
						? t(error.key as never, { ns: I18N_NAMESPACES.RESPONSE_MESSAGE })
						: error.messageEscaped,
				);
				return;
			}
			toast.error(_.trim(error.message) || t('unknown-error'));
		},
	});

	const onSubmit = form.handleSubmit((data) => {
		createProfile({
			name: data.name,
			description: data.description || undefined,
			permissions: data.permissions,
			emails: data.emails,
		});
	});

	useEffect(() => {
		const updateCardPosition = () => {
			if (dashboardContentRef.current) {
				const rect = dashboardContentRef.current.getBoundingClientRect();
				setCardPosition({
					left: rect.left,
					width: rect.width,
				});
			}
		};

		updateCardPosition();

		window.addEventListener('resize', updateCardPosition);
		window.addEventListener('scroll', updateCardPosition, true);

		return () => {
			window.removeEventListener('resize', updateCardPosition);
			window.removeEventListener('scroll', updateCardPosition, true);
		};
	}, []);

	return (
		<DashboardContent
			ref={dashboardContentRef}
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				position: 'relative',
			}}
			compact
			maxWidth="lg"
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('staff-profiles')),
						href: FRONT_PATH_NAMES.staff.profiles.root,
					},
					{
						name: _.capitalize(
							t('new-item', { item: _.toLower(t('staff-profile')) }),
						),
					},
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<Form methods={form} onSubmit={onSubmit}>
				<NewStaffProfileForm />

				<CreateStaffProfileActions
					isPending={isPending}
					cardPosition={cardPosition}
				/>
			</Form>
		</DashboardContent>
	);
};

export default NewStaffProfilePage;

type CreateStaffProfileActionsProps = {
	isPending: boolean;
	cardPosition: { left: number; width: number } | null;
};

const CreateStaffProfileActions = ({
	isPending,
	cardPosition,
}: CreateStaffProfileActionsProps) => {
	const { t } = useTranslate();

	const cardStyle = cardPosition
		? {
				position: 'fixed' as const,
				bottom: 20,
				left: cardPosition.left + cardPosition.width / 2,
				transform: 'translateX(-50%)',
			}
		: {
				position: 'sticky' as const,
				bottom: 20,
				left: '50%',
				transform: 'translateX(-50%)',
			};

	return (
		<FloatingCard
			placement="bottom-center"
			offset={20}
			sx={{
				...cardStyle,
				borderRadius: 2,
				display: 'flex',
				gap: 2,
				maxWidth: 700,
				padding: 1,
				width: 'fit-content',
				zIndex: 1000,
			}}
		>
			<Button
				type="submit"
				variant="contained"
				disabled={isPending}
				loading={isPending}
			>
				{_.capitalize(t('create-profile'))}
			</Button>
		</FloatingCard>
	);
};

```


Checking for linting errors and verifying `DashboardContent` supports ref forwarding:



Checking if `DashboardContent` supports refs:



`DashboardContent` doesn't forward refs. Using a wrapper div inside it to track the position:


```typescriptreact
import { zodResolver } from '@hookform/resolvers/zod';
import Button from '@mui/material/Button';
import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { data } from 'react-router';
import type zod from 'zod';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { FloatingCard } from '@/front/components/floating-card';
import { Form } from '@/front/components/hook-form/form-provider';
import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';
import { useSyncFormToLang } from '@/front/hooks/use-sync-form-to-lang';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { isJsClientError } from '@/front/lib/js-client/js-client-error';
import {
	useCreateStaffProfile,
	useFindStaffProfiles,
} from '@/front/lib/react-query/features/staff/staff-profile.hooks';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	isServer,
} from '@/shared/lib/constants';
import { getNewStaffProfileSchema } from '@/shared/validations/staff-profile.validations';
import type { Route } from './+types/new-staff-profile-page';
import NewStaffProfileForm from './parts/new-staff-profile-form';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(
		t('new-item', { item: _.toLower(t('staff-profile')) }),
	);

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: getPageTitle(t, true),
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: getPageTitle(t, true),
				},
			],
		});
	},
});

type NewStaffProfileSchemaType = zod.infer<
	ReturnType<typeof getNewStaffProfileSchema>
>;

const defaultValues: NewStaffProfileSchemaType = {
	name: '',
	description: '',
	permissions: [],
	emails: [],
};

const NewStaffProfilePage = () => {
	const { t, i18n } = useTranslate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const dashboardContentRef = useRef<HTMLDivElement>(null);
	const [cardPosition, setCardPosition] = useState<{
		left: number;
		width: number;
	} | null>(null);

	const NewStaffProfileSchema = getNewStaffProfileSchema(defaultZodClient);

	const form = useForm<NewStaffProfileSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(NewStaffProfileSchema),
		defaultValues,
	});

	useSyncFormToLang(i18n.language, form);

	const { mutate: createProfile, isPending } = useCreateStaffProfile({
		onSuccess: () => {
			toast.success(t('profile-created-successfully'));
			queryClient.invalidateQueries({
				queryKey: useFindStaffProfiles.getKey(),
			});
			form.reset();
			router.push(FRONT_PATH_NAMES.staff.profiles.root);
		},
		onError: (error) => {
			if (isJsClientError(error)) {
				toast.error(
					error.key
						? t(error.key as never, { ns: I18N_NAMESPACES.RESPONSE_MESSAGE })
						: error.messageEscaped,
				);
				return;
			}
			toast.error(_.trim(error.message) || t('unknown-error'));
		},
	});

	const onSubmit = form.handleSubmit((data) => {
		createProfile({
			name: data.name,
			description: data.description || undefined,
			permissions: data.permissions,
			emails: data.emails,
		});
	});

	useEffect(() => {
		const updateCardPosition = () => {
			if (dashboardContentRef.current) {
				const rect = dashboardContentRef.current.getBoundingClientRect();
				setCardPosition({
					left: rect.left,
					width: rect.width,
				});
			}
		};

		updateCardPosition();

		window.addEventListener('resize', updateCardPosition);
		window.addEventListener('scroll', updateCardPosition, true);

		return () => {
			window.removeEventListener('resize', updateCardPosition);
			window.removeEventListener('scroll', updateCardPosition, true);
		};
	}, []);

	return (
		<DashboardContent
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				position: 'relative',
			}}
			compact
			maxWidth="lg"
		>
			<div
				ref={dashboardContentRef}
				style={{
					width: '100%',
					flex: 1,
					display: 'flex',
					flexDirection: 'column',
				}}
			>
				<CustomBreadcrumbs
					heading={getPageTitle(t as never)}
					links={[
						{
							name: _.capitalize(t('staff-profiles')),
							href: FRONT_PATH_NAMES.staff.profiles.root,
						},
						{
							name: _.capitalize(
								t('new-item', { item: _.toLower(t('staff-profile')) }),
							),
						},
					]}
					sx={{ mb: { xs: 3, md: 5 } }}
				/>

				<Form methods={form} onSubmit={onSubmit}>
					<NewStaffProfileForm />

					<CreateStaffProfileActions
						isPending={isPending}
						cardPosition={cardPosition}
					/>
				</Form>
			</div>
		</DashboardContent>
	);
};

export default NewStaffProfilePage;

type CreateStaffProfileActionsProps = {
	isPending: boolean;
	cardPosition: { left: number; width: number } | null;
};

const CreateStaffProfileActions = ({
	isPending,
	cardPosition,
}: CreateStaffProfileActionsProps) => {
	const { t } = useTranslate();

	const cardStyle = cardPosition
		? {
				position: 'fixed' as const,
				bottom: 20,
				left: cardPosition.left + cardPosition.width / 2,
				transform: 'translateX(-50%)',
			}
		: {
				position: 'sticky' as const,
				bottom: 20,
				left: '50%',
				transform: 'translateX(-50%)',
			};

	return (
		<FloatingCard
			placement="bottom-center"
			offset={20}
			sx={{
				...cardStyle,
				borderRadius: 2,
				display: 'flex',
				gap: 2,
				maxWidth: 700,
				padding: 1,
				width: 'fit-content',
				zIndex: 1000,
			}}
		>
			<Button
				type="submit"
				variant="contained"
				disabled={isPending}
				loading={isPending}
			>
				{_.capitalize(t('create-profile'))}
			</Button>
		</FloatingCard>
	);
};

```


Replacing the div with a MUI `Box` component:


```typescriptreact
import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { data } from 'react-router';
import type zod from 'zod';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { FloatingCard } from '@/front/components/floating-card';
import { Form } from '@/front/components/hook-form/form-provider';
import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';
import { useSyncFormToLang } from '@/front/hooks/use-sync-form-to-lang';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { isJsClientError } from '@/front/lib/js-client/js-client-error';
import {
	useCreateStaffProfile,
	useFindStaffProfiles,
} from '@/front/lib/react-query/features/staff/staff-profile.hooks';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	isServer,
} from '@/shared/lib/constants';
import { getNewStaffProfileSchema } from '@/shared/validations/staff-profile.validations';
import type { Route } from './+types/new-staff-profile-page';
import NewStaffProfileForm from './parts/new-staff-profile-form';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(
		t('new-item', { item: _.toLower(t('staff-profile')) }),
	);

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: getPageTitle(t, true),
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: getPageTitle(t, true),
				},
			],
		});
	},
});

type NewStaffProfileSchemaType = zod.infer<
	ReturnType<typeof getNewStaffProfileSchema>
>;

const defaultValues: NewStaffProfileSchemaType = {
	name: '',
	description: '',
	permissions: [],
	emails: [],
};

const NewStaffProfilePage = () => {
	const { t, i18n } = useTranslate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const dashboardContentRef = useRef<HTMLDivElement>(null);
	const [cardPosition, setCardPosition] = useState<{
		left: number;
		width: number;
	} | null>(null);

	const NewStaffProfileSchema = getNewStaffProfileSchema(defaultZodClient);

	const form = useForm<NewStaffProfileSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(NewStaffProfileSchema),
		defaultValues,
	});

	useSyncFormToLang(i18n.language, form);

	const { mutate: createProfile, isPending } = useCreateStaffProfile({
		onSuccess: () => {
			toast.success(t('profile-created-successfully'));
			queryClient.invalidateQueries({
				queryKey: useFindStaffProfiles.getKey(),
			});
			form.reset();
			router.push(FRONT_PATH_NAMES.staff.profiles.root);
		},
		onError: (error) => {
			if (isJsClientError(error)) {
				toast.error(
					error.key
						? t(error.key as never, { ns: I18N_NAMESPACES.RESPONSE_MESSAGE })
						: error.messageEscaped,
				);
				return;
			}
			toast.error(_.trim(error.message) || t('unknown-error'));
		},
	});

	const onSubmit = form.handleSubmit((data) => {
		createProfile({
			name: data.name,
			description: data.description || undefined,
			permissions: data.permissions,
			emails: data.emails,
		});
	});

	useEffect(() => {
		const updateCardPosition = () => {
			if (dashboardContentRef.current) {
				const rect = dashboardContentRef.current.getBoundingClientRect();
				setCardPosition({
					left: rect.left,
					width: rect.width,
				});
			}
		};

		updateCardPosition();

		window.addEventListener('resize', updateCardPosition);
		window.addEventListener('scroll', updateCardPosition, true);

		return () => {
			window.removeEventListener('resize', updateCardPosition);
			window.removeEventListener('scroll', updateCardPosition, true);
		};
	}, []);

	return (
		<DashboardContent
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				position: 'relative',
			}}
			compact
			maxWidth="lg"
		>
			<div
				ref={dashboardContentRef}
				style={{
					width: '100%',
					flex: 1,
					display: 'flex',
					flexDirection: 'column',
				}}
			>
				<CustomBreadcrumbs
					heading={getPageTitle(t as never)}
					links={[
						{
							name: _.capitalize(t('staff-profiles')),
							href: FRONT_PATH_NAMES.staff.profiles.root,
						},
						{
							name: _.capitalize(
								t('new-item', { item: _.toLower(t('staff-profile')) }),
							),
						},
					]}
					sx={{ mb: { xs: 3, md: 5 } }}
				/>

				<Form methods={form} onSubmit={onSubmit}>
					<NewStaffProfileForm />

					<CreateStaffProfileActions
						isPending={isPending}
						cardPosition={cardPosition}
					/>
				</Form>
			</div>
		</DashboardContent>
	);
};

export default NewStaffProfilePage;

type CreateStaffProfileActionsProps = {
	isPending: boolean;
	cardPosition: { left: number; width: number } | null;
};

const CreateStaffProfileActions = ({
	isPending,
	cardPosition,
}: CreateStaffProfileActionsProps) => {
	const { t } = useTranslate();

	const cardStyle = cardPosition
		? {
				position: 'fixed' as const,
				bottom: 20,
				left: cardPosition.left + cardPosition.width / 2,
				transform: 'translateX(-50%)',
			}
		: {
				position: 'sticky' as const,
				bottom: 20,
				left: '50%',
				transform: 'translateX(-50%)',
			};

	return (
		<FloatingCard
			placement="bottom-center"
			offset={20}
			sx={{
				...cardStyle,
				borderRadius: 2,
				display: 'flex',
				gap: 2,
				maxWidth: 700,
				padding: 1,
				width: 'fit-content',
				zIndex: 1000,
			}}
		>
			<Button
				type="submit"
				variant="contained"
				disabled={isPending}
				loading={isPending}
			>
				{_.capitalize(t('create-profile'))}
			</Button>
		</FloatingCard>
	);
};

```

```typescriptreact
import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { data } from 'react-router';
import type zod from 'zod';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { FloatingCard } from '@/front/components/floating-card';
import { Form } from '@/front/components/hook-form/form-provider';
import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';
import { useSyncFormToLang } from '@/front/hooks/use-sync-form-to-lang';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { isJsClientError } from '@/front/lib/js-client/js-client-error';
import {
	useCreateStaffProfile,
	useFindStaffProfiles,
} from '@/front/lib/react-query/features/staff/staff-profile.hooks';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	isServer,
} from '@/shared/lib/constants';
import { getNewStaffProfileSchema } from '@/shared/validations/staff-profile.validations';
import type { Route } from './+types/new-staff-profile-page';
import NewStaffProfileForm from './parts/new-staff-profile-form';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(
		t('new-item', { item: _.toLower(t('staff-profile')) }),
	);

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: getPageTitle(t, true),
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: getPageTitle(t, true),
				},
			],
		});
	},
});

type NewStaffProfileSchemaType = zod.infer<
	ReturnType<typeof getNewStaffProfileSchema>
>;

const defaultValues: NewStaffProfileSchemaType = {
	name: '',
	description: '',
	permissions: [],
	emails: [],
};

const NewStaffProfilePage = () => {
	const { t, i18n } = useTranslate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const dashboardContentRef = useRef<HTMLDivElement>(null);
	const [cardPosition, setCardPosition] = useState<{
		left: number;
		width: number;
	} | null>(null);

	const NewStaffProfileSchema = getNewStaffProfileSchema(defaultZodClient);

	const form = useForm<NewStaffProfileSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(NewStaffProfileSchema),
		defaultValues,
	});

	useSyncFormToLang(i18n.language, form);

	const { mutate: createProfile, isPending } = useCreateStaffProfile({
		onSuccess: () => {
			toast.success(t('profile-created-successfully'));
			queryClient.invalidateQueries({
				queryKey: useFindStaffProfiles.getKey(),
			});
			form.reset();
			router.push(FRONT_PATH_NAMES.staff.profiles.root);
		},
		onError: (error) => {
			if (isJsClientError(error)) {
				toast.error(
					error.key
						? t(error.key as never, { ns: I18N_NAMESPACES.RESPONSE_MESSAGE })
						: error.messageEscaped,
				);
				return;
			}
			toast.error(_.trim(error.message) || t('unknown-error'));
		},
	});

	const onSubmit = form.handleSubmit((data) => {
		createProfile({
			name: data.name,
			description: data.description || undefined,
			permissions: data.permissions,
			emails: data.emails,
		});
	});

	useEffect(() => {
		const updateCardPosition = () => {
			if (dashboardContentRef.current) {
				const rect = dashboardContentRef.current.getBoundingClientRect();
				setCardPosition({
					left: rect.left,
					width: rect.width,
				});
			}
		};

		updateCardPosition();

		window.addEventListener('resize', updateCardPosition);
		window.addEventListener('scroll', updateCardPosition, true);

		return () => {
			window.removeEventListener('resize', updateCardPosition);
			window.removeEventListener('scroll', updateCardPosition, true);
		};
	}, []);

	return (
		<DashboardContent
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				position: 'relative',
			}}
			compact
			maxWidth="lg"
		>
			<Box
				ref={dashboardContentRef}
				sx={{
					width: '100%',
					flex: 1,
					display: 'flex',
					flexDirection: 'column',
				}}
			>
				<CustomBreadcrumbs
					heading={getPageTitle(t as never)}
					links={[
						{
							name: _.capitalize(t('staff-profiles')),
							href: FRONT_PATH_NAMES.staff.profiles.root,
						},
						{
							name: _.capitalize(
								t('new-item', { item: _.toLower(t('staff-profile')) }),
							),
						},
					]}
					sx={{ mb: { xs: 3, md: 5 } }}
				/>

				<Form methods={form} onSubmit={onSubmit}>
					<NewStaffProfileForm />

					<CreateStaffProfileActions
						isPending={isPending}
						cardPosition={cardPosition}
					/>
				</Form>
			</Box>
		</DashboardContent>
	);
};

export default NewStaffProfilePage;

type CreateStaffProfileActionsProps = {
	isPending: boolean;
	cardPosition: { left: number; width: number } | null;
};

const CreateStaffProfileActions = ({
	isPending,
	cardPosition,
}: CreateStaffProfileActionsProps) => {
	const { t } = useTranslate();

	const cardStyle = cardPosition
		? {
				position: 'fixed' as const,
				bottom: 20,
				left: cardPosition.left + cardPosition.width / 2,
				transform: 'translateX(-50%)',
			}
		: {
				position: 'sticky' as const,
				bottom: 20,
				left: '50%',
				transform: 'translateX(-50%)',
			};

	return (
		<FloatingCard
			placement="bottom-center"
			offset={20}
			sx={{
				...cardStyle,
				borderRadius: 2,
				display: 'flex',
				gap: 2,
				maxWidth: 700,
				padding: 1,
				width: 'fit-content',
				zIndex: 1000,
			}}
		>
			<Button
				type="submit"
				variant="contained"
				disabled={isPending}
				loading={isPending}
			>
				{_.capitalize(t('create-profile'))}
			</Button>
		</FloatingCard>
	);
};

```


Checking for linting errors:



## Summary of Changes

1. **Added React hooks**: `useEffect`, `useRef`, and `useState` to track the `DashboardContent` position
2. **Added MUI Box import**: For the wrapper component
3. **Position tracking**: 
   - Created a ref (`dashboardContentRef`) to track the `DashboardContent` container
   - Added state (`cardPosition`) to store the calculated left position and width
   - Added a `useEffect` that calculates the position on mount and updates it on window resize and scroll events
4. **Updated FloatingCard positioning**:
   - Changed from `position: 'absolute'` to `position: 'fixed'` with calculated center position
   - The card's `left` is calculated as `cardPosition.left + cardPosition.width / 2` to center it relative to `DashboardContent`
   - Falls back to sticky positioning if the position hasn't been calculated yet

The floating card will now:
- Stay fixed/sticky at the bottom of the viewport
- Be centered relative to the `DashboardContent` container (respecting its `maxWidth="lg"`)
- Update dynamically when the window is resized or scrolled
- Maintain proper z-index to stay above other content

The card stays centered relative to `DashboardContent` rather than the viewport, so it aligns with the content area.

