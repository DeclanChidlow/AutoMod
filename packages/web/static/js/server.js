const parts = window.location.pathname.split("/");
const serverId = BASE_PATH ? parts[2] : parts[1];
if (!serverId) {
	document.getElementById("content").innerHTML += "<h1>Invalid server</h1>";
	throw new Error("No server ID");
}

const isAntiSpamURL = /\/anti-spam\/?$/.test(window.location.pathname);
let activeTab = isAntiSpamURL ? "anti-spam" : "settings";
let antispamLoaded = false;
let antispamLoading = false;
let rules = [];

function switchTab(tab, pushState = true) {
	if (activeTab === tab) return;
	activeTab = tab;

	const settingsEl = document.getElementById("tab-settings");
	const antispamEl = document.getElementById("tab-anti-spam");
	if (settingsEl) settingsEl.hidden = tab !== "settings";
	if (antispamEl) antispamEl.hidden = tab !== "anti-spam";

	document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));

	const newPath = tab === "anti-spam" ? `${BASE_PATH}/${serverId}/anti-spam` : `${BASE_PATH}/${serverId}`;
	if (pushState) history.pushState({ tab }, "", newPath);
	document.title = tab === "anti-spam" ? "Anti-Spam | AutoMod" : "Server Settings | AutoMod";

	if (tab === "anti-spam" && !antispamLoaded) loadAntiSpam();
}

window.addEventListener("popstate", (e) => {
	const tab = e.state?.tab || (/\/anti-?spam\/?$/.test(window.location.pathname) ? "anti-spam" : "settings");
	switchTab(tab, false);
});

(async function init() {
	const main = document.getElementById("content");
	document.querySelector(".loading")?.remove();
	try {
		const data = await request("GET", `/dash/server/${serverId}`);
		const s = data.server;
		const perms = s.perms || 0;
		const cfg = s.serverConfig || {};
		const managers = cfg.botManagers || [];
		const mods = cfg.moderators || [];

		main.innerHTML += `<hgroup>
						<h1>Server Dashboard</h1>
						<p>Manage AutoMod's presence in the server ${escHtml(s.name || s.id)}.</p>
					</hgroup>

        <div class="server-header">
						<div class="title">
							${s.iconURL ? `<img src="${escHtml(s.iconURL)}" alt="">` : ""}
							<h2>${escHtml(s.name || s.id)}</h2>
						</div>
						<ul>
							<li class="perm-badge perm-${perms}">${PERMS[perms]}</li>
							<li class="server-stats">${fmtServerStats(s)} | ${fmtServerSub(s)}</li>
						</ul>
						${s.description ? `<p>${escHtml(s.description)}</p>` : ""}
        </div>
        <div class="tabs">
						<a href="${BASE_PATH}/${serverId}" class="tab${activeTab === "settings" ? " active" : ""}" data-tab="settings">Settings</a>
						<a href="${BASE_PATH}/${serverId}/anti-spam" class="tab${activeTab === "anti-spam" ? " active" : ""}" data-tab="anti-spam">Anti-Spam</a>
        </div>

					<div id="tab-settings" class="tab-content"${activeTab !== "settings" ? " hidden" : ""}>
						<div class="settings">
							${perms >= 2 ? renderConfig(cfg, s.defaultPrefix, s.botId) : `<p>You need Manager permissions to edit server configuration.</p>`}
							${perms >= 3 ? renderUserSection("managers", "Bot Managers", managers, true) : ""}
							${perms >= 2 ? renderUserSection("mods", "Moderators", mods, true) : ""}
						</div>
					</div>

					<div id="tab-anti-spam" class="tab-content"${activeTab !== "anti-spam" ? " hidden" : ""}>
						<div class="loading">Loading anti-spam rules…</div>
					</div>`;

		document.querySelectorAll(".tab").forEach((tab) => {
			tab.addEventListener("click", (e) => {
				e.preventDefault();
				switchTab(tab.dataset.tab);
			});
		});

		if (perms >= 2) bindConfigForms();
		if (perms >= 3) bindUserActions("managers");
		if (perms >= 2) bindUserActions("mods");

		if (activeTab === "anti-spam") loadAntiSpam();
	} catch (e) {
		main.innerHTML += `<h1>Server Settings</h1><p>${escHtml(e.message)}</p><a href="${BASE_PATH}/" class="btn btn-primary">Back to Servers</a>`;
	}
})();

