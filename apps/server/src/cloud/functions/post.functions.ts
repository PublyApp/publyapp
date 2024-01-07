import { functionName, roleSet } from '@devist/shared/lib/constants';
import { getCreatePostInputSchema, getUpdatePostInputSchema } from '@devist/shared/validations/post.validations';

import { parseFrom } from '@/server/lib/parse';
import FileService from '@/server/services/file.service';
import PostService from '@/server/services/post.service';
import UserService from '@/server/services/user.service';

Parse.Cloud.define(
	functionName.createPost,
	parseFrom({
		requireUser: true,
		allowedRoles: roleSet.ABOVE_AUTHOR,
		action: async ({ req, t, user }) => {
			const createPostInputSchema = getCreatePostInputSchema(t);
			const { locale, title, description, content, slug, coverId /* , authorId */ } = createPostInputSchema.parse(
				req.params,
			);

			const sessionToken = user.getSessionToken();

			const postService = new PostService({ sessionToken });
			const fileService = new FileService({ sessionToken });

			const coverPromise = fileService.getById(coverId || '');

			return postService.create({
				locale,
				title,
				description,
				content,
				slug,
				author: user,
				cover: await coverPromise,
			});
		},
	}),
);

Parse.Cloud.define(
	functionName.updatePost,
	parseFrom({
		requireUser: true,
		allowedRoles: roleSet.ABOVE_AUTHOR,
		action: async ({ req, t, user }) => {
			const updatePostInputSchema = getUpdatePostInputSchema(t);
			const { locale, title, description, content, slug, authorId, objectId, published } = updatePostInputSchema.parse(
				req.params,
			);
			let coverId: string | undefined; // todo

			const sessionToken = user.getSessionToken();

			const postService = new PostService({ sessionToken });
			const userService = new UserService({ sessionToken });
			const fileService = new FileService({ sessionToken });

			const postPromise = postService.getById(objectId);
			const authorPromise = userService.getById(authorId || '');
			const coverPromise = fileService.getById(coverId || '');

			const post = await postPromise;

			if (!post) {
				throw new Error('(Post) not found');
			}

			return postService.update(post, {
				locale,
				title,
				description,
				content,
				slug,
				author: await authorPromise,
				cover: await coverPromise,
				published,
			});
		},
	}),
);
