import { functionName } from '../../constants';
import type { ParseAppFile } from '../classes/appFile.class';
import type { ParsePost } from '../classes/post.class';

import { cloudRunner } from './_cloudRunner';

// ---- 1 --------------------------------------------------------------------------------

export type CreatePostFunctionParams = {
	locale: string;
	title: string;
	description: string;
	content: string;
	slug: string;
	author: Parse.User;
	cover?: ParseAppFile;
};

export const runCreatePost = cloudRunner<ParsePost, CreatePostFunctionParams>(functionName.createPost);