function renderConfig(cfg, defaultPrefix, botId) {
	const vk = cfg.votekick || {};
	const mention = botId ? `<@${botId}>` : "@AutoMod";
	return `<section><h2>General</h2><form id="config-form">
    <div class="form-field"><label>Command Prefix</label><p class="field-desc">You can always use <code>${mention}</code> instead of a prefix. Global default is <code>${escHtml(defaultPrefix || "/")}</code>. Leave empty to use the default.</p><input type="text" id="prefix" value="${escHtml(cfg.prefix || "")}"></div>
    <div class="form-field"><label><input type="checkbox" id="spaceAfterPrefix" ${cfg.spaceAfterPrefix ? "checked" : ""}>Space after prefix</label><p class="field-desc">Whether a space is required between the prefix and command (eg <code>?kick</code> vs <code>? kick</code>).</p></div>
    <div class="form-field"><label><input type="checkbox" id="dmOnKick" ${cfg.dmOnKick ? "checked" : ""}>DM on kick</label><p class="field-desc">Sends a direct message to the user when they're kicked, with reason and moderator info.</p></div>
    <div class="form-field"><label><input type="checkbox" id="dmOnBan" ${cfg.dmOnBan ? "checked" : ""}>DM on ban</label>${desc("Sends a direct message to the user when they're banned, including the reason, moderator info, and ban duration.")}</div>
	<div class="form-field"><label><input type="checkbox" id="dmOnWarn" ${cfg.dmOnWarn ? "checked" : ""}>DM on warn</label><p class="field-desc">Sends a direct message to the user when they're warned, with reason and moderator info.</p></div>
    <div class="form-field"><label><input type="checkbox" id="antispamEnabled" ${cfg.antispamEnabled ? "checked" : ""}>Anti-Spam enabled</label><p class="field-desc">Toggles the automatic spam detection module.</p></div>
    <button type="submit" class="btn btn-primary">Save Configuration</button>
</form></section>

<section><h2>Votekick</h2><form id="votekick-form">
    <div class="form-field"><label><input type="checkbox" id="enabled" ${vk.enabled ? "checked" : ""}>Enable votekicking</label><p class="field-desc">Allows members to vote to kick or ban a user.</p></div>
    <div class="form-field"><label>Votes required</label><p class="field-desc">How many votes are needed for the votekick to pass.</p><input type="number" id="votesRequired" value="${vk.votesRequired || 3}" min="1"></div>
    <div class="form-field"><label>On votekick pass</label><p class="field-desc">What happens when enough members vote.</p>
        <select id="action">
            <option value="-1" ${(vk.banDuration ?? -1) === -1 ? "selected" : ""}>Kick the user</option>
            <option value="0" ${(vk.banDuration ?? -1) === 0 ? "selected" : ""}>Ban permanently</option>
            <option value="custom" ${(vk.banDuration ?? -1) > 0 ? "selected" : ""}>Ban for a duration</option>
        </select>
    </div>
    <div class="form-field" id="duration-field"${(vk.banDuration ?? -1) > 0 ? "" : " hidden"}>
        <label>Ban duration (minutes)</label><p class="field-desc">How many minutes the temporary ban lasts.</p>
        <input type="number" id="banDuration" value="${(vk.banDuration ?? -1) > 0 ? vk.banDuration : 60}" min="1">
    </div>
    <button type="submit" class="btn btn-primary">Save Votekick</button>
</form></section>

<section id="wordlist-section"><div class="loading">Loading wordlist…</div></section>`;
}

