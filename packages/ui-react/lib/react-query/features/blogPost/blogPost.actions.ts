import { queryOptions, type QueryFunctionContext } from '@tanstack/react-query';

import type { FindBlogPostFunction, GetBlogPostFunction } from '@/server/resources/blogPost/blogPost.functions';
import { fileProvider, functionName } from '@/shared/lib/constants';
import type { AppLocale } from '@/shared/lib/i18n/resources';
import type { AppFile } from '@/shared/types/db/appFile.types';
import { type IBlogPostWithRelations } from '@/shared/types/db/blogPost.types';
import type { CreateBlogPostFunctionParams, UpdatePostFunctionParams } from '@/ui-react/api/parse/blogPost.endpoints';
import parseApi from '@/ui-react/api/parse/ParseApi';
import { getImageFileFromUrl } from '@/ui-react/utils/image.utils';

export const getCoverFile = async (post: IBlogPostWithRelations) => {
	let coverFile: (File & { preview: string; alreadyUploaded?: boolean }) | undefined;

	if (post.cover && post.cover.url) {
		let origin = '';

		if (post.cover.provider === fileProvider.LOCAL_DISK && post.cover.url) {
			origin = parseApi.parseRestClient.serverUrl;
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
export type CreatePostActionParams = CreateBlogPostFunctionParams & {
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

		const post = await parseApi.blogPosts.createPost({ ...restParams, coverId: uploadResult?.objectId });
		return post;
	} catch (error) {
		console.log('----- createPostAction error ----------', error);
		return Promise.reject(error);
	}
};

// === findPost in Bo table =================
export type FindPostBoTableQueryParams = FindBlogPostFunction.BoTable.Params & { locale?: AppLocale };

const findPostQueryKeyBase = functionName.findBlogPostBoTable;

const findPostBoTableAction = async (
	context: QueryFunctionContext<readonly [typeof findPostQueryKeyBase, FindPostBoTableQueryParams]>,
) => {
	try {
		const params = context.queryKey[1];
		const posts = parseApi.blogPosts.findBlogPostBoTable(params);
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
export type GetPostBoEditFormQueryParams = GetBlogPostFunction.BoEdit.Params;

const getPostQueryKeyBase = functionName.getPostBoEdit;

const getPostBoEditFormAction = async (
	context: QueryFunctionContext<readonly [typeof getPostQueryKeyBase, GetPostBoEditFormQueryParams]>,
) => {
	try {
		const params = context.queryKey[1];

		// const post = await runGetPostById(params);
		const post = await parseApi.blogPosts.getPostBoEditForm(params);

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

		const post = await parseApi.blogPosts.updatePost({ ...restParams, coverId: uploadResult?.objectId });
		return post;
	} catch (error) {
		console.log('----- updatePostAction error ----------', error);
		return Promise.reject(error);
	}
};
