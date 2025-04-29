const commonEN = {
	hello: 'Hello',
	userHasNoEmail: 'User has no email',

	// item types
	authentication: 'Authentication',
	content: 'Content',
	cover: 'Cover',
	field: 'Field',
	file: 'File',
	locale: 'Locale',
	name: 'Name',
	post: 'Post',
	role: 'Role',
	title: 'Title',
	translation: 'Translation',
	user: 'User',
	users: 'Users',
	number: 'Number',
	tenant: 'Tenant',
	tenants: 'Tenants',
	status: 'Status',

	// ? ...
	views: 'Views',
	'created-at': 'Created at',
	published: 'Published',
	draft: 'Draft',
	'invalid-number': 'Invalid number',
	new: 'New',
	'your-description': 'Your description',
	'your-title': 'Your title',
	'your-content': 'Your content',
	'publish-date': 'Publish date',
	'update-date': 'Update Date',
	save: 'Save',
	preview: 'Preview',
	'edit-post': 'Edit post',
	edit: 'Edit',
	list: 'List',
	settings: 'Settings',
	overview: 'Overview',
	'staff-member': 'Staff member',
	'staff-members': 'Staff members',

	// ???
	'item-is-required': '{{item}} is required',
	'item-not-found': '{{item}} not found',
	'item-is-invalid': '{{item}} is invalid',
	'new-item': 'New {{item}}',
	'item-is-not-instance-of-type': '{{item}} is not instance of {{type}}',
	'item-not-translated-short': '{{item}} not translated',
	'item-not-translated':
		'This {{item}} is not yet translated in the current language',
	'find-otherLanguage-version-of-item':
		'Find the {{otherLanguage}} version of this {{item}}',
	here: 'Here',
	'down-here': 'Down here',
	'unknown-item': 'Unknown {{item}}',
	'pricing-plan': 'Pricing plan',

	// very specific sentences
	'unknown-error': 'Unknown error',
	'invalid-session': 'Invalid session',
	'user-is-not-staff': 'User is not from internal staff',
	'insufficient-role': 'Insufficient role',
	'new-post': 'New post',
	'user-has-no-email': 'User has no email',
	'an-error-occurred': 'An error occurred',
	retry: 'Retry',
	'read-more': 'Read more',
	'page-not-found': 'Page not found',
	'not-found-sentence':
		"Sorry, we couldn't find the page you're looking for. Perhaps you've mistyped the URL? Be sure to check your spelling.",
	'go-to-home': 'Go to home',
	'other-posts': 'Other posts',

	'sign-in': 'Sign in',
	'sign-up': 'Sign up',
	'create-an-account': 'Create an account',
	'email-address': 'Email address',
	password: 'Password',
	'forgot-password': 'Forgot password',
	login: 'Login',
	'verify-my-email': 'Verify my email',

	'manage-blog-post-slugs': "Manage this blog post's slugs",
	'slug-already-used': 'Slug already used by another post',
	'slugify-current-title': 'Slugify current title',
	'add-slug': 'Add slug',
	'slug-added-to-post': 'Slug added to post',

	'master-key-only-function': 'Master Key only function',
	'max-page-size-exceeded': 'Max page size of {{max}} exceeded',

	'blog-list-meta-title': 'Discover Our Latest Articles | Devist Blog',
	'blog-list-og-title': 'Discover Our Latest Articles',
	'blog-list-meta-description':
		'Explore our latest blog posts for insightful articles, tips, and stories. Stay updated with our blog.',

	'blog-post-meta-title': '{{title}} | Devist blog',
	// 'blog-post-og-title': '{{title}}',
	// 'blog-post-meta-description':
	// 	'{{description}}',

	'new-signup-disabled': 'New signup are disabled',
	'set-as-current': 'Set as current',
	'slug-linked-to-another-post': 'Slug to another article',

	'list-of-items': 'List of {{items}}',
	unauthorized: 'Unauthorized',

	// messages from parse
	'User email is not verified.': 'User email is not verified.',
	'Session token is expired.': 'Session token is expired.',
	'Invalid username/password.': 'Invalid username/password.',
	'Invalid session token': 'Invalid session token',
} as const;

export type LooseCommonNamespace = ToPrimitive<typeof commonEN>;

export default commonEN;
