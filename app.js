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

const TAGS = ["独处", "工作", "关系", "睡眠", "天气", "恢复", "学习", "生活"];

const app = document.querySelector("#app");
const state = {
  client: null,
  user: null,
  entries: [],
  view: "timeline",
  editingId: null,
  editorOpen: false,
  selectedExportIds: new Set(),
  authMode: "signin",
  cryptoKey: null,
  searchOpen: false,
  moodFilterOpen: false,
  tagFilterOpen: false,
  searchQuery: "",
  moodFilters: new Set(),
  tagFilters: new Set(),
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

async function render() {
  if (!state.user) {
    renderAuth();
    return;
  }

  if (configured && !state.cryptoKey) {
    if (await unlockWithRememberedPrivacyPassword()) {
      render();
      return;
    }
    renderPrivacyUnlock();
    return;
  }

  app.innerHTML = `
    <div class="shell">
      <header class="app-header">
        <div>
          <p class="date-line">${formatTodayHeader()}</p>
        </div>
        <div class="header-actions">
          <button class="filter-btn ${hasActiveFilters() ? "" : "active"}" type="button" data-action="clearFilters">全部</button>
          <button class="filter-btn ${state.tagFilterOpen || state.tagFilters.size ? "active" : ""}" type="button" data-action="toggleTagFilter">分类</button>
          <button class="filter-btn ${state.moodFilterOpen || state.moodFilters.size ? "active" : ""}" type="button" data-action="toggleMoodFilter">情绪</button>
          <button class="filter-btn" type="button" data-action="showExport">导出</button>
          <button class="icon-btn search-btn ${state.searchOpen ? "active" : ""}" data-action="toggleSearch" title="搜索" aria-label="搜索">⌕</button>
          <button class="filter-btn signout-btn" data-action="signout" title="退出登录">退出</button>
        </div>
      </header>
      ${renderFilterPanel()}
      <section class="main">
        ${
          state.view === "export"
            ? renderExport()
            : renderTimeline()
        }
      </section>
      <nav class="bottom-nav">
        <button class="${state.view === "timeline" ? "active" : ""}" data-view="timeline" title="首页" aria-label="首页">⌂<span>首页</span></button>
        <button class="fab" data-action="new" title="写日记" aria-label="写日记">＋</button>
        <button class="${state.view === "export" ? "active" : ""}" data-view="export" title="导出" aria-label="导出">⇩<span>导出</span></button>
      </nav>
      <button class="floating-new" data-action="new" title="写日记" aria-label="写日记">＋</button>
      ${state.editorOpen ? renderEditor() : ""}
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
          <label class="check-field">
            <input name="rememberPrivacy" type="checkbox" />
            <span>在这台设备记住，下次自动进入</span>
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

function renderFilterPanel() {
  if (!state.searchOpen && !state.moodFilterOpen && !state.tagFilterOpen) {
    return "";
  }

  return `
    <section class="filter-panel">
      ${
        state.searchOpen
          ? `<label class="search-field">
              <span>搜索</span>
              <input id="searchInput" value="${escapeHtml(state.searchQuery)}" placeholder="搜索标题、内容、标签或情绪" />
            </label>`
          : ""
      }
      ${
        state.moodFilterOpen
          ? `<div class="filter-group">
              <span>按情绪筛选</span>
              <div class="mood-row">
                ${MOODS.map((mood) => `<button type="button" class="chip ${state.moodFilters.has(mood.name) ? "active" : ""}" data-filter-mood="${mood.name}">${mood.name}</button>`).join("")}
              </div>
            </div>`
          : ""
      }
      ${
        state.tagFilterOpen
          ? `<div class="filter-group">
              <span>按分类筛选</span>
              <div class="tag-row">
                ${availableTags().map((tag) => `<button type="button" class="chip ${state.tagFilters.has(tag) ? "active" : ""}" data-filter-tag="${tag}">${tag}</button>`).join("")}
              </div>
            </div>`
          : ""
      }
    </section>
  `;
}

async function submitPrivacyPassword(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const password = formData.get("privacyPassword");
  state.cryptoKey = await derivePrivacyKey(password);
  try {
    await loadEntries();
  } catch {
    state.cryptoKey = null;
    alert("隐私密码不对，无法解密已有日记。");
    return;
  }
  if (formData.get("rememberPrivacy")) {
    localStorage.setItem(privacyPasswordKey(), password);
  }
  render();
}

function renderEditor() {
  const entry = state.entries.find((item) => item.id === state.editingId);
  const now = new Date();
  const date = entry?.entry_date ?? now.toISOString().slice(0, 10);
  const time = entry?.entry_time ?? now.toTimeString().slice(0, 5);
  const selectedMoods = splitList(entry?.mood);
  if (!selectedMoods.length) selectedMoods.push("平静");
  const selectedTags = entry?.tags ?? [];
  const customMoods = selectedMoods
    .filter((name) => !MOODS.some((mood) => mood.name === name))
    .join(", ");
  const customTags = selectedTags
    .filter((tag) => !TAGS.includes(tag))
    .join(", ");

  return `
    <section class="editor-sheet" role="dialog" aria-modal="true">
      <div class="sheet-panel">
        <div class="sheet-head">
          <h3>${entry ? "编辑日记" : "写点什么"}</h3>
          <button class="icon-btn" type="button" data-action="cancelEdit" title="关闭" aria-label="关闭">×</button>
        </div>
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
                `<button type="button" class="chip ${selectedMoods.includes(mood.name) ? "active" : ""}" data-mood="${mood.name}" data-group="${mood.group}">${mood.name}</button>`,
            ).join("")}
          </div>
          <input name="custom_mood" placeholder="也可以输入多个自定义心情，用逗号分隔" value="${escapeHtml(customMoods)}" />
        </label>
        <label class="field">
          <span>标签分类</span>
          <div class="tag-row">
            ${TAGS.map((tag) => `<button type="button" class="chip ${selectedTags.includes(tag) ? "active" : ""}" data-tag="${tag}">${tag}</button>`).join("")}
          </div>
          <input name="tags" value="${escapeHtml(customTags)}" placeholder="也可以输入多个自定义标签，用逗号分隔" />
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
          <button class="ghost" type="button" data-action="cancelEdit">取消</button>
        </div>
      </form>
      </div>
    </section>
  `;
}

function renderTimeline() {
  const entries = filteredEntries();
  if (!entries.length) {
    return `
      <section class="empty">
        <h2>${state.entries.length ? "没有找到符合条件的日记" : "还没有日记"}</h2>
        <p>${state.entries.length ? "试试清空筛选，或者换一个关键词。" : "先写下今天的第一条情绪记录。"}</p>
        <button class="primary" data-action="${state.entries.length ? "clearFilters" : "new"}">${state.entries.length ? "清空筛选" : "写第一条"}</button>
      </section>
    `;
  }

  const items = entries
    .map((entry) => {
      const mood = moodStyle(entry.mood);
      return `
        <article class="timeline-item">
          <div class="date-block">
            <strong>${formatDayNumber(entry.entry_date)}</strong>
            <span>${formatDayMeta(entry.entry_date)}</span>
          </div>
          <div class="timeline-line">
            <span class="node ${mood.className}"></span>
          </div>
          <div class="entry">
            <div class="entry-head">
              <div>
                <div class="mood-line">
                  <span class="mood-face ${mood.className}">${mood.face}</span>
                  <span>${escapeHtml(entry.mood)}</span>
                </div>
                <h3>${escapeHtml(entry.title || "未命名记录")}</h3>
              </div>
              <div class="entry-tools">
                <span>${entry.entry_time}</span>
                <button class="plain-btn" data-edit="${entry.id}" title="编辑">编辑</button>
                <button class="plain-btn" data-delete="${entry.id}" title="删除">删除</button>
              </div>
            </div>
            <p>${escapeHtml(entry.content)}</p>
            ${entry.image_url ? `<img src="${entry.image_url}" alt="日记图片" />` : ""}
            <div class="tag-line">
              <input type="checkbox" data-select="${entry.id}" ${state.selectedExportIds.has(entry.id) ? "checked" : ""} title="选择导出" />
              ${(entry.tags ?? []).map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}
            </div>
            ${renderComments(entry)}
          </div>
        </article>
      `;
    })
    .join("");

  return `<section class="timeline-list">${items}</section>`;
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
  if (!state.entries.length) {
    return `
      <section class="empty">
        <h2>还没有可导出的日记</h2>
        <p>写下第一条记录后，就可以选择导出 JSON 或 CSV。</p>
        <button class="primary" data-action="new">写第一条</button>
      </section>
    `;
  }
  return `
    <section class="panel">
      <h3>选择要导出的日记</h3>
      <p class="hint">勾选需要导出的记录，再选择 JSON 或 CSV。</p>
      <div class="toolbar">
        <button class="ghost" data-action="selectAll">全选</button>
        <button class="ghost" data-action="clearSelection">清空</button>
        <button class="primary" data-action="exportJson">导出 JSON</button>
        <button class="ghost" data-action="exportCsv">导出 CSV</button>
      </div>
      <div class="export-items">
        ${sortedEntries().map((entry) => `
          <label class="export-entry">
            <input type="checkbox" data-select="${entry.id}" ${state.selectedExportIds.has(entry.id) ? "checked" : ""} />
            <span>
              <strong>${escapeHtml(entry.title || "未命名记录")}</strong>
              <em>${entry.entry_date} ${entry.entry_time} · ${escapeHtml(entry.mood)}</em>
            </span>
          </label>
        `).join("")}
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
      if (action === "clearFilters") {
        state.searchQuery = "";
        state.moodFilters.clear();
        state.tagFilters.clear();
        state.searchOpen = false;
        state.moodFilterOpen = false;
        state.tagFilterOpen = false;
        state.view = "timeline";
        render();
      }
      if (action === "toggleSearch") {
        state.searchOpen = !state.searchOpen;
        state.view = "timeline";
        render();
      }
      if (action === "toggleMoodFilter") {
        state.moodFilterOpen = !state.moodFilterOpen;
        state.view = "timeline";
        render();
      }
      if (action === "toggleTagFilter") {
        state.tagFilterOpen = !state.tagFilterOpen;
        state.view = "timeline";
        render();
      }
      if (action === "showExport") {
        state.view = "export";
        render();
      }
      if (action === "new") {
        state.editingId = null;
        state.editorOpen = true;
        state.view = "timeline";
        render();
      }
      if (action === "cancelEdit") {
        state.editingId = null;
        state.editorOpen = false;
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
      button.classList.toggle("active");
    });
  });
  document.querySelectorAll("[data-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.toggle("active");
    });
  });
  document.querySelectorAll("[data-filter-mood]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleSetValue(state.moodFilters, button.dataset.filterMood);
      render();
    });
  });
  document.querySelectorAll("[data-filter-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleSetValue(state.tagFilters, button.dataset.filterTag);
      render();
    });
  });
  document.querySelector("#searchInput")?.addEventListener("input", (event) => {
    state.searchQuery = event.target.value;
    render();
  });
  const searchInput = document.querySelector("#searchInput");
  if (searchInput) {
    searchInput.focus();
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
  }

  document.querySelector("#entryForm")?.addEventListener("submit", submitEntry);
  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingId = button.dataset.edit;
      state.editorOpen = true;
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
      if (state.view === "export") render();
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
  if (!configured) await loadEntries();
  render();
}

