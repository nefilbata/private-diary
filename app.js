const SUPABASE_URL = "https://wxfbltgchmfnhzippdln.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_9ch71n-bFVDrRQGUtmYQqw_-SJanLG4";

const MOODS = [
  { name: "平静", group: "稳定" },
  { name: "开心", group: "积极" },
  { name: "期待", group: "积极" },
  { name: "疲惫", group: "低能量" },
  { name: "焦虑", group: "压力" },
  { name: "难过", group: "低落" },
];

const app = document.querySelector("#app");
const state = {
  client: null,
  user: null,
  entries: [],
  view: "timeline",
  editingId: null,
  selectedMood: MOODS[0],
  selectedExportIds: new Set(),
  authMode: "signin",
  cryptoKey: null,
};

const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

init();

async function init() {
  if (configured) {
    const { createClient } = await import(
      "https://esm.sh/@supabase/supabase-js@2"
    );
    state.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data } = await state.client.auth.getSession();
    state.user = data.session?.user ?? null;
  } else {
    state.user = read("diary_demo_user", null);
  }

  if (state.user && !configured) await loadEntries();
  render();
}

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function userKey(suffix) {
  return `diary_${state.user.id}_${suffix}`;
}

async function loadEntries() {
  if (state.client) {
    const { data, error } = await state.client
      .from("entries")
      .select("*, comments(*)")
      .order("entry_date", { ascending: false })
      .order("entry_time", { ascending: false });
    if (error) return alert(error.message);
    state.entries = await Promise.all((data ?? []).map(decryptEntry));
  } else {
    state.entries = read(userKey("entries"), []);
  }
}

async function saveEntriesLocal() {
  write(userKey("entries"), state.entries);
}

function render() {
  if (!state.user) {
    renderAuth();
    return;
  }

  if (configured && !state.cryptoKey) {
    renderPrivacyUnlock();
    return;
  }

  const title = state.view === "export" ? "选择导出" : "小日常记";
  app.innerHTML = `
    <div class="shell">
      <header class="sidebar">
        <div class="brand">
          <div class="mark">日</div>
          <div>
            <h1>小日常记</h1>
            <p>${state.user.email || state.user.name}</p>
          </div>
        </div>
        <div class="header-actions">
          <button class="icon-btn search-btn" title="搜索">⌕</button>
          <button class="primary" data-action="new" title="写日记">✎ 写日记</button>
        </div>
        <nav class="nav">
          <button class="${state.view === "timeline" ? "active" : ""}" data-view="timeline" title="首页">⌂<span>首页</span></button>
          <button class="fab" data-action="new" title="写日记">＋<span>写日记</span></button>
          <button class="${state.view === "export" ? "active" : ""}" data-view="export" title="导出">⇩<span>导出</span></button>
        </nav>
        <button class="ghost signout-btn" data-action="signout" title="退出登录">退出</button>
      </header>
      <section class="main">
        <div class="topbar">
          <div>
            <h2>${title}</h2>
            <p class="hint">把小小的情绪，安静地放在今天。</p>
          </div>
          <div class="toolbar">
            <button class="primary" data-action="new" title="新建日记">＋ 新建</button>
          </div>
        </div>
        ${
          state.view === "export"
            ? renderExport()
            : `<div class="grid">${renderEditor()}${renderTimeline()}</div>`
        }
      </section>
    </div>
  `;
  bindAppEvents();
}

function renderPrivacyUnlock() {
  app.innerHTML = `
    <section class="auth-page">
      <div class="auth-box">
        <h1>打开私密空间</h1>
        <p class="hint">请输入你的隐私密码。它只在这台浏览器里用来解密日记，不会发送给 Supabase。</p>
        <div class="notice">请务必记住这个密码。忘记后，已经加密的日记无法恢复。</div>
        <form class="form" id="privacyForm">
          <label class="field">
            <span>隐私密码</span>
            <input name="privacyPassword" type="password" required minlength="8" placeholder="建议至少 8 位" />
          </label>
          <button class="primary" type="submit">进入日记</button>
          <button class="ghost" type="button" data-action="signout">换账号登录</button>
        </form>
      </div>
    </section>
  `;
  document.querySelector("#privacyForm").addEventListener("submit", submitPrivacyPassword);
  document.querySelector("[data-action='signout']").addEventListener("click", signOut);
}

