import { EventEmitter } from "events";
import { WebSocket } from "ws";
import { ConnectionState } from "./types";
export { ConnectionState };

export interface WsOptions {
	heartbeatInterval?: number; // seconds between pings (default 30)
	pongTimeout?: number; // seconds to wait for pong (default 10)
	connectTimeout?: number; // seconds to wait for connection (default 15)
	autoReconnect?: boolean;
	retryDelayFunction?: (retryCount: number) => number;
	debug?: boolean;
}

const DEFAULT_OPTIONS: Required<WsOptions> = {
	heartbeatInterval: 30,
	pongTimeout: 10,
	connectTimeout: 60,
	autoReconnect: true,
	retryDelayFunction: (count: number) => (Math.pow(2, count) - 1) * (0.8 + Math.random() * 0.4),
	debug: false,
};

export class EventClient extends EventEmitter {
	private options: Required<WsOptions>;
	private socket: WebSocket | undefined;
	private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
	private pongTimer: ReturnType<typeof setTimeout> | undefined;
	private connectTimer: ReturnType<typeof setTimeout> | undefined;
	private _state: ConnectionState = ConnectionState.Idle;
	private _ping: number = -1;
	private closed = false;
	private _heartbeatStarted = false;

	constructor(
		private protocolVersion: number = 1,
		private transportFormat: "json" | "msgpack" = "json",
		options: WsOptions = {},
	) {
		super();
		this.options = { ...DEFAULT_OPTIONS, ...options };
	}

	get state(): ConnectionState {
		return this._state;
	}

	/**
	 */
	ping(): number {
		return this._ping;
	}

	private setState(state: ConnectionState) {
		this._state = state;
		const labels = ["Idle", "Connecting", "Connected", "Disconnected"];
		console.info("[WS] state: %s", labels[state] || state);
		this.emit("state", state);
	}

	connect(uri: string, token: string, readyFields?: string[]) {
		this.closed = true;
		this.disconnect();
		this.closed = false;
		this.setState(ConnectionState.Connecting);

		const url = new URL(uri);
		url.searchParams.set("version", String(this.protocolVersion));
		url.searchParams.set("format", this.transportFormat);
		url.searchParams.set("token", token);
		if (readyFields && readyFields.length > 0) {
			for (const field of readyFields) {
				url.searchParams.append("ready", field);
			}
		}

		if (this.options.debug) console.debug(`[WS] Connecting to ${url.toString()}`);

		this.connectTimer = setTimeout(() => {
			if (this.options.debug) console.debug("[WS] Connection timeout");
			this.emit("error", new Error("WebSocket connection timed out"));
			this.disconnect();
		}, this.options.connectTimeout * 1000);

		this.socket = new WebSocket(url.toString());

		this.socket.on("open", () => {
			console.info("[WS] socket opened");
			if (this.options.debug) console.debug("[WS] Socket open");
			// Heartbeat starts after Ready — not here.
			// Starting it too early risks pong timeouts while the server
			// prepares the initial Ready payload for large bots.
		});

		this.socket.on("error", (error) => {
			// Only emit if there are listeners — prevents crash when no error handler is attached
			if (this.listenerCount("error") > 0) {
				this.emit("error", error);
			} else {
				console.error("[WS] WebSocket error (no handler):", (error as any)?.message || error);
				this.disconnect();
			}
		});

		this.socket.on("message", (data: WebSocket.Data) => {
			clearTimeout(this.connectTimer);

			if (this.transportFormat === "json") {
				try {
					const event = JSON.parse(data.toString());
					if (this.options.debug) console.debug("[S->C]", event);
					this.handle(event);
				} catch (e) {
					console.error("[WS] Failed to parse message:", e);
				}
			}
		});

		this.socket.on("close", (code, reason) => {
			if (this.options.debug) console.debug(`[WS] Socket closed: ${code} ${reason}`);
			this.cleanup();
			if (!this.closed) {
				this.setState(ConnectionState.Disconnected);
			}
		});
	}

	private _startHeartbeat(): void {
		if (this._heartbeatStarted) return;
		this._heartbeatStarted = true;
		this.heartbeatTimer = setInterval(() => {
			this.send({ type: "Ping", data: +new Date() });
			this.pongTimer = setTimeout(() => {
				if (this.options.debug) console.debug("[WS] Pong timeout");
				this.disconnect();
			}, this.options.pongTimeout * 1000);
		}, this.options.heartbeatInterval * 1000);
	}

	private handle(event: any) {
		switch (event.type) {
			case "Ping":
				this.send({ type: "Pong", data: event.data });
				return;
			case "Pong":
				clearTimeout(this.pongTimer);
				this._ping = +new Date() - event.data;
				if (this.options.debug) console.debug(`[ping] ${this._ping}ms`);
				return;
			case "Error":
				this.emit("error", event);
				this.disconnect();
				return;
			case "Bulk":
				for (const item of event.v) this.handle(item);
				return;
		}

		switch (this._state) {
			case ConnectionState.Connecting:
				if (event.type === "Authenticated") {
					console.info("[WS] Authenticated received");
				} else if (event.type === "Ready") {
					const serverCount = event.servers?.length ?? 0;
					const channelCount = event.channels?.length ?? 0;
					console.info(`[WS] Ready received: ${serverCount} servers, ${channelCount} channels`);
					this.emit("event", event);
					this.setState(ConnectionState.Connected);
					this._startHeartbeat();
				}
				break;
			case ConnectionState.Connected:
				if (event.type !== "Authenticated" && event.type !== "Ready") {
					this.emit("event", event);
				}
				break;
		}
	}

	send(event: any) {
		if (this.options.debug) console.debug("[C->S]", event);
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
			throw new Error("Socket closed, trying to send.");
		}
		this.socket.send(JSON.stringify(event));
	}

	private cleanup() {
		clearInterval(this.heartbeatTimer);
		clearTimeout(this.connectTimer);
		clearTimeout(this.pongTimer);
		this._heartbeatStarted = false;
	}

	disconnect() {
		this.cleanup();
		const sock = this.socket;
		this.socket = undefined;
		if (sock) {
			try {
				sock.close();
			} catch (_) {
				/* ignore */
			}
		}
	}

	get lastError(): any {
		return undefined;
	}
}
