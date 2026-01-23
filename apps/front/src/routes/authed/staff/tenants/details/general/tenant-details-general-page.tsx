import _ from 'lodash';
import type { FC } from 'react';
import { useParams } from 'react-router';

import { View500 } from '@/front/components/error/500-view';
import QueryDisplay from '@/front/components/query-display';
import { useGetTenant } from '@/front/lib/react-query/features/staff/staff-tenant.hooks';
import { logger } from '@/shared/lib/logger/iso-logger';
import { getErrorMessage } from '@/shared/utils/error.utils';

import { TenantCreateOrEditFormSkeleton } from '../../components/tenant-create-form-skeleton';
import { TenantCreateOrEditForm } from '../../components/tenant-create-or-edit-form';

const TenantDetailsGeneralPage = () => {
	const { tenantId } = useParams();

	const getTenantQuery = useGetTenant({
		variables: { tenantId: _.toString(tenantId) },
		enabled: !!tenantId,
	});

	return (
		<QueryDisplay
			query={getTenantQuery}
			LoadingSlot={<TenantCreateOrEditFormSkeleton />}
			ErrorSlot={ErrorView}
		>
			{({ data }) => {
				return <TenantCreateOrEditForm currentTenant={data} />;
			}}
		</QueryDisplay>
	);
};

export default TenantDetailsGeneralPage;

const ErrorView: FC<{ error: unknown }> = ({ error }) => {
	logger.error(getErrorMessage(error), { error });
	// const { t } = useTranslate();

	// if (error instanceof ParseRestError) {
	// 	if (error.code === X_CODE.USER_NOT_FOUND) {
	// 		return (
	// 			<NotFoundView
	// 				withLayout={false}
	// 				title={t('item-not-found', { item: t('user') })}
	// 				description={t('user-not-found-description')}
	// 			/>
	// 		);
	// 	}

	// 	if (_.toString(error.httpStatusCode).startsWith('4')) {
	// 		return <View400 withLayout />;
	// 	}
	// }

	return <View500 withLayout={false} />;
};
