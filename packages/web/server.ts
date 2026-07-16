import { resolve } from "node:path";

const PORT = parseInt(process.env.WEB_PORT || "8080");
const API_URL = process.env.PUBLIC_API_URL || "http://localhost:9000";
const BASE_PATH = (process.env.BASE_PATH || "").replace(/\/$/, "");

const STATIC_ROOT = resolve("./static");

const titles: Record<string, string> = {
	"/index.html": "Dashboard",
	"/server.html": "Server Dashboard",
};

function isSafePath(requested: string): boolean {
	const normalized = requested.startsWith("/") ? requested.slice(1) : requested;
	const resolved = resolve(STATIC_ROOT, normalized);
	return resolved.startsWith(STATIC_ROOT + "/") || resolved === STATIC_ROOT;
}

async function servePage(contentPath: string, basePath: string): Promise<Response> {
	if (!isSafePath(contentPath)) {
		return new Response("Forbidden", { status: 403 });
	}

	const [layout, content] = await Promise.all([
		Bun.file(resolve(STATIC_ROOT, "layout.html")).text(),
		Bun.file(resolve(STATIC_ROOT, "pages", contentPath.replace(/^\//, "")))
			.text()
			.catch(() => null),
	]);
	if (content === null) return new Response("Not found", { status: 404 });

	const title = titles[contentPath] || "Dashboard";
	const html = layout
		.replace(/{{base_path}}/g, basePath)
		.replace("{{title}}", title)
		.replace("{{content}}", content.replace(/{{base_path}}/g, basePath));
	return new Response(html, { headers: { "Content-Type": "text/html" } });
}

Bun.serve({
	port: PORT,
	async fetch(req) {
		const url = new URL(req.url);
		let path = url.pathname;

		if (BASE_PATH && path.startsWith(BASE_PATH)) {
			path = path.slice(BASE_PATH.length) || "/";
		}

		if (path === "/config.js") {
			return new Response(
				`const API_BASE = ${JSON.stringify(API_URL)};\nconst BASE_PATH = ${JSON.stringify(BASE_PATH)};`,
				{
					headers: { "Content-Type": "application/javascript" },
				},
			);
		}

		if (path === "/") path = "/index.html";

		if (path.endsWith(".html")) {
			return servePage(path, BASE_PATH);
		}

		if (isSafePath(path)) {
			const file = Bun.file(resolve(STATIC_ROOT, path.replace(/^\//, "")));
			if (await file.exists()) {
				return new Response(file);
			}
		}

		const serverRoutePattern = /^\/[^/.]+(\/anti-spam)?\/?$/;
		if (serverRoutePattern.test(path)) {
			return servePage("/server.html", BASE_PATH);
		}

		return new Response("Not found", { status: 404 });
	},
});

console.log(`Web server: http://0.0.0.0:${PORT}`);
console.log(`Base path: ${BASE_PATH || "(root)"}`);
console.log(`API backend: ${API_URL}`);
