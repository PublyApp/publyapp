import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import type { Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import toStr from 'lodash/toString';
import { useDebounce } from 'minimal-shared/hooks';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useParams } from 'react-router';
import { z } from 'zod';

import type { TenantAsStaffListItem } from '@org/client-ts/src/models';
import {
	ACCOUNT_LEVEL_ENUM,
	type AccountLevel,
} from '@org/shared-ts/lib/constants';

import DrawerAnchor from '#app/components/drawer-anchor.tsx';
import { Field, Form } from '#app/components/hook-form/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getFailureMessage, toApiFailure } from '#app/lib/api-failure/index.ts';
import {
	useAssignTenantUserCompanies,
	useFindTenants,
} from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';

import { invalidateTenantUserCompanyQueries } from './tenant-user-companies-cache.ts';

type TenantOption = {
	id: string;
	name: string;
	status?: string;
	logoUrl?: string;
};

const tenantOptionSchema = z.object({
	id: z.string().min(1),
	name: z.string(),
	status: z.string().optional(),
	logoUrl: z.string().optional(),
});

const linkCompanyFormSchema = z.object({
	tenants: z.array(tenantOptionSchema).min(1),
	level: z.enum([ACCOUNT_LEVEL_ENUM.USER, ACCOUNT_LEVEL_ENUM.ADMIN]),
});

type LinkCompanyFormValues = z.infer<typeof linkCompanyFormSchema>;

type TenantUserLinkCompanyDrawerProps = {
	open: boolean;
	onClose: () => void;
};

const defaultValues: LinkCompanyFormValues = {
	tenants: [],
	level: ACCOUNT_LEVEL_ENUM.USER,
};
const EMPTY_TENANT_OPTIONS: TenantOption[] = [];
const getDrawerOverlaySx = (theme: Theme) => ({
	zIndex: theme.zIndex.modal + 2,
});