function bindConfigForms() {
	document.getElementById("config-form").addEventListener("submit", async (e) => {
		e.preventDefault();
		const btn = e.target.querySelector("button");
		btn.disabled = true;
		btn.textContent = "Saving…";
		try {
			clearError();
			await request("PUT", `/dash/server/${serverId}/config`, {
				prefix: document.getElementById("prefix").value || null,
				spaceAfterPrefix: document.getElementById("spaceAfterPrefix").checked,
				dmOnKick: document.getElementById("dmOnKick").checked,
				dmOnWarn: document.getElementById("dmOnWarn").checked,
				antispamEnabled: document.getElementById("antispamEnabled").checked,
				dmOnBan: document.getElementById("dmOnBan").checked,
			});
		} catch (err) {
			showError(err.message);
		}
		btn.disabled = false;
		btn.textContent = "Save Configuration";
	});

	document.getElementById("votekick-form").addEventListener("submit", async (e) => {
		e.preventDefault();
		const btn = e.target.querySelector("button");
		btn.disabled = true;
		btn.textContent = "Saving…";
		try {
			const action = document.getElementById("action").value;
			const banDuration = action === "custom" ? Number(document.getElementById("banDuration").value) : Number(action);
			clearError();
			await request("PUT", `/dash/server/${serverId}/config`, {
				votekickEnabled: document.getElementById("enabled").checked,
				votekickVotesRequired: Number(document.getElementById("votesRequired").value),
				votekickBanDuration: banDuration,
			});
		} catch (err) {
			showError(err.message);
		}
		btn.disabled = false;
		btn.textContent = "Save Votekick";
	});

	const vkAction = document.getElementById("action");
	const vkDuration = document.getElementById("duration-field");
	if (vkAction && vkDuration) {
		vkAction.addEventListener("change", () => {
			vkDuration.hidden = vkAction.value !== "custom";
		});
	}

	loadWordlist();
}

function renderUserSection(key, title, items, editable) {
	const list = items.length
		? items.map((u) => `<li><span>${escHtml(u)}</span>${editable ? `<button class="btn btn-danger btn-sm remove-${key}" data-user="${escHtml(u)}">Remove</button>` : ""}</li>`).join("")
		: `<li class="empty-hint">None configured</li>`;
	return `<section><h2>${title}</h2><ul id="${key}-list">${list}</ul>
    ${
			editable
				? `<form class="inline-form" id="add-${key}-form">
        <input type="text" id="${key}-input" placeholder="User ID" required>
        <button type="submit" class="btn btn-primary btn-sm">Add</button>
    </form>`
				: ""
		}
</section>`;
}

function bindUserActions(key) {
	document.getElementById(`${key}-list`).addEventListener("click", async (e) => {
		const btn = e.target.closest(`.remove-${key}`);
		if (!btn) return;
		try {
			clearError();
			await request("DELETE", `/dash/server/${serverId}/${key}/${btn.dataset.user}`);
			window.location.reload();
		} catch (err) {
			showError(err.message);
		}
	});
	document.getElementById(`add-${key}-form`).addEventListener("submit", async (e) => {
		e.preventDefault();
		const input = document.getElementById(`${key}-input`);
		const userId = input.value.trim();
		if (!userId) return;
		try {
			clearError();
			await request("PUT", `/dash/server/${serverId}/${key}`, { item: userId });
			window.location.reload();
		} catch (err) {
			showError(err.message);
		}
	});
}

async function loadWordlist() {
	const section = document.getElementById("wordlist-section");
	try {
		const data = await request("GET", `/dash/server/${serverId}/wordlist`);
		const words = data.words || [];
		const action = data.action || {};
		const enabled = !!data.enabled;

		section.innerHTML = `
        <h2>Wordlist</h2>
        <form id="wl-config-form">
            <div class="form-field"><label><input type="checkbox" id="wl-enabled" ${enabled ? "checked" : ""}> Enable wordlist filter</label></div>
            <div class="form-row">
                <div class="form-field"><label>Action:</label><select id="wl-action">
                    <option value="LOG" ${action.action === "LOG" ? "selected" : ""}>Log only</option>
                    <option value="DELETE" ${action.action === "DELETE" ? "selected" : ""}>Delete</option>
                    <option value="WARN" ${action.action === "WARN" ? "selected" : ""}>Warn</option>
                </select></div>
                <div class="form-field"><label>Action message:</label><input type="text" id="wl-message" value="${escHtml(action.message || "")}" placeholder="Optional message"></div>
            </div>
        </form>
        ${
					words.length
						? `<table>
            <thead><tr><th>Word</th><th>Strictness</th><th>Actions</th></tr></thead>
            <tbody>${words
							.map(
								(w) => `<tr>
                <td>${escHtml(w.word)}</td>
                <td><span class="strict-badge strict-${w.strictness}">${w.strictness}</span></td>
                <td><button class="btn btn-danger btn-sm wl-delete" data-word="${escHtml(w.word)}">Delete</button></td>
            </tr>`,
							)
							.join("")}</tbody>
        </table>`
						: `<p class="empty">No words configured.</p>`
				}
        <form id="wl-add-form" class="inline-form">
            <input type="text" id="wl-new-word" placeholder="Word or phrase" required>
            <select id="wl-new-strictness">
                <option value="SOFT">SOFT</option><option value="HARD">HARD</option><option value="STRICT">STRICT</option>
            </select>
            <button type="submit" class="btn btn-primary btn-sm">Add</button>
        </form>
        <button type="submit" form="wl-config-form" class="btn btn-primary">Save Configuration</button>`;

		bindWordlistEvents();
	} catch (e) {
		section.innerHTML = `<h2>Wordlist</h2><p>Failed to load: ${escHtml(e.message)}</p>`;
	}
}

