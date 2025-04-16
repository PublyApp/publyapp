/**
 * @interface
 * @memberof module:Adapters
 * Mail Adapter prototype
 * A MailAdapter should implement at least sendMail()
 */
export interface MailAdapter {
	/**
	 * A method for sending mail
	 * @param options would have the parameters
	 * - to: the recipient
	 * - text: the raw text of the message
	 * - subject: the subject of the email
	 */
	sendMail(options: {
		to: string;
		text: string;
		subject: string;
	}): Promise<void>;

	/* You can implement those methods if you want
	 * to provide HTML templates etc...
	 */
	// sendVerificationEmail({ link, appName, user }) {}
	// sendPasswordResetEmail({ link, appName, user }) {}

	sendVerificationEmail({
		link,
		appName,
		user,
	}: {
		link: string;
		appName: string;
		user: Parse.User;
	}): Promise<void>;
	sendPasswordResetEmail({
		link,
		appName,
		user,
	}: {
		link: string;
		appName: string;
		user: Parse.User;
	}): Promise<void>;
}

// export default MailAdapter;
