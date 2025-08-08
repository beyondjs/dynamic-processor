import { DynamicProcessor } from '@beyond-js/dynamic-processor/main';

export class Test extends DynamicProcessor(Map<string, number>) {
	get dp() {
		return 'test';
	}
}

const t = new Test();
const xx: number = t.get('xx');
