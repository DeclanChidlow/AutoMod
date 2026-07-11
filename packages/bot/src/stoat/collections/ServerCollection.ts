import { BaseCollection } from "./BaseCollection";
import { Server } from "../structures/Server";

export class ServerCollection extends BaseCollection<Server> {
	async fetch(id: string): Promise<Server> {
		const existing = this.get(id);
		if (existing) return existing;

		const data = await this.client.api.get(`/servers/${id}`, {
			include_channels: true,
		});

		// Create channels from response
		if (data.channels) {
			for (const channel of data.channels) {
				if (typeof channel !== "string") {
					this.client.channels.getOrCreate(channel._id, channel);
				}
			}
		}

		return this.getOrCreate(data._id, data);
	}

	getOrCreate(id: string, data: any, isNew: boolean = false): Server {
		const existing = this.get(id);
		if (existing) return existing;

		this.underlying.set(id, { ...data });

		const instance = new Server(this, id);
		this.objects.set(id, instance);

		if (isNew) {
			try {
				this.client.emit("serverCreate", instance);
			} catch (_) {}
		}

		return instance;
	}

	getOrPartial(id: string): Server | undefined {
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
