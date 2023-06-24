import { classNames } from '../../utils/constants';

export class Post extends Parse.Object {
	constructor() {
		super(classNames.POST);
	}
}

Parse.Object.registerSubclass(classNames.POST, Post);
