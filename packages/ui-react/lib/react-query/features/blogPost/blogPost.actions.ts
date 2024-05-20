import { queryOptions, type QueryFunctionContext } from '@tanstack/react-query';

import type { FindBlogPostFunction, GetBlogPostFunction } from '@/server/resources/blogPost/blogPost.functions';
import { fileProvider, functionName } from '@/shared/lib/constants';
import type { AppLocale } from '@/shared/lib/i18n/resources';
import type { AppFile } from '@/shared/types/db/appFile.types';
import { type IBlogPostWithRelations } from '@/shared/types/db/blogPost.types';
import type {
	CreateBlogPostFunctionParams,
	UpdateBlogPostFunctionParams,
} from '@/ui-react/api/parse/features/blogPost.endpoints';
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

// == createBlogPost ==================
export type CreateBlogPostActionParams = CreateBlogPostFunctionParams & {
	coverFile?: File & { preview?: string; appFileId?: string };
};

export const createBlogPostMutationKeyBase = functionName.createBlogPost;

export const createBlogPostAction = async (params: CreateBlogPostActionParams) => {
	try {
		const { coverFile, ...restParams } = params;

		let uploadResult: AppFile | undefined;

		if (coverFile && !coverFile.appFileId) {
			uploadResult = await parseApi.appFiles.uploadSingleFile({ file: coverFile });
			// Object.assign(coverFile, { appFileId: uploadResult.objectId });
		}

		const post = await parseApi.blogPosts.createBlogPost({ ...restParams, coverId: uploadResult?.objectId });
		return post;
	} catch (error) {
		console.log('----- createBlogPostAction error ----------', error);
		return Promise.reject(error);
	}
};

// === findBlogPost in Bo table =================
export type FindBlogPostBoTableQueryParams = FindBlogPostFunction.BoTable.Params & { locale?: AppLocale };

const findBlogPostQueryKeyBase = functionName.findBlogPostBoTable;

const findBlogPostBoTableAction = async (
	context: QueryFunctionContext<readonly [typeof findBlogPostQueryKeyBase, FindBlogPostBoTableQueryParams]>,
) => {
	try {
		const params = context.queryKey[1];
		const posts = parseApi.blogPosts.findBlogPostBoTable(params);
		return await posts;
	} catch (error) {
		console.log('----- findBlogPostBoTableAction error ----------', error);
		return Promise.reject(error);
	}
};

export const findBlogPostBoTableQuery = (params?: FindBlogPostBoTableQueryParams) => {
	return queryOptions({
		queryKey: [findBlogPostQueryKeyBase, params as never] as const,
		queryFn: findBlogPostBoTableAction,
	});
};

// == getBlogPost in Bo Edition form ===================
export type GetBlogPostBoEditFormQueryParams = GetBlogPostFunction.BoEdit.Params;

const getBlogPostQueryKeyBase = functionName.getBlogPostBoEdit;

const getBlogPostBoEditFormAction = async (
	context: QueryFunctionContext<readonly [typeof getBlogPostQueryKeyBase, GetBlogPostBoEditFormQueryParams]>,
) => {
	try {
		const params = context.queryKey[1];

		// const post = await runGetBlogPostById(params);
		const post = await parseApi.blogPosts.getBlogPostBoEditForm(params);

		const coverFile = await getCoverFile(post);

		return {
			...post,
			coverFile,
		};
	} catch (error) {
		console.log('----- getBlogPostBoEditFormAction error ----------', error);
		return Promise.reject(error);
	}
};

export const getBlogPostBoEditFormQuery = (params?: GetBlogPostBoEditFormQueryParams) => {
	return queryOptions({
		queryKey: [getBlogPostQueryKeyBase, params as never] as const,
		queryFn: getBlogPostBoEditFormAction,
	});
};

// == updateBlogPost ===================
export type UpdateBlogPostActionParams = UpdateBlogPostFunctionParams & {
	coverFile?: File & { preview?: string; appFileId?: string };
};

export const updateBlogPostMutationKeyBase = functionName.updateBlogPost;

export const updateBlogPostAction = async (params: UpdateBlogPostActionParams) => {
	try {
		const { coverFile, ...restParams } = params;

		let uploadResult: AppFile | undefined;

		if (coverFile && !coverFile.appFileId) {
			uploadResult = await parseApi.appFiles.uploadSingleFile({ file: coverFile });
		}

		const post = await parseApi.blogPosts.updateBlogPost({ ...restParams, coverId: uploadResult?.objectId });
		return post;
	} catch (error) {
		console.log('----- updateBlogPostAction error ----------', error);
		return Promise.reject(error);
	}
};
