const API_BASE = "";
const STORE_KEY = "pulse-desk-state-v1";

let installPrompt = null;
let appState = {
  notes: "",
  tasks: [],
  reminders: [],
  syncCode: "",
  updatedAt: Date.now(),
};

const el = {
  status: document.getElementById("sync-status"),
  syncCode: document.getElementById("sync-code"),
  notes: document.getElementById("notes-input"),
  taskInput: document.getElementById("task-input"),
  taskList: document.getElementById("task-list"),
  reminderInput: document.getElementById("reminder-input"),
  reminderList: document.getElementById("reminder-list"),
  installBtn: document.getElementById("install-btn"),
};

function saveLocal() {
  appState.updatedAt = Date.now();
  localStorage.setItem(STORE_KEY, JSON.stringify(appState));
}

function loadLocal() {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    appState = {
      ...appState,
      ...parsed,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      syncCode: typeof parsed.syncCode === "string" ? parsed.syncCode : "",
      updatedAt: Number(parsed.updatedAt || Date.now()),
    };
  } catch {
    // Ignore malformed local state.
  }
}

function setStatus(text, online = false) {
  el.status.textContent = text;
  el.status.classList.toggle("online", online);
}

function makeItem(text) {
  return { id: crypto.randomUUID(), text, done: false };
}

function renderList(listEl, items, onToggle, onDelete) {
  listEl.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");

    const main = document.createElement("div");
    main.className = `item-main ${item.done ? "done" : ""}`;

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = !!item.done;
    check.addEventListener("change", () => onToggle(item.id));

    const text = document.createElement("span");
    text.textContent = item.text;

    main.appendChild(check);
    main.appendChild(text);

    const del = document.createElement("button");
    del.className = "item-delete";
    del.textContent = "Delete";
    del.addEventListener("click", () => onDelete(item.id));

    li.appendChild(main);
    li.appendChild(del);
    listEl.appendChild(li);
  }
}

function render() {
  el.notes.value = appState.notes;
  el.syncCode.value = appState.syncCode;

  renderList(
    el.taskList,
    appState.tasks,
    (id) => {
      appState.tasks = appState.tasks.map((item) => (item.id === id ? { ...item, done: !item.done } : item));
      saveLocal();
      render();
    },
    (id) => {
      appState.tasks = appState.tasks.filter((item) => item.id !== id);
      saveLocal();
      render();
    }
  );

  renderList(
    el.reminderList,
    appState.reminders,
    (id) => {
      appState.reminders = appState.reminders.map((item) => (item.id === id ? { ...item, done: !item.done } : item));
      saveLocal();
      render();
    },
    (id) => {
      appState.reminders = appState.reminders.filter((item) => item.id !== id);
      saveLocal();
      render();
    }
  );
}

async function pushState() {
  if (!appState.syncCode) {
    setStatus("Set a sync code first");
    return;
  }

  const payload = {
    syncCode: appState.syncCode,
    state: {
      notes: appState.notes,
      tasks: appState.tasks,
      reminders: appState.reminders,
      updatedAt: appState.updatedAt,
    },
  };

  const response = await fetch(`${API_BASE}/api/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Push failed");
  }

  setStatus("Synced", true);
}

async function pullState() {
  if (!appState.syncCode) {
    setStatus("Set a sync code first");
    return;
  }

  const response = await fetch(`${API_BASE}/api/state?syncCode=${encodeURIComponent(appState.syncCode)}`);
  if (!response.ok) {
    throw new Error("Pull failed");
  }

  const data = await response.json();
  const remote = data?.state || {};

  if (Number(remote.updatedAt || 0) > appState.updatedAt) {
    appState.notes = typeof remote.notes === "string" ? remote.notes : "";
    appState.tasks = Array.isArray(remote.tasks) ? remote.tasks : [];
    appState.reminders = Array.isArray(remote.reminders) ? remote.reminders : [];
    appState.updatedAt = Number(remote.updatedAt || Date.now());
    saveLocal();
    render();
  }

  setStatus("Synced", true);
}

async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    if (!response.ok) throw new Error("Offline");
    setStatus("Online", true);
  } catch {
    setStatus("Offline");
  }
}

function setupActions() {
  document.getElementById("task-add").addEventListener("click", () => {
    const value = el.taskInput.value.trim();
    if (!value) return;
    appState.tasks.unshift(makeItem(value));
    el.taskInput.value = "";
    saveLocal();
    render();
  });

  document.getElementById("reminder-add").addEventListener("click", () => {
    const value = el.reminderInput.value.trim();
    if (!value) return;
    appState.reminders.unshift(makeItem(value));
    el.reminderInput.value = "";
    saveLocal();
    render();
  });

  el.notes.addEventListener("input", () => {
    appState.notes = el.notes.value;
    saveLocal();
  });

  document.getElementById("connect-btn").addEventListener("click", async () => {
    appState.syncCode = el.syncCode.value.trim();
    saveLocal();
    render();
    await checkHealth();
  });

  document.getElementById("push-btn").addEventListener("click", async () => {
    try {
      await pushState();
    } catch {
      setStatus("Push failed");
    }
  });

  document.getElementById("pull-btn").addEventListener("click", async () => {
    try {
      await pullState();
    } catch {
      setStatus("Pull failed");
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    el.installBtn.disabled = false;
  });

  el.installBtn.addEventListener("click", async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    installPrompt = null;
  });
}

async function setupPwa() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch {
      // Ignore service worker registration errors.
    }
  }
}

async function init() {
  loadLocal();
  render();
  setupActions();
  await setupPwa();
  await checkHealth();
}

init();