const parts = window.location.pathname.split("/");
const serverId = BASE_PATH ? parts[2] : parts[1];
if (!serverId) {
	document.querySelector(".loading")?.remove();
	document.getElementById("content").innerHTML += "<h1>Invalid server</h1>";
}

function detectTab() {
	if (/\/anti-spam\/?$/.test(window.location.pathname)) return "anti-spam";
	if (/\/vote-moderation\/?$/.test(window.location.pathname)) return "vote";
	if (/\/infractions\/?$/.test(window.location.pathname)) return "infractions";
	if (/\/logging\/?$/.test(window.location.pathname)) return "logging";
	return "general";
}

let activeTab = detectTab();
let antispamLoaded = false;
let antispamLoading = false;
let infractionsLoaded = false;
let infractionsLoading = false;
let rules = [];
let perms = 0;

function switchTab(tab, pushState = true) {
	if (activeTab === tab) return;
	activeTab = tab;

	const tabs = { "general": "tab-general", "anti-spam": "tab-anti-spam", "vote": "tab-vote", "infractions": "tab-infractions", "logging": "tab-logging" };
	for (const [t, id] of Object.entries(tabs)) {
		const el = document.getElementById(id);
		if (el) el.hidden = t !== tab;
	}

	document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));

	const tabPaths = {
		"general": `${BASE_PATH}/${serverId}`,
		"anti-spam": `${BASE_PATH}/${serverId}/anti-spam`,
		"vote": `${BASE_PATH}/${serverId}/vote-moderation`,
		"infractions": `${BASE_PATH}/${serverId}/infractions`,
		"logging": `${BASE_PATH}/${serverId}/logging`,
	};
	if (pushState) history.pushState({ tab }, "", tabPaths[tab]);

	const tabTitles = {
		"general": "Server Settings | AutoMod",
		"anti-spam": "Anti-Spam | AutoMod",
		"vote": "Vote Moderation | AutoMod",
		"infractions": "Infractions | AutoMod",
		"logging": "Logging | AutoMod",
	};
	document.title = tabTitles[tab] || "Server Dashboard | AutoMod";

	if (tab === "anti-spam" && !antispamLoaded) loadAntiSpam();
	if (tab === "infractions" && !infractionsLoaded) loadInfractions();
}

window.addEventListener("popstate", (e) => {
	const tab = e.state?.tab || detectTab();
	switchTab(tab, false);
});