async function submitEntry(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  const imageFile = form.image.files[0];
  const existing = state.entries.find((entry) => entry.id === state.editingId);
  const image_url = imageFile
    ? await fileToDataUrl(imageFile)
    : existing?.image_url ?? "";
  const selectedMoodButtons = [...form.querySelectorAll("[data-mood].active")];
  const customMoods = splitList(data.custom_mood);
  const moods = uniqueList([
    ...selectedMoodButtons.map((button) => button.dataset.mood),
    ...customMoods,
  ]);
  const moodGroups = uniqueList([
    ...selectedMoodButtons.map((button) => button.dataset.group),
    ...(customMoods.length ? ["自定义"] : []),
  ]);
  const selectedTagButtons = [...form.querySelectorAll("[data-tag].active")];
  const tags = uniqueList([
    ...selectedTagButtons.map((button) => button.dataset.tag),
    ...splitList(data.tags),
  ]);

  const payload = {
    title: data.title.trim(),
    content: data.content.trim(),
    mood: moods.length ? moods.join("、") : "平静",
    mood_category: moodGroups.length ? moodGroups.join("、") : "稳定",
    tags,
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
  state.editorOpen = false;
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

async function unlockWithRememberedPrivacyPassword() {
  const password = localStorage.getItem(privacyPasswordKey());
  if (!password) return false;
  state.cryptoKey = await derivePrivacyKey(password);
  try {
    await loadEntries();
    return true;
  } catch {
    state.cryptoKey = null;
    localStorage.removeItem(privacyPasswordKey());
    return false;
  }
}

function privacyPasswordKey() {
  return `diary_privacy_password_${state.user?.id || state.user?.email || "guest"}`;
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

function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueList(items) {
  return [...new Set(items.filter(Boolean))];
}

function hasActiveFilters() {
  return Boolean(
    state.searchQuery.trim() ||
      state.moodFilters.size ||
      state.tagFilters.size,
  );
}

function toggleSetValue(set, value) {
  if (set.has(value)) set.delete(value);
  else set.add(value);
}

function availableTags() {
  return uniqueList([
    ...TAGS,
    ...state.entries.flatMap((entry) => entry.tags ?? []),
  ]);
}

function filteredEntries() {
  const query = state.searchQuery.trim().toLowerCase();
  return sortedEntries().filter((entry) => {
    const matchesSearch =
      !query ||
      [
        entry.title,
        entry.content,
        entry.mood,
        entry.mood_category,
        ...(entry.tags ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    const matchesMood =
      !state.moodFilters.size ||
      [...state.moodFilters].some((mood) => entry.mood?.includes(mood));
    const matchesTag =
      !state.tagFilters.size ||
      [...state.tagFilters].some((tag) => (entry.tags ?? []).includes(tag));
    return matchesSearch && matchesMood && matchesTag;
  });
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

function formatTodayHeader() {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  })
    .format(new Date())
    .replace(/\//g, " / ");
}

function formatDayNumber(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDayMeta(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    weekday: "short",
  }).format(new Date(`${value}T00:00:00`));
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

function moodStyle(mood = "") {
  if (mood.includes("开心") || mood.includes("期待")) {
    return { className: "mood-happy", face: "😊" };
  }
  if (mood.includes("低") || mood.includes("难过") || mood.includes("焦虑")) {
    return { className: "mood-low", face: "😞" };
  }
  if (mood.includes("疲")) {
    return { className: "mood-tired", face: "😐" };
  }
  return { className: "mood-calm", face: "🙂" };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