function renderAuth() {
  app.innerHTML = `
    <section class="auth-page">
      <div class="auth-box">
        <h1>小日常记</h1>
        <p class="hint">写给自己的生活片段，只由自己打开。</p>
        ${configured ? "" : `<div class="notice">还没填 Supabase 信息，所以现在是本机演示登录。之后填入 URL 和 anon key 就能接真实账号。</div>`}
        <div class="mode-switch">
          <button class="ghost ${state.authMode === "signin" ? "active" : ""}" data-auth-mode="signin">登录</button>
          <button class="ghost ${state.authMode === "signup" ? "active" : ""}" data-auth-mode="signup">注册</button>
        </div>
        <form class="form" id="authForm">
          <label class="field">
            <span>邮箱</span>
            <input name="email" type="email" required placeholder="you@example.com" />
          </label>
          <label class="field">
            <span>密码</span>
            <input name="password" type="password" required minlength="6" placeholder="至少 6 位" />
          </label>
          <button class="primary" type="submit">${state.authMode === "signin" ? "登录" : "创建账号"}</button>
        </form>
      </div>
    </section>
  `;

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      render();
    });
  });
  document.querySelector("#authForm").addEventListener("submit", submitAuth);
}

async function submitPrivacyPassword(event) {
  event.preventDefault();
  const password = new FormData(event.target).get("privacyPassword");
  state.cryptoKey = await derivePrivacyKey(password);
  try {
    await loadEntries();
  } catch {
    state.cryptoKey = null;
    alert("隐私密码不对，无法解密已有日记。");
    return;
  }
  render();
}

function renderEditor() {
  const entry = state.entries.find((item) => item.id === state.editingId);
  const now = new Date();
  const date = entry?.entry_date ?? now.toISOString().slice(0, 10);
  const time = entry?.entry_time ?? now.toTimeString().slice(0, 5);
  const tags = (entry?.tags ?? []).join(", ");
  state.selectedMood = entry
    ? { name: entry.mood, group: entry.mood_category }
    : state.selectedMood;

  return `
    <section class="panel">
      <h3>${entry ? "编辑日记" : "写日记"}</h3>
      <form class="form" id="entryForm">
        <label class="field">
          <span>标题</span>
          <input name="title" value="${escapeHtml(entry?.title ?? "")}" placeholder="今天想记住什么" />
        </label>
        <div class="split">
          <label class="field">
            <span>日期</span>
            <input name="entry_date" type="date" value="${date}" required />
          </label>
          <label class="field">
            <span>时间</span>
            <input name="entry_time" type="time" value="${time}" required />
          </label>
        </div>
        <label class="field">
          <span>心情</span>
          <div class="mood-row">
            ${MOODS.map(
              (mood) =>
                `<button type="button" class="chip ${state.selectedMood.name === mood.name ? "active" : ""}" data-mood="${mood.name}" data-group="${mood.group}">${mood.name}</button>`,
            ).join("")}
          </div>
          <input name="custom_mood" placeholder="也可以输入自定义心情" value="" />
        </label>
        <label class="field">
          <span>标签分类</span>
          <input name="tags" value="${escapeHtml(tags)}" placeholder="工作, 关系, 睡眠，用逗号分隔" />
        </label>
        <label class="field">
          <span>内容</span>
          <textarea name="content" required placeholder="随时写一点，长短都可以。">${escapeHtml(entry?.content ?? "")}</textarea>
        </label>
        <label class="field">
          <span>图片</span>
          <input name="image" type="file" accept="image/*" />
          ${entry?.image_url ? `<img src="${entry.image_url}" alt="已添加图片" />` : ""}
        </label>
        <div class="toolbar">
          <button class="primary" type="submit">${entry ? "保存修改" : "保存日记"}</button>
          ${entry ? `<button class="ghost" type="button" data-action="cancelEdit">取消</button>` : ""}
        </div>
      </form>
    </section>
  `;
}

function renderTimeline() {
  if (!state.entries.length) {
    return `<section class="empty">还没有日记。先写下今天的第一条情绪记录。</section>`;
  }

  let lastDay = "";
  const items = sortedEntries()
    .map((entry) => {
      const dayLabel =
        entry.entry_date === lastDay
          ? ""
          : `<div class="day">${formatDay(entry.entry_date)}</div>`;
      lastDay = entry.entry_date;
      return `
        ${dayLabel}
        <article class="entry">
          <div class="entry-head">
            <div>
              <div class="entry-title">
                <input type="checkbox" data-select="${entry.id}" ${state.selectedExportIds.has(entry.id) ? "checked" : ""} title="选择导出" />
                <h3>${escapeHtml(entry.title || "未命名记录")}</h3>
              </div>
              <div class="meta">
                <span>${entry.entry_time}</span>
                <span>${escapeHtml(entry.mood)} / ${escapeHtml(entry.mood_category)}</span>
                ${(entry.tags ?? []).map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}
              </div>
            </div>
            <div class="toolbar">
              <button class="icon-btn" data-edit="${entry.id}" title="编辑">✎</button>
              <button class="icon-btn" data-delete="${entry.id}" title="删除">×</button>
            </div>
          </div>
          <p>${escapeHtml(entry.content)}</p>
          ${entry.image_url ? `<img src="${entry.image_url}" alt="日记图片" />` : ""}
          ${renderComments(entry)}
        </article>
      `;
    })
    .join("");

  return `<section class="entry-list">${items}</section>`;
}

