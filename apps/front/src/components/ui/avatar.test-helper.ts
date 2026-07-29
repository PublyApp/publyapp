export class MockImage {
	static instances: MockImage[] = [];

	onerror: (() => void) | null = null;
	onload: (() => void) | null = null;
	src = '';

	constructor() {
		MockImage.instances.push(this);
	}
}
