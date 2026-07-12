const AUTH_USER_KEY = "automod_user",
	AUTH_TOKEN_KEY = "automod_token";
function getSession() {
	const u = localStorage.getItem(AUTH_USER_KEY);
	const t = localStorage.getItem(AUTH_TOKEN_KEY);
	return u && t ? { user: u, token: t } : null;
}
function saveSession(user, token) {
	localStorage.setItem(AUTH_USER_KEY, user);
	localStorage.setItem(AUTH_TOKEN_KEY, token);
}
function clearSession() {
	localStorage.removeItem(AUTH_USER_KEY);
	localStorage.removeItem(AUTH_TOKEN_KEY);
}
function isLoggedIn() {
	return getSession() !== null;
}
function authHeaders() {
	const s = getSession();
	return s ? { "x-auth-user": s.user, "x-auth-token": s.token } : {};
}

async function request(method, path, body) {
	const headers = { ...authHeaders() };
	const opts = { method, headers };
	if (body !== undefined) {
		headers["Content-Type"] = "application/json";
		opts.body = JSON.stringify(body);
	}
	const res = await fetch(API_BASE + path, opts);
	if (res.status === 401) {
		clearSession();
		window.location.href = "/";
		throw new Error("Session expired. Please log in again.");
	}
	const text = await res.text();
	let data;
	try {
		data = text ? JSON.parse(text) : {};
	} catch (_) {
		data = { error: text };
	}
	if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
	return data;
}

function clearError() {
	const e = document.getElementById("page-error");
	if (e) {
		e.textContent = "";
		e.style.display = "none";
	}
}
function showError(msg) {
	const e = document.getElementById("page-error");
	if (e) {
		e.textContent = msg;
		e.style.display = "";
	}
}

function escHtml(s) {
	const d = document.createElement("div");
	d.textContent = s || "";
	return d.innerHTML;
}
function desc(text) {
	return `<p class="field-desc">${text}</p>`;
}

const PERMS = { 0: "User", 1: "Moderator", 2: "Manager", 3: "Owner" };
const ACTIONS = { 0: "Delete", 1: "Message", 2: "Warn", 3: "Kick", 4: "Ban" };

function fmtServerStats(s) {
	const parts = [];
	if (s.channelCount != null) parts.push(`${s.channelCount} channels`);
	if (s.roleCount != null) parts.push(`${s.roleCount} roles`);
	return parts.join(" · ");
}

function fmtServerSub(s) {
	const parts = [];
	if (s.ownerName) parts.push(`Owned by ${escHtml(s.ownerName)}`);
	if (s.createdAt) {
		const d = new Date(s.createdAt);
		parts.push(`Created ${d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`);
	}
	return parts.join(" · ");
}

(function initNavbar() {
	if (!isLoggedIn() && window.location.pathname !== "/") {
		window.location.href = "/";
		return;
	}
	document.getElementById("nav-right").innerHTML = isLoggedIn() ? `<a href="#" id="logout-link">Logout</a>` : ``;
	const logoutLink = document.getElementById("logout-link");
	if (logoutLink)
		logoutLink.addEventListener("click", (e) => {
			e.preventDefault();
			clearSession();
			window.location.href = "/";
		});
})();