(async function init() {
	if (!serverId) return;
	const main = document.getElementById("content");
	document.querySelector(".loading")?.remove();
	try {
		const data = await request("GET", `/dash/server/${serverId}`);
		const s = data.server;
		perms = s.perms || 0;
		const cfg = s.serverConfig || {};
		const managers = cfg.botManagers || [];
		const mods = cfg.moderators || [];

		main.insertAdjacentHTML(
			"beforeend",
			`<hgroup>
						<h1>Server Dashboard</h1>
						<p>Manage AutoMod's presence in the server ${escHtml(s.name || s.id)}.</p>
					</hgroup>

        <div class="server-header">
						<div class="title">
							${s.iconURL ? `<img src="${escHtml(safeUrl(s.iconURL))}" alt="">` : ""}
							<h2>${escHtml(s.name || s.id)}</h2>
						</div>
						<ul>
							<li class="perm-badge perm-${perms}">${PERMS[perms]}</li>
							<li class="server-stats">${fmtServerStats(s)} | ${fmtServerSub(s)}</li>
						</ul>
						${s.description ? `<p>${escHtml(s.description)}</p>` : ""}
        </div>`,
		);

		main.insertAdjacentHTML(
			"beforeend",
			`<div class="tabs">
						<a href="${BASE_PATH}/${serverId}" class="tab${activeTab === "general" ? " active" : ""}" data-tab="general">General</a>
						<a href="${BASE_PATH}/${serverId}/anti-spam" class="tab${activeTab === "anti-spam" ? " active" : ""}" data-tab="anti-spam">Anti-Spam</a>
						<a href="${BASE_PATH}/${serverId}/vote-moderation" class="tab${activeTab === "vote" ? " active" : ""}" data-tab="vote">Vote Moderation</a>
						<a href="${BASE_PATH}/${serverId}/infractions" class="tab${activeTab === "infractions" ? " active" : ""}" data-tab="infractions">Infractions</a>
						<a href="${BASE_PATH}/${serverId}/logging" class="tab${activeTab === "logging" ? " active" : ""}" data-tab="logging">Logging</a>
        </div>

					<div id="tab-general" class="tab-content"${activeTab !== "general" ? " hidden" : ""}>
						<div class="settings">
							${perms >= 2 ? renderGeneral(cfg, s.defaultPrefix, s.botId) : `<p>You need Manager permissions to edit the server configuration.</p>`}
							${perms >= 3 ? renderUserSection("managers", "Bot Managers", managers, true) : ""}
							${perms >= 2 ? renderUserSection("mods", "Moderators", mods, true) : ""}
						</div>
					</div>

					<div id="tab-anti-spam" class="tab-content"${activeTab !== "anti-spam" ? " hidden" : ""}>
						<div class="loading">Loading anti-spam rules…</div>
					</div>

					<div id="tab-vote" class="tab-content"${activeTab !== "vote" ? " hidden" : ""}>
						<div class="settings">
							${perms >= 2 ? renderVoteModeration(cfg, s.defaultPrefix, s.botId) : `<p>You need Manager permissions to edit vote moderation settings.</p>`}
						</div>
					</div>

					<div id="tab-infractions" class="tab-content"${activeTab !== "infractions" ? " hidden" : ""}>
						${perms >= 1 ? `<div class="loading">Loading infractions…</div>` : `<p>You need Moderator permissions to view infractions.</p>`}
					</div>

				<div id="tab-logging" class="tab-content"${activeTab !== "logging" ? " hidden" : ""}>
						${perms >= 2 ? renderLogging(cfg, s.channels) : `<p>You need Manager permissions to configure logging.</p>`}
				</div>`,
		);

		document.querySelectorAll(".tab").forEach((tab) => {
			tab.addEventListener("click", (e) => {
				e.preventDefault();
				switchTab(tab.dataset.tab);
			});
		});

		if (perms >= 2) {
			bindConfigForms();
			bindVoteForms();
			bindLoggingForms();
		}
		if (perms >= 3) bindUserActions("managers");
		if (perms >= 2) bindUserActions("mods");

		if (activeTab === "anti-spam") loadAntiSpam();
		if (activeTab === "infractions") loadInfractions();

		document.getElementById("tab-infractions").addEventListener("click", handleInfractionAction);
		document.getElementById("tab-infractions").addEventListener("change", handleInfractionChange);
	} catch (e) {
		main.insertAdjacentHTML("beforeend", `<h1>Server Settings</h1><p>${escHtml(e.message)}</p><a href="${BASE_PATH}/" class="btn btn-primary">Back to Servers</a>`);
	}
})();