function renderComments(entry) {
  const comments = entry.comments ?? [];
  return `
    <div class="comments">
      <div class="legend">评论 / 后续想法</div>
      ${comments
        .map(
          (comment) =>
            `<div class="comment">${escapeHtml(comment.content)}<div class="small">${formatDateTime(comment.created_at)}</div></div>`,
        )
        .join("")}
      <form class="comment-form" data-comment-form="${entry.id}">
        <input name="comment" placeholder="补充一句后续想法" required />
        <button class="ghost" title="添加评论">＋</button>
      </form>
    </div>
  `;
}

function renderExport() {
  const selected = sortedEntries().filter((entry) =>
    state.selectedExportIds.has(entry.id),
  );
  return `
    <section class="panel">
      <h3>选择要导出的日记</h3>
      <p class="hint">可以在时间轴勾选记录，也可以在这里一键选择。</p>
      <div class="toolbar">
        <button class="ghost" data-action="selectAll">全选</button>
        <button class="ghost" data-action="clearSelection">清空</button>
        <button class="primary" data-action="exportJson">导出 JSON</button>
        <button class="ghost" data-action="exportCsv">导出 CSV</button>
      </div>
      <div class="export-list">
        ${selected.length ? selected.map((entry) => `<span class="chip active">${escapeHtml(entry.title || entry.entry_date)}</span>`).join("") : `<span class="chip">当前没有选中记录</span>`}
      </div>
    </section>
  `;
}

function bindAppEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      render();
    });
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      if (action === "signout") return signOut();
      if (action === "new") {
        state.editingId = null;
        state.view = "timeline";
        render();
      }
      if (action === "cancelEdit") {
        state.editingId = null;
        render();
      }
      if (action === "selectAll") {
        state.entries.forEach((entry) => state.selectedExportIds.add(entry.id));
        render();
      }
      if (action === "clearSelection") {
        state.selectedExportIds.clear();
        render();
      }
      if (action === "exportJson") exportData("json");
      if (action === "exportCsv") exportData("csv");
    });
  });

  document.querySelectorAll("[data-mood]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedMood = {
        name: button.dataset.mood,
        group: button.dataset.group,
      };
      render();
    });
  });

  document.querySelector("#entryForm")?.addEventListener("submit", submitEntry);
  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingId = button.dataset.edit;
      render();
    });
  });
  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteEntry(button.dataset.delete));
  });
  document.querySelectorAll("[data-select]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) state.selectedExportIds.add(input.dataset.select);
      else state.selectedExportIds.delete(input.dataset.select);
    });
  });
  document.querySelectorAll("[data-comment-form]").forEach((form) => {
    form.addEventListener("submit", submitComment);
  });
}

async function submitAuth(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));

  if (state.client) {
    const method =
      state.authMode === "signin" ? "signInWithPassword" : "signUp";
    const { data: authData, error } = await state.client.auth[method]({
      email: data.email,
      password: data.password,
    });
    if (error) return alert(error.message);
    state.user = authData.user;
  } else {
    state.user = { id: data.email.toLowerCase(), email: data.email };
    write("diary_demo_user", state.user);
  }
  await loadEntries();
  render();
}

async function submitEntry(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  const customMood = data.custom_mood?.trim();
  const imageFile = form.image.files[0];
  const existing = state.entries.find((entry) => entry.id === state.editingId);
  const image_url = imageFile
    ? await fileToDataUrl(imageFile)
    : existing?.image_url ?? "";

  const payload = {
    title: data.title.trim(),
    content: data.content.trim(),
    mood: customMood || state.selectedMood.name,
    mood_category: customMood ? "自定义" : state.selectedMood.group,
    tags: data.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    entry_date: data.entry_date,
    entry_time: data.entry_time,
    image_url,
  };

  if (state.client) {
    const encryptedPayload = await encryptEntryPayload(payload);
    if (existing) {
      const { error } = await state.client
        .from("entries")
        .update(encryptedPayload)
        .eq("id", existing.id);
      if (error) return alert(error.message);
    } else {
      const { error } = await state.client.from("entries").insert(encryptedPayload);
      if (error) return alert(error.message);
    }
    await loadEntries();
  } else {
    if (existing) Object.assign(existing, payload);
    else {
      state.entries.push({
        ...payload,
        id: crypto.randomUUID(),
        user_id: state.user.id,
        comments: [],
        created_at: new Date().toISOString(),
      });
    }
    await saveEntriesLocal();
  }

  state.editingId = null;
  render();
}

