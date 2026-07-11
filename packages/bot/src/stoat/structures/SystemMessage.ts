import type { RawSystemMessage } from "../types";

export class SystemMessage {
	private data: RawSystemMessage;

	constructor(data: RawSystemMessage) {
		this.data = data;
	}

	get type(): string {
		return this.data.type;
	}

	get userId(): string | undefined {
		return this.data.userId ?? this.data.id;
	}

	get by(): string | undefined {
		return this.data.by;
	}

	get content(): string | undefined {
		return this.data.content;
	}
}

export interface UserSystemMessage extends SystemMessage {
	type: "user_kicked" | "user_banned" | "user_joined" | "user_left";
	userId: string;
}
