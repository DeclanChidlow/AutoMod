export interface RestConfig {
	baseURL: string;
	authentication?: {
		headers?: Record<string, string>;
		revolt?: string | { token: string };
		rauth?: string;
	};
	headers?: Record<string, string>;
}

export class API {
	baseURL: string;
	private authentication: RestConfig["authentication"];
	private extraHeaders: Record<string, string>;

	constructor(config: Partial<RestConfig> = {}) {
		this.baseURL = config.baseURL || "https://stoat.chat/api";
		this.authentication = config.authentication || {};
		this.extraHeaders = config.headers || {};
	}

	private get authHeaders(): Record<string, string> {
		const auth = this.authentication;
		if (auth?.rauth) {
			return typeof auth.rauth === "string" ? { "X-Session-Token": auth.rauth } : {};
		}
		if (auth?.revolt) {
			if (typeof auth.revolt === "string") {
				return { "X-Bot-Token": auth.revolt };
			}
			if (typeof auth.revolt === "object" && auth.revolt.token) {
				return { "X-Session-Token": auth.revolt.token };
			}
		}
		if (auth?.headers) {
			return auth.headers;
		}
		return {};
	}

	get config(): { baseURL: string; headers: Record<string, string> } {
		return {
			baseURL: this.baseURL,
			headers: {
				...this.authHeaders,
				...this.extraHeaders,
			},
		};
	}

	private async req(method: string, path: string, params?: any, config?: { baseURL?: string; headers?: Record<string, string>; responseType?: string }, _retries: number = 3): Promise<any> {
		let url: string;
		if (path.startsWith("http")) {
			url = path;
		} else {
			url = (config?.baseURL || this.baseURL) + path;
		}

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			...this.config.headers,
			...(config?.headers || {}),
		};

		let body: string | undefined;
		if (params && !["get", "head"].includes(method.toLowerCase())) {
			body = JSON.stringify(params);
		}

		const fetchUrl = new URL(url);
		if (params && ["get", "head"].includes(method.toLowerCase())) {
			for (const [key, value] of Object.entries(params)) {
				if (value !== undefined && value !== null) {
					fetchUrl.searchParams.append(key, String(value));
				}
			}
		}

		const response = await fetch(fetchUrl.toString(), {
			method: method.toUpperCase(),
			headers,
			body,
		});

		// Rate limit: wait and retry (retry_after is in the JSON body)
		if (response.status === 429 && _retries > 0) {
			let retryAfter = 1000;
			try {
				const body = JSON.parse(await response.text());
				retryAfter = body.retry_after || 1000;
			} catch (_) {
				/* use default */
			}
			console.warn(`[API] Rate limited on ${method.toUpperCase()} ${path}, waiting ${retryAfter}ms (${_retries} retries left)`);
			await new Promise((r) => setTimeout(r, retryAfter + 100));
			return this.req(method, path, params, config, _retries - 1);
		}

		if (response.status === 204) return null;

		const respType = config?.responseType || "json";
		let data: any;

		if (respType === "json") {
			const text = await response.text();
			if (!response.ok) throw text;
			data = JSON.parse(text);
		} else if (respType === "text") {
			data = await response.text();
			if (!response.ok) throw data;
		} else {
			data = await response.arrayBuffer();
			if (!response.ok) throw data;
		}

		return data;
	}

	async get(path: string, params?: any, config?: any): Promise<any> {
		return this.req("get", path, params, config);
	}

	async post(path: string, params?: any, config?: any): Promise<any> {
		return this.req("post", path, params, config);
	}

	async patch(path: string, params?: any, config?: any): Promise<any> {
		return this.req("patch", path, params, config);
	}

	async put(path: string, params?: any, config?: any): Promise<any> {
		return this.req("put", path, params, config);
	}

	async delete(path: string, params?: any, config?: any): Promise<any> {
		return this.req("delete", path, params, config);
	}
}
