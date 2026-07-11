import { BaseCollection } from "./BaseCollection";
import { Message } from "../structures/Message";

const MAX_MESSAGES = 50_000;

export class MessageCollection extends BaseCollection<Message> {
	getOrCreate(id: string, data: any, _isNew?: boolean): Message {
		const existing = this.get(id);
		if (existing) {
			this.updateUnderlyingObject(id, data);
			return existing;
		}

		// Evict oldest entries when over capacity
		if (this.objects.size >= MAX_MESSAGES) {
			const oldest = this.objects.keys().next().value;
			if (oldest) {
				this.objects.delete(oldest);
				this.underlying.delete(oldest);
			}
		}

		this.underlying.set(id, { ...data });

		const instance = new Message(this, id);
		this.objects.set(id, instance);
		return instance;
	}

	getOrPartial(id: string): Message | undefined {
		return this.get(id);
	}

	isPartial(_id: string): boolean {
		return false;
	}

	getUnderlyingObject(id: string): any {
		return this.underlying.get(id) || {};
	}

	updateUnderlyingObject(id: string, updates: any, third?: any): void {
		if (typeof updates === "string") {
			const prop = updates;
			const value = third;
			const existing = this.underlying.get(id) || {};
			existing[prop] = value;
			this.underlying.set(id, existing);
		} else {
			const existing = this.underlying.get(id) || {};
			this.underlying.set(id, { ...existing, ...updates });
		}
	}
}
