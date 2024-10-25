export type PublishResult = null; // ! we are going to see later

interface Publisher {
	publish(): Promise<PublishResult>;
	// publishMany(); // todo for later
}

export default Publisher;
