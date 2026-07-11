import { BaseCollection } from "./BaseCollection";
import { ServerMember } from "../structures/ServerMember";

export class ServerMemberCollection extends BaseCollection<ServerMember> {
	hasByKey(id: { server: string; user: string }): boolean {
		return this.has(id.server + id.user);
	}

	getByKey(id: { server: string; user: string }): ServerMember | undefined {
		return this.get(id.server + id.user);
	}

	async fetch(serverId: string, userId: string): Promise<ServerMember> {
		const key = serverId + userId;
		const existing = this.get(key);
		if (existing) return existing;

		const data = await this.client.api.get(`/servers/${serverId}/members/${userId}`);
		return this.getOrCreate(data._id, data);
	}

	/** Always fetch from the REST API, bypassing the local cache. */
	async fetchFresh(serverId: string, userId: string): Promise<ServerMember> {
		const data = await this.client.api.get(`/servers/${serverId}/members/${userId}`);
		// Update the cache with fresh data
		const key = serverId + userId;
		const existing = this.get(key);
		if (existing) {
			this.updateUnderlyingObject(key, data);
			return existing;
		}
		return this.getOrCreate(data._id, data);
	}

	getOrCreate(id: { server: string; user: string }, data: any): ServerMember {
		const key = id.server + id.user;
		const existing = this.get(key);
		if (existing) return existing;

		this.underlying.set(key, { ...data });

		const instance = new ServerMember(this, id);
		this.objects.set(key, instance);
		return instance;
	}

	getOrPartial(id: { server: string; user: string }): ServerMember | undefined {
		const key = id.server + id.user;
		return this.get(key);
	}

	getUnderlyingObject(key: string): any {
		return this.underlying.get(key) || {};
	}

	updateUnderlyingObject(key: string, updates: any, third?: any): void {
		if (typeof updates === "string") {
			const prop = updates;
			const value = third;
			const existing = this.underlying.get(key) || {};
			existing[prop] = value;
			this.underlying.set(key, existing);
		} else {
			const existing = this.underlying.get(key) || {};
			this.underlying.set(key, { ...existing, ...updates });
		}
	}
}