async function submitComment(event) {
  event.preventDefault();
  const form = event.target;
  const entryId = form.dataset.commentForm;
  const content = new FormData(form).get("comment").trim();
  if (!content) return;

  if (state.client) {
    const encryptedContent = await encryptPrivateData({ content });
    const { error } = await state.client
      .from("comments")
      .insert({ entry_id: entryId, content: encryptedContent });
    if (error) return alert(error.message);
    await loadEntries();
  } else {
    const entry = state.entries.find((item) => item.id === entryId);
    entry.comments = entry.comments ?? [];
    entry.comments.push({
      id: crypto.randomUUID(),
      entry_id: entryId,
      content,
      created_at: new Date().toISOString(),
    });
    await saveEntriesLocal();
  }
  render();
}

async function deleteEntry(id) {
  if (!confirm("确定删除这条日记吗？")) return;
  if (state.client) {
    const { error } = await state.client.from("entries").delete().eq("id", id);
    if (error) return alert(error.message);
    await loadEntries();
  } else {
    state.entries = state.entries.filter((entry) => entry.id !== id);
    await saveEntriesLocal();
  }
  state.selectedExportIds.delete(id);
  render();
}

async function signOut() {
  if (state.client) await state.client.auth.signOut();
  localStorage.removeItem("diary_demo_user");
  state.user = null;
  state.entries = [];
  state.cryptoKey = null;
  state.selectedExportIds.clear();
  render();
}

async function encryptEntryPayload(payload) {
  const encrypted = await encryptPrivateData({
    title: payload.title,
    content: payload.content,
    mood: payload.mood,
    mood_category: payload.mood_category,
    tags: payload.tags,
    image_url: payload.image_url,
  });

  return {
    title: "已加密",
    content: encrypted,
    mood: "私密",
    mood_category: "已加密",
    tags: [],
    entry_date: payload.entry_date,
    entry_time: payload.entry_time,
    image_url: "",
  };
}

async function decryptEntry(entry) {
  const privateData = await decryptPrivateData(entry.content);
  const comments = await Promise.all(
    (entry.comments ?? []).map(async (comment) => {
      const decrypted = await decryptPrivateData(comment.content);
      return {
        ...comment,
        content: decrypted?.content ?? comment.content,
      };
    }),
  );

  if (!privateData) {
    return { ...entry, comments };
  }

  return {
    ...entry,
    title: privateData.title ?? "",
    content: privateData.content ?? "",
    mood: privateData.mood ?? "私密",
    mood_category: privateData.mood_category ?? "已加密",
    tags: privateData.tags ?? [],
    image_url: privateData.image_url ?? "",
    comments,
  };
}

async function derivePrivacyKey(password) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(`private-diary:${state.user.id || state.user.email}`),
      iterations: 210000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptPrivateData(value) {
  if (!state.cryptoKey) return JSON.stringify(value);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    state.cryptoKey,
    encoded,
  );
  return `ENC:v1:${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`;
}

async function decryptPrivateData(value) {
  if (typeof value !== "string" || !value.startsWith("ENC:v1:")) return null;
  const [, , ivText, cipherText] = value.split(":");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivText) },
    state.cryptoKey,
    fromBase64(cipherText),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

function toBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function sortedEntries() {
  return [...state.entries].sort((a, b) =>
    `${b.entry_date} ${b.entry_time}`.localeCompare(
      `${a.entry_date} ${a.entry_time}`,
    ),
  );
}

function exportData(type) {
  const selected = sortedEntries().filter((entry) =>
    state.selectedExportIds.has(entry.id),
  );
  if (!selected.length) return alert("请先选择要导出的记录。");

  if (type === "json") {
    download(
      `diary-export-${today()}.json`,
      JSON.stringify(selected, null, 2),
      "application/json",
    );
  } else {
    const header = ["日期", "时间", "标题", "心情", "心情分类", "标签", "内容"];
    const rows = selected.map((entry) => [
      entry.entry_date,
      entry.entry_time,
      entry.title,
      entry.mood,
      entry.mood_category,
      (entry.tags ?? []).join("|"),
      entry.content.replaceAll("\n", " "),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    download(`diary-export-${today()}.csv`, csv, "text/csv;charset=utf-8");
  }
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDay(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
