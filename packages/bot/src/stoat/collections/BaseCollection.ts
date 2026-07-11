/**
 * Base collection class backed by a plain Map.
 */

export class BaseCollection<T> {
	client: any;
	protected objects: Map<string, T> = new Map();
	protected underlying: Map<string, any> = new Map();

	constructor(client: any) {
		this.client = client;
	}

	getUnderlyingObject(key: string): any {
		return this.underlying.get(key) || {};
	}

	updateUnderlyingObject(key: string, updates: any): void {
		if (typeof updates === "string") {
			// Called as updateUnderlyingObject(key, propName, value)
			// We handle this in the specific collections
			return;
		}
		const existing = this.underlying.get(key) || {};
		this.underlying.set(key, { ...existing, ...updates });
	}

	/**
	 * Update a single property on the underlying object.
	 * Called as updateUnderlyingObject(key, propName, value)
	 */
	updateUnderlyingProp(key: string, prop: string, value: any): void {
		const existing = this.underlying.get(key) || {};
		existing[prop] = value;
		this.underlying.set(key, existing);
	}

	get(key: string): T | undefined {
		return this.objects.get(key);
	}

	has(key: string): boolean {
		return this.objects.has(key);
	}

	delete(key: string): void {
		this.objects.delete(key);
		this.underlying.delete(key);
	}

	getOrCreate(_id: any, _data: any, _isNew?: boolean): T {
		throw new Error("getOrCreate must be implemented by subclass");
	}

	size(): number {
		return this.objects.size;
	}

	keys(): IterableIterator<string> {
		return this.objects.keys();
	}

	values(): IterableIterator<T> {
		return this.objects.values();
	}

	entries(): IterableIterator<[string, T]> {
		return this.objects.entries();
	}

	forEach(cb: (value: T, key: string) => void): void {
		this.objects.forEach(cb);
	}

	find(predicate: (value: T, key: string) => boolean): T | undefined {
		for (const [key, value] of this.objects.entries()) {
			if (predicate(value, key)) return value;
		}
		return undefined;
	}

	filter(predicate: (value: T, key: string) => boolean): T[] {
		const result: T[] = [];
		for (const [key, value] of this.objects.entries()) {
			if (predicate(value, key)) result.push(value);
		}
		return result;
	}

	map<U>(cb: (value: T, key: string) => U): U[] {
		const result: U[] = [];
		for (const [key, value] of this.objects.entries()) {
			result.push(cb(value, key));
		}
		return result;
	}

	protected createInstance(id: string, data: any): T {
		// Update underlying data
		this.underlying.set(id, { ...data });
		// Create the wrapper instance. Override in subclass
		throw new Error("createInstance must be implemented by subclass");
	}

	protected storeInstance(id: string, instance: T): void {
		this.objects.set(id, instance);
	}
}