const TenantUserLinkCompanyDrawer = ({
	open,
	onClose,
}: TenantUserLinkCompanyDrawerProps) => {
	const { t } = useTranslate();
	const { userId = '' } = useParams();
	const queryClient = useQueryClient();
	const [tenantSearchValue, setTenantSearchValue] = useState('');
	const debouncedTenantSearchValue = useDebounce(tenantSearchValue, 250);

	const methods = useForm<LinkCompanyFormValues>({
		resolver: zodResolver(linkCompanyFormSchema),
		defaultValues,
	});
	const selectedTenants =
		useWatch({
			control: methods.control,
			name: 'tenants',
		}) ?? EMPTY_TENANT_OPTIONS;

	const tenantsQuery = useFindTenants({
		variables: {
			limit: 20,
			sort: { id: 'name', order: 'asc' },
			q: debouncedTenantSearchValue || undefined,
		},
		enabled: open,
	});

	const tenantOptions = useMemo<TenantOption[]>(() => {
		return mergeTenantOptions(
			selectedTenants,
			(tenantsQuery.data?.data ?? []).map(mapTenantOption),
		);
	}, [selectedTenants, tenantsQuery.data?.data]);

	const { mutate: assignCompanies, isPending } = useAssignTenantUserCompanies({
		meta: { skipGlobalErrorHandler: true },
		onSuccess: async (result) => {
			const succeeded = result.succeededCount ?? 0;
			const failed = result.failedCount ?? 0;

			if (failed > 0) {
				toast.warning(
					t('tenant-user-company-assign-partial-success', {
						succeeded,
						failed,
					}),
				);
			} else {
				toast.success(
					t('tenant-user-company-assign-success', {
						count: succeeded,
					}),
				);
			}

			methods.reset(defaultValues);
			setTenantSearchValue('');
			onClose();
			await invalidateTenantUserCompanyQueries({ queryClient, userId });
		},
		onError: (error: unknown) => {
			toast.error(
				getFailureMessage(toApiFailure(error), {
					fallback: t('tenant-user-company-assign-failure'),
				}),
			);
		},
	});

	const handleClose = () => {
		if (!isPending) {
			methods.reset(defaultValues);
			setTenantSearchValue('');
			onClose();
		}
	};

	const handleSubmit = methods.handleSubmit((values) => {
		assignCompanies({
			userId,
			level: values.level as AccountLevel,
			tenantIds: values.tenants.map((tenant) => tenant.id),
		});
	});

	return (
		<Drawer
			open={open}
			onClose={handleClose}
			anchor="right"
			sx={(theme) => ({
				zIndex: theme.zIndex.modal + 1,
			})}
			slotProps={{
				paper: {
					sx: {
						width: { xs: 1, sm: 420 },
						overflow: 'unset',
					},
				},
			}}
		>
			<DrawerAnchor
				onClick={handleClose}
				aria-label={t('close')}
				sx={(theme) => ({
					left: 0,
					zIndex: theme.zIndex.modal + 3,
				})}
			>
				<Iconify icon="mingcute:close-line" width={18} />
			</DrawerAnchor>
			<Form
				methods={methods}
				onSubmit={handleSubmit}
				slotProps={{
					form: {
						sx: {
							height: 1,
							display: 'flex',
							flexDirection: 'column',
						},
					},
				}}
			>
				<Stack spacing={3} sx={{ p: 3, flexGrow: 1 }}>
					<Stack spacing={0.75}>
						<Typography variant="h6">{t('link-to-company')}</Typography>
						<Typography variant="body2" sx={{ color: 'text.secondary' }}>
							{t('link-tenant-user-companies-description')}
						</Typography>
					</Stack>

					<Field.Autocomplete<TenantOption>
						multiple
						disableCloseOnSelect
						filterSelectedOptions
						name="tenants"
						label={t('companies')}
						placeholder={t('search-companies')}
						options={tenantOptions}
						loading={tenantsQuery.isFetching}
						inputValue={tenantSearchValue}
						onInputChange={(_event, value, reason) => {
							if (reason !== 'reset') {
								setTenantSearchValue(value);
							}
						}}
						isOptionEqualToValue={(option, value) => option.id === value.id}
						getOptionLabel={getTenantOptionLabel}
						renderOption={(props, option) => {
							const { key, ...optionProps } = props;
							const tenantOption = normalizeTenantOption(option);

							return (
								<Box component="li" key={key} {...optionProps}>
									<Stack spacing={0.25} sx={{ minWidth: 0 }}>
										<Typography variant="body2" noWrap>
											{tenantOption.name}
										</Typography>
										<Typography
											variant="caption"
											noWrap
											sx={{ color: 'text.secondary' }}
										>
											{tenantOption.id}
										</Typography>
									</Stack>
								</Box>
							);
						}}
						slotProps={{
							popper: {
								sx: getDrawerOverlaySx,
							},
							textfield: {
								required: true,
							},
						}}
					/>

					<Field.Select
						name="level"
						label={t('level')}
						required
						slotProps={{
							select: {
								MenuProps: {
									slotProps: {
										root: {
											sx: getDrawerOverlaySx,
										},
										paper: {
											sx: getDrawerOverlaySx,
										},
									},
								},
							},
						}}
					>
						<MenuItem value={ACCOUNT_LEVEL_ENUM.USER}>{t('user')}</MenuItem>
						<MenuItem value={ACCOUNT_LEVEL_ENUM.ADMIN}>{t('admin')}</MenuItem>
					</Field.Select>
				</Stack>

				<Stack
					direction="row"
					spacing={1}
					justifyContent="flex-end"
					sx={{
						p: 3,
						borderTop: (theme) => `solid 1px ${theme.vars.palette.divider}`,
					}}
				>
					<Button color="inherit" onClick={handleClose} disabled={isPending}>
						{t('cancel')}
					</Button>
					<Button
						type="submit"
						variant="contained"
						disabled={isPending || userId.length === 0}
						startIcon={<Iconify width={16} icon="mingcute:add-line" />}
					>
						{t('link-to-company')}
					</Button>
				</Stack>
			</Form>
		</Drawer>
	);
};

export default TenantUserLinkCompanyDrawer;

const mapTenantOption = (tenant: TenantAsStaffListItem): TenantOption => {
	return {
		id: toStr(tenant.id),
		name: tenant.name ?? '',
		status: tenant.status ?? undefined,
		logoUrl: tenant.logoUrl ?? undefined,
	};
};

const mergeTenantOptions = (
	selectedOptions: TenantOption[],
	fetchedOptions: TenantOption[],
) => {
	const optionsById = new Map<string, TenantOption>();

	for (const option of selectedOptions) {
		if (option.id) {
			optionsById.set(option.id, option);
		}
	}

	for (const option of fetchedOptions) {
		if (option.id) {
			optionsById.set(option.id, option);
		}
	}

	return Array.from(optionsById.values());
};

const getTenantOptionLabel = (option: string | TenantOption) => {
	if (typeof option === 'string') {
		return option;
	}

	return option.name;
};

const normalizeTenantOption = (option: string | TenantOption): TenantOption => {
	if (typeof option === 'string') {
		return {
			id: option,
			name: option,
		};
	}

	return option;
};
