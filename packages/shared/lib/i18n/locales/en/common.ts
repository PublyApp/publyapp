// ====

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
	link: 'Link',
	logo: 'Logo',

	// ? ...
	views: 'Views',
	'created-at': 'Created at',
	'edit-post': 'Edit post',
	draft: 'Draft',
	edit: 'Edit',
	published: 'Published',
	'invalid-number': 'Invalid number',
	new: 'New',
	'your-description': 'Your description',
	'your-title': 'Your title',
	'your-content': 'Your content',
	'publish-date': 'Publish date',
	'update-date': 'Update Date',
	save: 'Save',
	preview: 'Preview',
	list: 'List',
	settings: 'Settings',
	overview: 'Overview',
	'staff-member': 'Staff member',
	'staff-members': 'Staff members',

	// ???
	'item-is-required': '{{item}} is required',
	'item-not-found': '{{item}} not found',
	'item-is-invalid': '{{item}} is invalid',
	'invalid-item': 'Invalid {{item}}',
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
	'auth-welcome-title': 'Welcome back',
	cancel: 'Cancel',
	confirm: 'Confirm',
	'item-creation-success-message': '{{item}} created successfully',
	'cannot-create-tenant-with-staff-members':
		'Cannot create tenant with staff members',
	NO_STAFF_MEMBERS_ALLOWED_IN_TENANT:
		'The following emails are owned by staff-members; they are not allowed to be assigned to any tenant: {{emails}}',

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
	'no-account-yet': 'No account yet?',
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

	'new-signup-disabled': 'New signup are disabled',
	'set-as-current': 'Set as current',
	'slug-linked-to-another-post': 'Slug to another article',

	'list-of-items': 'List of {{items}}',
	unauthorized: 'Unauthorized',
	'too-many-invalid-requests': 'Too many invalid requests',

	firstname: 'Firstname',
	lastname: 'Name',
	'save-item-confirmation-title': 'Save {{item}}?',
	'save-item-confirmation-message':
		'{{item}} will be saved with the following informations. Please confirm.',

	'invalid-email-verification-link-description':
		'The verification link you issued is invalid or expired. Contact your administrator to get a new link.',

	'workspace-name': 'Workspace name',
	'create-the-tenant': 'Create the tenant',
	'add-a-user': 'Add a user',
	'max-users': 'Maximum users number',
	'tenant-should-have-at-least-one-admin':
		'A tenant should have at least one admin',
	'each-user-must-have-a-unique-email':
		'Each user must have a unique email address.',
	'initial-users': 'Initial users',
	'max-users-reached': 'Maximum users number reached',
	'initial-users-must-be-a-valid-json-string':
		'Initial users must be a valid JSON string',

	'signup-title': 'Sign up',
	'signup-are-disabled': 'Sign up are disabled for now',
	'create-account': 'Create account',
	'already-have-account-question': 'Already have an account?',

	'Error while uploading file': 'Error while uploading file',
	'Internal server error': 'Internal server error',

	// messages from parse
	'User email is not verified.': 'User email is not verified.',
	'Session token is expired.': 'Session token is expired.',
	'Invalid username/password.': 'Invalid username/password.',
	'Invalid session token': 'Invalid session token',
	'Invalid token': 'Invalid token',
	'Token expired': 'Token expired',
	'Invalid object for context.': 'Invalid object for context.',
	'Context is not an object': 'Context is not an object',
} as const;

export type LooseCommonNamespace = ToPrimitive<typeof commonEN>;

export default commonEN;
