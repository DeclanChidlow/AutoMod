const PORT = parseInt(process.env.WEB_PORT || "8080");
const API_URL = process.env.PUBLIC_API_URL || "http://localhost:9000";
const BASE_PATH = (process.env.BASE_PATH || "").replace(/\/$/, "");

const titles: Record<string, string> = {
	"/index.html": "Login",
	"/server.html": "Server Dashboard",
};

async function servePage(contentPath: string, basePath: string): Promise<Response> {
	const [layout, content] = await Promise.all([
		Bun.file("./static/layout.html").text(),
		Bun.file(`./static/pages${contentPath}`)
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

		const serverRoutePattern = /^\/[^/.]+(\/anti-spam)?\/?$/;
		if (serverRoutePattern.test(path)) {
			path = "/server.html";
		}

		if (path === "/" || path === "") path = "/index.html";

		if (path.endsWith(".html")) {
			return servePage(path, BASE_PATH);
		}

		const file = Bun.file(`./static${path}`);
		if (await file.exists()) {
			return new Response(file);
		}

		return new Response("Not found", { status: 404 });
	},
});

console.log(`Web server: http://0.0.0.0:${PORT}`);
console.log(`Base path: ${BASE_PATH || "(root)"}`);
console.log(`API backend: ${API_URL}`);
