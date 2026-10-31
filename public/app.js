const $ = (id) => document.getElementById(id);

const TOKEN_KEY = 'todo_api_token';
let currentRunId = 'default';

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

function setToken(t) {
  sessionStorage.setItem(TOKEN_KEY, t);
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  if (res.status === 204) return null;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg = data?.error || `Ошибка ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError(el) {
  el.textContent = '';
  el.classList.add('hidden');
}

function showApp(show) {
  $('login-section').classList.toggle('hidden', show);
  $('app-section').classList.toggle('hidden', !show);
  $('logout-btn').classList.toggle('hidden', !show);
}

async function loadAuthor() {
  try {
    const author = await api('/api/author/');
    $('author').textContent = `${author.fullName} (${author.login})`;
    return true;
  } catch (e) {
    if (e.status === 401) clearToken();
    return false;
  }
}

function renderTasks(tasks) {
  const list = $('tasks');
  list.innerHTML = '';
  $('empty').classList.toggle('hidden', tasks.length > 0);

  for (const task of tasks) {
    const li = document.createElement('li');
    li.className = 'task' + (task.done ? ' done' : '');
    li.dataset.id = task.id;

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'task-check';
    check.checked = task.done;
    check.addEventListener('change', () => toggleDone(task, check.checked));

    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = task.title;
    title.title = 'Двойной клик — переименовать';
    title.addEventListener('dblclick', () => startEdit(li, task));

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.textContent = '✎';
    editBtn.title = 'Переименовать';
    editBtn.addEventListener('click', () => startEdit(li, task));

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger';
    delBtn.textContent = '✕';
    delBtn.title = 'Удалить';
    delBtn.addEventListener('click', () => removeTask(task));

    actions.append(editBtn, delBtn);
    li.append(check, title, actions);
    list.append(li);
  }
}

function startEdit(li, task) {
  if (li.querySelector('.task-title-input')) return;

  const titleEl = li.querySelector('.task-title');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'task-title-input';
  input.value = task.title;
  input.maxLength = 200;

  const finish = async (save) => {
    if (save) {
      const newTitle = input.value.trim();
      if (newTitle && newTitle !== task.title) {
        try {
          await api(`/api/tasks/${task.id}/`, {
            method: 'PATCH',
            body: JSON.stringify({ title: newTitle }),
          });
          await refresh();
          return;
        } catch (e) {
          alert(`Не удалось сохранить: ${e.message}`);
        }
      }
    }
    input.replaceWith(titleEl);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));

  titleEl.replaceWith(input);
  input.focus();
  input.select();
}

async function toggleDone(task, done) {
  try {
    await api(`/api/tasks/${task.id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ done }),
    });
    await refresh();
  } catch (e) {
    alert(`Не удалось изменить: ${e.message}`);
    await refresh();
  }
}

async function removeTask(task) {
  if (!confirm(`Удалить «${task.title}»?`)) return;
  try {
    await api(`/api/tasks/${task.id}/`, { method: 'DELETE' });
    await refresh();
  } catch (e) {
    alert(`Не удалось удалить: ${e.message}`);
  }
}

async function refresh() {
  try {
    const tasks = await api(`/api/tasks/?runId=${encodeURIComponent(currentRunId)}`);
    renderTasks(tasks);
  } catch (e) {
    if (e.status === 401) {
      clearToken();
      showApp(false);
      showError($('login-error'), 'Токен недействителен');
    } else {
      alert(`Ошибка загрузки: ${e.message}`);
    }
  }
}

async function addTask() {
  hideError($('add-error'));
  const input = $('new-title');
  const title = input.value.trim();
  if (!title) return;

  try {
    await api('/api/tasks/', {
      method: 'POST',
      body: JSON.stringify({ title, runId: currentRunId }),
    });
    input.value = '';
    await refresh();
  } catch (e) {
    showError($('add-error'), e.message);
  }
}

async function login() {
  hideError($('login-error'));
  const token = $('token').value.trim();
  if (!token) {
    showError($('login-error'), 'Введите токен');
    return;
  }
  setToken(token);

  const ok = await loadAuthor();
  if (!ok) {
    clearToken();
    showError($('login-error'), 'Неверный токен');
    return;
  }
  showApp(true);
  await refresh();
}

function logout() {
  clearToken();
  $('token').value = '';
  $('author').textContent = '—';
  showApp(false);
}

// ── обработчики ───────────────────────────────────────────────
$('login-btn').addEventListener('click', login);
$('token').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

$('load-btn').addEventListener('click', async () => {
  const val = $('run-id').value.trim();
  if (!val) return;
  currentRunId = val;
  await refresh();
});

$('run-id').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('load-btn').click();
});

$('add-btn').addEventListener('click', addTask);
$('new-title').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTask();
});

$('logout-btn').addEventListener('click', logout);

// ── старт ─────────────────────────────────────────────────────
(async function init() {
  if (!getToken()) {
    showApp(false);
    return;
  }
  const ok = await loadAuthor();
  if (ok) {
    showApp(true);
    await refresh();
  } else {
    showApp(false);
  }
})();