function bindWordlistEvents() {
	document.getElementById("wl-config-form").addEventListener("submit", async (e) => {
		e.preventDefault();
		const btn = e.submitter;
		btn.disabled = true;
		try {
			await request("PUT", `/dash/server/${serverId}/wordlist/config`, {
				enabled: document.getElementById("wl-enabled").checked,
				action: document.getElementById("wl-action").value,
				message: document.getElementById("wl-message").value,
			});
			clearError();
		} catch (err) {
			showError(err.message);
		}
		btn.disabled = false;
	});

	document.getElementById("wl-add-form").addEventListener("submit", async (e) => {
		e.preventDefault();
		const word = document.getElementById("wl-new-word").value.trim();
		const strictness = document.getElementById("wl-new-strictness").value;
		if (!word) return;
		try {
			clearError();
			await request("POST", `/dash/server/${serverId}/wordlist`, { word, strictness });
			loadWordlist();
		} catch (err) {
			showError(err.message);
		}
	});

	document.querySelectorAll(".wl-delete").forEach((btn) => {
		btn.addEventListener("click", async () => {
			const word = btn.dataset.word;
			if (!confirm(`Remove "${word}" from the wordlist?`)) return;
			try {
				clearError();
				await request("DELETE", `/dash/server/${serverId}/wordlist/${encodeURIComponent(word)}`);
				loadWordlist();
			} catch (err) {
				showError(err.message);
			}
		});
	});
}

function buildRuleModal({ id, title, formId, formInnerHTML, submitLabel, onSubmit }) {
	const existing = document.getElementById(id);
	if (existing) return existing;

	const modal = document.createElement("dialog");
	modal.className = "rule-modal";
	modal.id = id;
	modal.innerHTML = `
		<div class="modal-content">
			<h3>${title}</h3>
			<form id="${formId}" method="dialog">
				${formInnerHTML}
				<div class="modal-actions">
					<button type="submit" class="btn btn-primary">${submitLabel}</button>
					<button type="button" class="btn btn-secondary" id="${id}-cancel" value="cancel">Cancel</button>
				</div>
			</form>
		</div>`;

	document.body.appendChild(modal);

	document.getElementById(formId).addEventListener("submit", onSubmit);
	document.getElementById(`${id}-cancel`).addEventListener("click", () => modal.close());

	return modal;
}

function getEditModal() {
	return buildRuleModal({
		id: "edit-modal",
		title: "Edit Rule",
		formId: "edit-form",
		submitLabel: "Save",
		formInnerHTML: `
			<input type="hidden" id="edit-id" />
			<div class="form-row">
				<div class="form-field"><label>Max Messages:</label><input type="number" id="edit-max_msg" min="1" required /></div>
				<div class="form-field"><label>Timeframe (seconds):</label><input type="number" id="edit-timeframe" min="1" required /></div>
				<div class="form-field">
					<label>Action:</label>
					<select id="edit-action">
						<option value="0">Delete</option>
						<option value="1">Message</option>
						<option value="2">Warn</option>
						<option value="3">Kick</option>
						<option value="4">Ban</option>
					</select>
				</div>
			</div>
			<div class="form-field"><label>Custom Message (optional):</label><input type="text" id="edit-message" /></div>`,
		onSubmit: saveEdit,
	});
}

function getCreateModal() {
	const modal = buildRuleModal({
		id: "create-modal",
		title: "Create Rule",
		formId: "create-form",
		submitLabel: "Create Rule",
		formInnerHTML: `
			<div class="form-row">
				<div class="form-field"><label>Max Messages:</label><input type="number" id="cr-max_msg" value="5" min="1" required /></div>
				<div class="form-field"><label>Timeframe (seconds):</label><input type="number" id="cr-timeframe" value="3" min="1" required /></div>
				<div class="form-field"><label>Action:</label><select id="cr-action">
					${Object.entries(ACTIONS)
						.map(([v, l]) => `<option value="${v}">${l}</option>`)
						.join("")}
				</select></div>
			</div>
			<div class="form-field"><label>Custom Message (optional):</label><input type="text" id="cr-message"></div>`,
		onSubmit: createRule,
	});

	return modal;
}

