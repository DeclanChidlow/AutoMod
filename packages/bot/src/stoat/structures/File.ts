import type { RawFile } from "../types";

export class File {
	id: string;
	tag: string;
	filename?: string;
	metadata: { type: string; width?: number; height?: number };
	size?: number;

	private client: any;

	constructor(client: any, data: RawFile) {
		this.client = client;
		this.id = data._id;
		this.tag = data.tag;
		this.filename = data.filename;
		this.metadata = data.metadata;
		this.size = data.size;
	}

	/**
	 * Create a proxied file URL through January or direct autumn URL.
	 */
	createFileURL(_maxSide?: number | { max_side?: number }, _isAnimated?: boolean): string {
		const config = this.client.configuration;
		const autumnUrl = config?.features?.autumn?.url;
		if (!autumnUrl) return "";

		let url = `${autumnUrl}/${this.tag}/${this.id}`;
		if (this.filename) {
			url += `/${this.filename}`;
		}

		// Proxy through January if enabled
		if (config?.features?.january?.enabled) {
			url = `${config.features.january.url}/proxy?url=${encodeURIComponent(url)}`;
		}

		return url;
	}
}
