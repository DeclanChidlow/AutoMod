import { decodeTime } from "ulid";
import { File } from "./File";

export class User {
	private collection: any;
	id: string;

	constructor(collection: any, id: string) {
		this.collection = collection;
		this.id = id;
	}

	private get client(): any {
		return this.collection.client;
	}
	private get data(): any {
		return this.collection.getUnderlyingObject(this.id) || {};
	}

	get createdAt() {
		return new Date(decodeTime(this.id));
	}
	get username() {
		return this.data.username;
	}
	get discriminator() {
		return this.data.discriminator;
	}
	get displayName() {
		return this.data.displayName ?? this.data.username;
	}
	get avatar() {
		const a = this.data.avatar;
		return a ? new File(this.client, a) : undefined;
	}
	get online() {
		return this.data.online ?? false;
	}
	get flags() {
		return this.data.flags;
	}
	get bot() {
		return this.data.bot;
	}
	get relationship() {
		return this.data.relationship;
	}
	get defaultAvatarURL() {
		return `${this.client.options.baseURL}/users/${this.id}/default_avatar`;
	}
	get avatarURL() {
		return this.avatar?.createFileURL() ?? this.defaultAvatarURL;
	}
	get presence() {
		return this.online ? (this.status?.presence ?? "Online") : "Invisible";
	}

	private get status() {
		if (!this.online) return { text: undefined, presence: "Invisible" };
		return this.data.status;
	}

	toString() {
		return `<@${this.id}>`;
	}

	async openDM() {
		const channels = this.client.channels;
		let dm = [...channels.values()].find((x: any) => x.type === "DirectMessage" && x.recipient?.id === this.id);
		if (dm) {
			if (!dm.active) channels.updateUnderlyingObject(dm.id, "active", true);
			return dm;
		}
		const data = await this.client.api.get(`/users/${this.id}/dm`);
		return channels.getOrCreate(data._id, data);
	}

	async edit(data: any) {
		await this.client.api.patch(`/users/${this.id === this.client.user?.id ? "@me" : this.id}`, data);
	}
}
