import { BaseCollection } from "./BaseCollection";
import { Channel } from "../structures/Channel";

export class ChannelCollection extends BaseCollection<Channel> {
	delete(id: string): void {
		const channel = this.get(id);
		if (channel) {
			const server = channel.server;
			if (server) {
				const sdata = this.client.servers.getUnderlyingObject(server.id);
				const channelIds: string[] = sdata.channelIds ?? sdata.channels ?? [];
				const idx = channelIds.indexOf(id);
				if (idx !== -1) channelIds.splice(idx, 1);
			}
		}
		super.delete(id);
	}

	async fetch(id: string): Promise<Channel> {
		const existing = this.get(id);
		if (existing) return existing;

		const data = await this.client.api.get(`/channels/${id}`);
		return this.getOrCreate(data._id, data);
	}

	getOrCreate(id: string, data: any, isNew: boolean = false): Channel {
		const existing = this.get(id);
		if (existing) {
			this.updateUnderlyingObject(id, data);
			return existing;
		}

		this.underlying.set(id, data);

		const instance = new Channel(this, id);
		this.objects.set(id, instance);

		if (isNew) {
			try {
				this.client.emit("channelCreate", instance);
			} catch (_) {}
		}

		return instance;
	}

	getOrPartial(id: string): Channel | undefined {
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
