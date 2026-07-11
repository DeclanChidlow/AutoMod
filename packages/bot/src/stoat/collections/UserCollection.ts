import { BaseCollection } from "./BaseCollection";
import { User } from "../structures/User";

export class UserCollection extends BaseCollection<User> {
	constructor(client: any) {
		super(client);
		// Add system user
		const SYSTEM_ID = "0".repeat(26);
		this.getOrCreate(SYSTEM_ID, {
			_id: SYSTEM_ID,
			username: "Revolt",
			discriminator: "0000",
			online: true,
			relationship: "None",
		});
	}

	async fetch(id: string): Promise<User> {
		const existing = this.get(id);
		if (existing) return existing;

		const data = await this.client.api.get(`/users/${id}`);
		return this.getOrCreate(data._id, data);
	}

	getOrCreate(id: string, data: any): User {
		const existing = this.get(id);
		if (existing) return existing;

		this.underlying.set(id, { ...data });

		const instance = new User(this, id);
		this.objects.set(id, instance);
		return instance;
	}

	getOrPartial(id: string): User | undefined {
		return this.get(id);
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