async function loadAntiSpam() {
	if (antispamLoaded || antispamLoading) return;
	antispamLoading = true;
	const container = document.getElementById("tab-anti-spam");
	try {
		const data = await request("GET", `/dash/server/${serverId}/antispam`);
		rules = data.antispam || [];
		antispamLoaded = true;
		renderAntiSpam(container);
	} catch (e) {
		container.innerHTML = `<p>Failed to load anti-spam rules: ${escHtml(e.message)}</p>`;
	} finally {
		antispamLoading = false;
	}
}

function renderAntiSpam(container) {
	container.innerHTML = `
    <p>Anti-spam rules allow designating what is considered spam and what actions should be taken when spam is detected. Make sure you've enabled anti-spam in your server for these rules to take effect.</p>
    ${
			rules.length
				? `<table>
	        <thead><tr><th>Trigger</th><th>Action</th><th>Message</th><th></th></tr></thead>
	        <tbody>${rules
						.map(
							(r) => `<tr>
	            <td>${r.max_msg} messages in ${r.timeframe} second${r.timeframe !== 1 ? "s" : ""}</td>
	            <td>${ACTIONS[r.action]}</td>
	            <td>${r.message ? escHtml(r.message) : "N/A"}</td>
	            <td><button class="btn btn-sm edit-btn" data-id="${r.id}">Edit</button>
	                <button class="btn btn-danger btn-sm delete-btn" data-id="${r.id}">Delete</button></td>
	        </tr>`,
						)
						.join("")}</tbody>
	    </table>`
				: `<p class="empty">No rules configured.</p>`
		}
    <button id="create-btn" class="btn btn-primary">Create New Rule</button>`;

	bindAntiSpamEvents();
}

function bindAntiSpamEvents() {
	document.querySelectorAll(".edit-btn").forEach((btn) => btn.addEventListener("click", () => openEdit(btn.dataset.id)));
	document.querySelectorAll(".delete-btn").forEach((btn) => btn.addEventListener("click", () => deleteRule(btn.dataset.id)));
	document.getElementById("create-btn").addEventListener("click", () => getCreateModal().showModal());
}

function openEdit(id) {
	const r = rules.find((r) => r.id === id);
	if (!r) return;
	const m = getEditModal();
	document.getElementById("edit-id").value = r.id;
	document.getElementById("edit-max_msg").value = r.max_msg;
	document.getElementById("edit-timeframe").value = r.timeframe;
	document.getElementById("edit-action").value = r.action;
	document.getElementById("edit-message").value = r.message || "";
	m.showModal();
}

async function saveEdit(e) {
	e.preventDefault();
	const id = document.getElementById("edit-id").value;
	try {
		clearError();
		await request("PATCH", `/dash/server/${serverId}/antispam/${id}`, {
			max_msg: Number(document.getElementById("edit-max_msg").value),
			timeframe: Number(document.getElementById("edit-timeframe").value),
			action: Number(document.getElementById("edit-action").value),
			message: document.getElementById("edit-message").value || null,
		});
		antispamLoaded = false;
		loadAntiSpam();
		getEditModal().close();
	} catch (err) {
		showError(err.message);
	}
}

async function deleteRule(id) {
	if (!confirm("Delete this rule?")) return;
	try {
		clearError();
		await request("DELETE", `/dash/server/${serverId}/antispam/${id}`);
		antispamLoaded = false;
		loadAntiSpam();
	} catch (err) {
		showError(err.message);
	}
}

async function createRule(e) {
	e.preventDefault();
	const btn = e.target.querySelector("button");
	btn.disabled = true;
	btn.textContent = "Creating…";
	try {
		clearError();
		await request("POST", `/dash/server/${serverId}/antispam`, {
			max_msg: Number(document.getElementById("cr-max_msg").value),
			timeframe: Number(document.getElementById("cr-timeframe").value),
			action: Number(document.getElementById("cr-action").value),
			message: document.getElementById("cr-message").value || null,
		});
		antispamLoaded = false;
		loadAntiSpam();
		getCreateModal().close();
		e.target.reset();
	} catch (err) {
		showError(err.message);
		btn.disabled = false;
		btn.textContent = "Create Rule";
	}
}