function renderGeneral(cfg, defaultPrefix, botId) {
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

<section id="wordlist-section"><div class="loading">Loading wordlist…</div></section>`;
}

function renderVoteModeration(cfg, defaultPrefix, botId) {
	const vk = cfg.votekick || {};
	const mention = botId ? `<@${botId}>` : "@AutoMod";
	return `<section><h2>Vote Moderation</h2><p class="field-desc">Allows members to vote to kick, ban, or timeout a user. Use <code>${escHtml(cfg.prefix || defaultPrefix || "/")}kick vote</code>, <code>${escHtml(cfg.prefix || defaultPrefix || "/")}ban vote</code> and <code>${escHtml(cfg.prefix || defaultPrefix || "/")}timeout vote</code>.</p>

    <form id="votekick-kick-form" class="vote-form">
        <h3>Vote Kick</h3>
        <div class="form-field"><label><input type="checkbox" id="kickEnabled" ${vk.kickEnabled !== false ? "checked" : ""}>Enable</label><p class="field-desc">Let members vote to kick a user via <code>${escHtml(cfg.prefix || defaultPrefix || "/")}kick vote</code>.</p></div>
        <div class="vk-kick-options"${vk.kickEnabled === false ? ' style="display:none"' : ""}>
            <div class="form-field"><label>Votes required</label><input type="number" id="kickVotesRequired" value="${vk.kickVotesRequired || 3}" min="1"></div>
            <div class="form-field"><label>Duration (minutes)</label><p class="field-desc">How long the vote stays open.</p><input type="number" id="kickVoteDuration" value="${vk.kickVoteDuration || 1}" min="1"></div>
        </div>
        <button type="submit" class="btn btn-primary">Save Vote Kick</button>
    </form>

    <form id="votekick-ban-form" class="vote-form">
        <h3>Vote Ban</h3>
        <div class="form-field"><label><input type="checkbox" id="banEnabled" ${vk.banEnabled !== false ? "checked" : ""}>Enable</label><p class="field-desc">Let members vote to ban a user via <code>${escHtml(cfg.prefix || defaultPrefix || "/")}ban vote</code>.</p></div>
        <div class="vk-ban-options"${vk.banEnabled === false ? ' style="display:none"' : ""}>
            <div class="form-field"><label>Votes required</label><input type="number" id="banVotesRequired" value="${vk.banVotesRequired || 3}" min="1"></div>
            <div class="form-field"><label>Duration (minutes)</label><p class="field-desc">How long the vote stays open.</p><input type="number" id="banVoteDuration" value="${vk.banVoteDuration || 1}" min="1"></div>
            <div class="form-field"><label>Action on pass</label><p class="field-desc">What happens when enough members vote to ban.</p>
                <select id="banAction">
                    <option value="0" ${(vk.banDuration ?? 0) === 0 ? "selected" : ""}>Ban permanently</option>
                    <option value="custom" ${(vk.banDuration ?? 0) > 0 ? "selected" : ""}>Temporary ban</option>
                </select>
            </div>
            <div class="form-field" id="ban-duration-field" style="${(vk.banDuration ?? 0) > 0 ? "" : "display: none"}">
                <label>Ban duration (minutes)</label><input type="number" id="banDuration" value="${(vk.banDuration ?? 0) > 0 ? vk.banDuration : 60}" min="1">
            </div>
        </div>
        <button type="submit" class="btn btn-primary">Save Vote Ban</button>
    </form>

    <form id="votekick-timeout-form" class="vote-form">
        <h3>Vote Timeout</h3>
        <div class="form-field"><label><input type="checkbox" id="timeoutEnabled" ${vk.timeoutEnabled !== false ? "checked" : ""}>Enable</label><p class="field-desc">Let members vote to timeout a user via <code>${escHtml(cfg.prefix || defaultPrefix || "/")}timeout vote</code>.</p></div>
        <div class="vk-timeout-options"${vk.timeoutEnabled === false ? ' style="display:none"' : ""}>
            <div class="form-field"><label>Votes required</label><input type="number" id="timeoutVotesRequired" value="${vk.timeoutVotesRequired || 3}" min="1"></div>
            <div class="form-field"><label>Duration (minutes)</label><p class="field-desc">How long the vote stays open.</p><input type="number" id="timeoutVoteDuration" value="${vk.timeoutVoteDuration || 1}" min="1"></div>
            <div class="form-field"><label>Timeout duration (minutes)</label><p class="field-desc">How long the timeout lasts when the vote passes.</p><input type="number" id="timeoutDuration" value="${vk.timeoutDuration || 60}" min="1"></div>
        </div>
        <button type="submit" class="btn btn-primary">Save Vote Timeout</button>
    </form></section>`;
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

	loadWordlist();
}

function bindVoteForms() {
	document.getElementById("votekick-kick-form").addEventListener("submit", async (e) => {
		e.preventDefault();
		const btn = e.target.querySelector("button");
		btn.disabled = true;
		btn.textContent = "Saving…";
		try {
			clearError();
			await request("PUT", `/dash/server/${serverId}/config`, {
				votekickKickEnabled: document.getElementById("kickEnabled").checked,
				votekickKickVotesRequired: Number(document.getElementById("kickVotesRequired").value),
				votekickKickVoteDuration: Number(document.getElementById("kickVoteDuration").value),
			});
		} catch (err) {
			showError(err.message);
		}
		btn.disabled = false;
		btn.textContent = "Save Vote Kick";
	});

	document.getElementById("votekick-ban-form").addEventListener("submit", async (e) => {
		e.preventDefault();
		const btn = e.target.querySelector("button");
		btn.disabled = true;
		btn.textContent = "Saving…";
		try {
			const banAction = document.getElementById("banAction").value;
			const banDuration = banAction === "custom" ? Number(document.getElementById("banDuration").value) : 0;
			clearError();
			await request("PUT", `/dash/server/${serverId}/config`, {
				votekickBanEnabled: document.getElementById("banEnabled").checked,
				votekickBanVotesRequired: Number(document.getElementById("banVotesRequired").value),
				votekickBanVoteDuration: Number(document.getElementById("banVoteDuration").value),
				votekickBanDuration: banDuration,
			});
		} catch (err) {
			showError(err.message);
		}
		btn.disabled = false;
		btn.textContent = "Save Vote Ban";
	});

	document.getElementById("votekick-timeout-form").addEventListener("submit", async (e) => {
		e.preventDefault();
		const btn = e.target.querySelector("button");
		btn.disabled = true;
		btn.textContent = "Saving…";
		try {
			clearError();
			await request("PUT", `/dash/server/${serverId}/config`, {
				votekickTimeoutEnabled: document.getElementById("timeoutEnabled").checked,
				votekickTimeoutVotesRequired: Number(document.getElementById("timeoutVotesRequired").value),
				votekickTimeoutVoteDuration: Number(document.getElementById("timeoutVoteDuration").value),
				votekickTimeoutDuration: Number(document.getElementById("timeoutDuration").value),
			});
		} catch (err) {
			showError(err.message);
		}
		btn.disabled = false;
		btn.textContent = "Save Vote Timeout";
	});

	document.getElementById("kickEnabled").addEventListener("change", function () {
		document.querySelector(".vk-kick-options").style.display = this.checked ? "" : "none";
	});
	document.getElementById("banEnabled").addEventListener("change", function () {
		document.querySelector(".vk-ban-options").style.display = this.checked ? "" : "none";
	});
	document.getElementById("timeoutEnabled").addEventListener("change", function () {
		document.querySelector(".vk-timeout-options").style.display = this.checked ? "" : "none";
	});

	const vkBanAction = document.getElementById("banAction");
	const vkBanDuration = document.getElementById("ban-duration-field");
	if (vkBanAction && vkBanDuration) {
		vkBanAction.addEventListener("change", () => {
			vkBanDuration.style.display = vkBanAction.value !== "custom" ? "none" : "";
		});
	}
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
		const btn = e.submitter || e.target.querySelector('button[type="submit"], button:not([type]), button[form]');
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

	if (perms < 2) {
		container.innerHTML = `<p>You need Manager permissions to manage anti-spam rules.</p>`;
		antispamLoaded = true;
		antispamLoading = false;
		return;
	}

	try {
		const data = await request("GET", `/dash/server/${serverId}/antispam`);
		rules = data.antispam || [];
		renderAntiSpam(container);
		antispamLoaded = true;
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
	const r = rules.find((r) => r.id == id);
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
		btn.disabled = false;
		btn.textContent = "Create Rule";
	} catch (err) {
		showError(err.message);
		btn.disabled = false;
		btn.textContent = "Create Rule";
	}
}

async function loadInfractions() {
	if (infractionsLoading) return;
	if (perms < 1) {
		const container = document.getElementById("tab-infractions");
		container.innerHTML = `<p>You need Moderator permissions to view infractions.</p>`;
		return;
	}
	if (infObs) {
		infObs.disconnect();
		infObs = null;
	}
	infractionsLoading = true;
	infractionsLoaded = false;
	const container = document.getElementById("tab-infractions");

	try {
		const data = await request("GET", `/dash/server/${serverId}/infractions?limit=50`);
		renderInfractions(container, data);
		infractionsLoaded = true;
	} catch (e) {
		container.innerHTML = `<p>Failed to load infractions: ${escHtml(e.message)}</p>`;
	} finally {
		infractionsLoading = false;
	}
}

function renderInfractions(container, data, append = false) {
	const items = data.infractions || [];
	const total = data.total || 0;
	const hasMore = data.hasMore || false;
	const stats = data.stats || {};

	if (!append) {
		container.innerHTML = `
			<section class="inf-stats">
				<div class="inf-stat"><span class="inf-stat-num">${stats.total || 0}</span><span class="inf-stat-label">Total</span></div>
				<div class="inf-stat"><span class="inf-stat-num">${stats.warns || 0}</span><span class="inf-stat-label">Warns</span></div>
				<div class="inf-stat"><span class="inf-stat-num">${stats.kicks || 0}</span><span class="inf-stat-label">Kicks</span></div>
				<div class="inf-stat"><span class="inf-stat-num">${stats.bans || 0}</span><span class="inf-stat-label">Bans</span></div>
				<div class="inf-stat"><span class="inf-stat-num">${stats.timeouts || 0}</span><span class="inf-stat-label">Timeouts</span></div>
			</section>

			<section><h2>Infractions</h2>
				<p class="field-desc">Showing ${items.length} of ${total} infractions.</p>
				<form id="infraction-filter-form" class="inline-form">
					<input type="text" id="inf-search" placeholder="Search by User ID" style="inline-size: 20ch;">
					<span class="inf-filter-checks">
						<label><input type="checkbox" class="inf-action-check" value="warn" checked> Warn</label>
						<label><input type="checkbox" class="inf-action-check" value="kick" checked> Kick</label>
						<label><input type="checkbox" class="inf-action-check" value="ban" checked> Ban</label>
						<label><input type="checkbox" class="inf-action-check" value="timeout" checked> Timeout</label>
					</span>
					<button type="submit" class="btn btn-primary btn-sm">Filter</button>
				</form>
			</section>
			${items.length ? renderInfractionTable(items, hasMore) : `<p class="empty">No infractions found.</p>`}`;
	} else {
		const table = container.querySelector("table tbody");
		const loadMore = container.querySelector("#inf-load-more");
		if (loadMore) loadMore.remove();

		if (table) {
			table.insertAdjacentHTML("beforeend", buildInfractionRows(items));
		}
		const selectAll = document.getElementById("inf-select-all");
		if (selectAll) selectAll.checked = false;

		if (hasMore) {
			container.insertAdjacentHTML("beforeend", `<div id="inf-sentinel"></div>`);
		}
	}

	if (hasMore && !append) {
		container.insertAdjacentHTML("beforeend", `<div id="inf-sentinel"></div>`);
	}

	bindInfractionEvents();
}

function renderInfractionTable(items, hasMore) {
	return `<table>
		<thead><tr>
			${perms >= 2 ? `<th style="inline-size:2ch"><input type="checkbox" id="inf-select-all"></th>` : ""}
			<th>Date</th><th>User</th><th>Type</th><th>Moderator</th><th>Reason</th>
			${perms >= 2 ? `<th></th>` : ""}
		</tr></thead>
		<tbody>${buildInfractionRows(items)}</tbody>
	</table>
	<div id="inf-selection-bar" class="inf-selection-bar" hidden>
		<span id="inf-selection-count">0 selected</span>
		<button id="inf-bulk-delete" class="btn btn-danger btn-sm">Delete Selected</button>
	</div>
	${hasMore ? `<div id="inf-sentinel"></div>` : ""}`;
}

function buildInfractionRows(items) {
	return items
		.map(
			(i) => `<tr data-date="${i.date}">
			${perms >= 2 ? `<td><input type="checkbox" class="inf-checkbox" data-id="${escHtml(i._id)}"></td>` : ""}
			<td>${new Date(i.date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</td>
			<td>${i.userName ? `<span title="ID: ${escHtml(i.user)}">${escHtml(i.userName)}</span>` : `<code>${escHtml(i.user)}</code>`}</td>
			<td class="inf-type inf-${i.actionType}">${i.actionType}</td>
			<td>${i.createdByName ? `<span title="ID: ${escHtml(i.createdBy)}">${escHtml(i.createdByName)}</span>` : i.createdBy ? `<code>${escHtml(i.createdBy)}</code>` : "AutoMod"}</td>
			<td>${escHtml(i.reason || "No reason provided")}</td>
			<td class="inf-actions">
				${perms >= 2 ? `<button class="btn btn-danger btn-sm inf-delete" data-id="${escHtml(i._id)}">Delete</button>` : ""}
				${perms >= 2 && i.actionType === "ban" && i.isBanned ? `<button class="btn btn-warning btn-sm inf-unban" data-user="${escHtml(i.user)}">Unban</button>` : ""}
			</td>
		</tr>`,
		)
		.join("");
}

let infObs = null;

async function handleInfractionAction(e) {
	const delBtn = e.target.closest(".inf-delete");
	const unbanBtn = e.target.closest(".inf-unban");
	const bulkBtn = e.target.closest("#inf-bulk-delete");

	if (delBtn) {
		if (!confirm("Delete this infraction record?")) return;
		delBtn.disabled = true;
		delBtn.textContent = "…";
		try {
			clearError();
			await request("DELETE", `/dash/server/${serverId}/infractions/${delBtn.dataset.id}`);
			loadInfractions();
		} catch (err) {
			showError(err.message);
			delBtn.disabled = false;
			delBtn.textContent = "Delete";
		}
	}

	if (unbanBtn) {
		if (!confirm("Unban user " + unbanBtn.dataset.user + "?")) return;
		unbanBtn.disabled = true;
		unbanBtn.textContent = "…";
		try {
			clearError();
			await request("POST", `/dash/server/${serverId}/unban`, { target: unbanBtn.dataset.user });
			loadInfractions();
		} catch (err) {
			showError(err.message);
			unbanBtn.disabled = false;
			unbanBtn.textContent = "Unban";
		}
	}

	if (bulkBtn) {
		const checked = document.querySelectorAll(".inf-checkbox:checked");
		if (!checked.length) return;
		if (!confirm(`Delete ${checked.length} infraction record${checked.length > 1 ? "s" : ""}?`)) return;
		bulkBtn.disabled = true;
		bulkBtn.textContent = "Deleting…";
		try {
			clearError();
			const ids = Array.from(checked).map((c) => c.dataset.id);
			await request("POST", `/dash/server/${serverId}/infractions/bulk-delete`, { ids });
			loadInfractions();
		} catch (err) {
			showError(err.message);
			bulkBtn.disabled = false;
			bulkBtn.textContent = "Delete Selected";
		}
	}
}

function updateSelectionBar() {
	const all = document.querySelectorAll(".inf-checkbox");
	const checked = document.querySelectorAll(".inf-checkbox:checked");
	const bar = document.getElementById("inf-selection-bar");
	const count = document.getElementById("inf-selection-count");
	const selectAll = document.getElementById("inf-select-all");
	if (!bar || !count) return;
	if (checked.length > 0) {
		bar.hidden = false;
		count.textContent = `${checked.length} selected`;
	} else {
		bar.hidden = true;
	}
	if (selectAll) {
		selectAll.checked = all.length > 0 && checked.length === all.length;
		selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
	}
}

function handleInfractionChange(e) {
	if (e.target.id === "inf-select-all") {
		const all = document.querySelectorAll(".inf-checkbox");
		all.forEach((cb) => {
			cb.checked = e.target.checked;
		});
	}
	updateSelectionBar();
}

function getCheckedActions() {
	return Array.from(document.querySelectorAll(".inf-action-check:checked"))
		.map((c) => c.value)
		.join(",");
}

function bindInfractionEvents() {
	document.getElementById("infraction-filter-form").addEventListener("submit", async (e) => {
		e.preventDefault();
		const search = document.getElementById("inf-search").value.trim();
		const action = getCheckedActions();
		const params = new URLSearchParams({ limit: "50" });
		if (search) params.set("search", search);
		if (action) params.set("action", action);

		try {
			clearError();
			const data = await request("GET", `/dash/server/${serverId}/infractions?${params.toString()}`);
			const container = document.getElementById("tab-infractions");
			if (infObs) infObs.disconnect();
			renderInfractions(container, data, false);
		} catch (err) {
			showError(err.message);
		}
	});

	const container = document.getElementById("tab-infractions");

	const sentinel = document.getElementById("inf-sentinel");
	if (sentinel) {
		if (infObs) infObs.disconnect();
		infObs = new IntersectionObserver(
			async (entries) => {
				if (!entries[0].isIntersecting) return;
				infObs.disconnect();

				const search = document.getElementById("inf-search").value.trim();
				const action = getCheckedActions();
				const rows = container.querySelectorAll("table tbody tr");
				const lastRow = rows.length ? rows[rows.length - 1] : null;
				const before = lastRow ? lastRow.dataset.date || "" : "";

				const params = new URLSearchParams({ limit: "50" });
				if (search) params.set("search", search);
				if (action) params.set("action", action);
				if (before) params.set("before", before);

				try {
					const data = await request("GET", `/dash/server/${serverId}/infractions?${params.toString()}`);
					renderInfractions(container, data, true);
				} catch (err) {
					showError(err.message);
				}
			},
			{ rootMargin: "200px" },
		);
		infObs.observe(sentinel);
	}
}

function renderLogging(cfg, channels) {
	const logs = cfg.logs || {};
	const mu = logs.messageUpdate?.stoat || {};
	const ma = logs.modAction?.stoat || {};

	const channelOptions = `<option value="">— None —</option>` + channels.map((c) => `<option value="${escHtml(c.id)}">#${escHtml(c.name)}</option>`).join("");

	const typeOptions = (selected) => `
		<option value="EMBED" ${selected === "EMBED" ? "selected" : ""}>Embed</option>
		<option value="QUOTEBLOCK" ${selected === "QUOTEBLOCK" ? "selected" : ""}>Quote Block</option>
		<option value="PLAIN" ${selected === "PLAIN" ? "selected" : ""}>Plain</option>`;

	return `<section><h2>Message Logs</h2>
		<p class="field-desc">Logs when messages are edited or deleted.</p>
		<form id="log-messageupdate-form" class="log-form">
			<div class="form-row">
				<div class="form-field"><label>Channel</label><select id="mu-channel">${channelOptions.replace(`value="${escHtml(mu.channel || "")}"`, `value="${escHtml(mu.channel || "")}" selected`)}</select></div>
				<div class="form-field"><label>Format</label><select id="mu-type">${typeOptions(mu.type || "EMBED")}</select></div>
			</div>
			<button type="submit" class="btn btn-primary">Save Message Logs</button>
		</form>
	</section>

	<section><h2>Mod Action Logs</h2>
		<p class="field-desc">Logs moderation actions (warns, kicks, bans, timeouts).</p>
		<form id="log-modaction-form" class="log-form">
			<div class="form-row">
				<div class="form-field"><label>Channel</label><select id="ma-channel">${channelOptions.replace(`value="${escHtml(ma.channel || "")}"`, `value="${escHtml(ma.channel || "")}" selected`)}</select></div>
				<div class="form-field"><label>Format</label><select id="ma-type">${typeOptions(ma.type || "EMBED")}</select></div>
			</div>
			<button type="submit" class="btn btn-primary">Save Mod Action Logs</button>
		</form>
	</section>`;
}

function bindLoggingForms() {
	document.getElementById("log-messageupdate-form").addEventListener("submit", async (e) => {
		e.preventDefault();
		const btn = e.target.querySelector("button");
		btn.disabled = true;
		btn.textContent = "Saving…";
		try {
			clearError();
			const channel = document.getElementById("mu-channel").value;
			const type = document.getElementById("mu-type").value;
			await request("PUT", `/dash/server/${serverId}/logs`, {
				messageUpdate: channel ? { channel, type } : null,
			});
		} catch (err) {
			showError(err.message);
		}
		btn.disabled = false;
		btn.textContent = "Save Message Logs";
	});

	document.getElementById("log-modaction-form").addEventListener("submit", async (e) => {
		e.preventDefault();
		const btn = e.target.querySelector("button");
		btn.disabled = true;
		btn.textContent = "Saving…";
		try {
			clearError();
			const channel = document.getElementById("ma-channel").value;
			const type = document.getElementById("ma-type").value;
			await request("PUT", `/dash/server/${serverId}/logs`, {
				modAction: channel ? { channel, type } : null,
			});
		} catch (err) {
			showError(err.message);
		}
		btn.disabled = false;
		btn.textContent = "Save Mod Action Logs";
	});
}
