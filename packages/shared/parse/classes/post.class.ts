import { className } from '../../utils/constants';

export class Post extends Parse.Object {
	constructor() {
		super(className.POST);
	}
}

Parse.Object.registerSubclass(className.POST, Post);
