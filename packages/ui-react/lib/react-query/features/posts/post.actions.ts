import { queryOptions, type QueryFunctionContext } from '@tanstack/react-query';

import type { FindPostFunction, GetPostFunction } from '@/server/resources/post/post.functions';
import { fileProvider, functionName } from '@/shared/lib/constants';
import type { AppLocale } from '@/shared/lib/i18n/resources';
import type { AppFile } from '@/shared/types/db/appFile.types';
import { type IPostWithRelations } from '@/shared/types/db/post.types';
import parseApi from '@/ui-react/api/parse/ParseApi';
import type { CreatePostFunctionParams, UpdatePostFunctionParams } from '@/ui-react/api/parse/post.endpoints';
import { getImageFileFromUrl } from '@/ui-react/utils/image.utils';

export const getCoverFile = async (post: IPostWithRelations) => {
	let coverFile: (File & { preview: string; alreadyUploaded?: boolean }) | undefined;

	if (post.cover && post.cover.url) {
		let origin = '';

		if (post.cover.provider === fileProvider.LOCAL_DISK) {
			const url = new URL(parseApi.parseRestClient.parseServerUrl);
			origin = url.origin;
		}

		// eslint-disable-next-line @typescript-eslint/naming-convention
		const _coverFile = await getImageFileFromUrl(origin + post.cover.url, post.cover.displayName);

		coverFile = Object.assign(_coverFile, {
			preview: URL.createObjectURL(_coverFile),
			appFileId: post.cover.objectId,
		});
	}

	return coverFile;
};

// == createPost ==================
export type CreatePostActionParams = CreatePostFunctionParams & {
	coverFile?: File & { preview?: string; appFileId?: string };
};

export const createPostMutationKeyBase = functionName.createPost;

export const createPostAction = async (params: CreatePostActionParams) => {
	try {
		const { coverFile, ...restParams } = params;

		let uploadResult: AppFile | undefined;

		if (coverFile && !coverFile.appFileId) {
			uploadResult = await parseApi.appFiles.uploadSingleFile({ file: coverFile });
			// Object.assign(coverFile, { appFileId: uploadResult.objectId });
		}

		const post = await parseApi.posts.createPost({ ...restParams, coverId: uploadResult?.objectId });
		return post;
	} catch (error) {
		console.log('----- createPostAction error ----------', error);
		return Promise.reject(error);
	}
};

// === findPost in Bo table =================
export type FindPostBoTableQueryParams = FindPostFunction.BoTable.Params & { locale?: AppLocale };

const findPostQueryKeyBase = functionName.findPostBoTable;

const findPostBoTableAction = async (
	context: QueryFunctionContext<readonly [typeof findPostQueryKeyBase, FindPostBoTableQueryParams]>,
) => {
	try {
		const params = context.queryKey[1];
		const posts = parseApi.posts.findPostBoTable(params);
		return await posts;
	} catch (error) {
		console.log('----- findPostBoTableAction error ----------', error);
		return Promise.reject(error);
	}
};

export const findPostBoTableQuery = (params?: FindPostBoTableQueryParams) => {
	return queryOptions({
		queryKey: [findPostQueryKeyBase, params as never] as const,
		queryFn: findPostBoTableAction,
	});
};

// == getPost in Bo Edition form ===================
export type GetPostBoEditFormQueryParams = GetPostFunction.BoEdit.Params;

const getPostQueryKeyBase = functionName.getPostBoEdit;

const getPostBoEditFormAction = async (
	context: QueryFunctionContext<readonly [typeof getPostQueryKeyBase, GetPostBoEditFormQueryParams]>,
) => {
	try {
		const params = context.queryKey[1];

		// const post = await runGetPostById(params);
		const post = await parseApi.posts.getPostById(params);

		const coverFile = await getCoverFile(post);

		return {
			...post,
			coverFile,
		};
	} catch (error) {
		console.log('----- getPostBoEditFormAction error ----------', error);
		return Promise.reject(error);
	}
};

export const getPostBoEditFormQuery = (params?: GetPostBoEditFormQueryParams) => {
	return queryOptions({
		queryKey: [getPostQueryKeyBase, params as never] as const,
		queryFn: getPostBoEditFormAction,
	});
};

// == updatePost ===================
export type UpdatePostActionParams = UpdatePostFunctionParams & {
	coverFile?: File & { preview?: string; appFileId?: string };
};

export const updatePostMutationKeyBase = functionName.updatePost;

export const updatePostAction = async (params: UpdatePostActionParams) => {
	try {
		const { coverFile, ...restParams } = params;

		let uploadResult: AppFile | undefined;

		if (coverFile && !coverFile.appFileId) {
			uploadResult = await parseApi.appFiles.uploadSingleFile({ file: coverFile });
		}

		const post = await parseApi.posts.updatePost({ ...restParams, coverId: uploadResult?.objectId });
		return post;
	} catch (error) {
		console.log('----- updatePostAction error ----------', error);
		return Promise.reject(error);
	}
};
