import { MultipartBody } from '@microsoft/kiota-abstractions';
import { useMutation } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';

import type { ApiClient } from '@org/client-ts/apiClient';
import type { StaffUploadCreated } from '@org/client-ts/models/index';
import { buildStaffMutationOptions } from '@org/shared-ts/lib/query/create-hooks';

export type UploadStaffImageInput = {
	file: File;
};

const buildUploadImageBody = async (file: File): Promise<MultipartBody> => {
	const body = new MultipartBody();
	const content = new Uint8Array(await file.arrayBuffer());
	body.addOrReplacePart(
		'file',
		file.type || 'application/octet-stream',
		content,
		undefined,
		file.name,
	);

	return body;
};

const uploadStaffImageMutationOptions = buildStaffMutationOptions<
	ApiClient,
	StaffUploadCreated | undefined,
	UploadStaffImageInput
>(
	{
		mutationKeyFn: () => ['staff-uploads', 'create'],
		mutationFn: async (client, variables) =>
			client.staff.uploads.post(await buildUploadImageBody(variables.file)),
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

export const useUploadStaffImageMutation = () =>
	useMutation(uploadStaffImageMutationOptions);
