import type { ExtensionMessage, ActiveJD, ParsedJD, ScoringConfig } from '@recruitment/shared';

// --- DOM Helpers ---

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function showState(state: 'login' | 'jd' | 'dashboard'): void {
  document.querySelectorAll('.state').forEach((el) => el.classList.remove('active'));
  $(`state-${state}`).classList.add('active');
}

function showError(id: string, msg: string): void {
  const el = $(id);
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => (el.style.display = 'none'), 5000);
}

// --- Init ---

async function init(): Promise<void> {
  // Check if already authenticated
  const authResponse = await chrome.runtime.sendMessage({ type: 'GET_AUTH' } satisfies ExtensionMessage);

  if (authResponse.success && authResponse.data) {
    showUserInfo(authResponse.data.user.email);

    // Check if JD is already active
    const jdResponse = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_JD' } satisfies ExtensionMessage);
    if (jdResponse.success && jdResponse.data) {
      showDashboard(jdResponse.data);
    } else {
      showJDSelector();
    }
  } else {
    showState('login');
  }
}

function showUserInfo(email: string): void {
  $('user-info').style.display = 'flex';
  $('user-email').textContent = email;
}

// --- Login ---

$('login-btn').addEventListener('click', async () => {
  const email = ($('login-email') as HTMLInputElement).value.trim();
  const password = ($('login-password') as HTMLInputElement).value;

  if (!email || !password) {
    showError('login-error', 'Please fill in both fields');
    return;
  }

  ($('login-btn') as HTMLButtonElement).disabled = true;
  ($('login-btn') as HTMLButtonElement).textContent = 'Logging in...';

  try {
    // Call the extension auth endpoint
    const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:3002';
    const res = await fetch(`${apiBase}/api/extension/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!data.success) {
      showError('login-error', data.error || 'Login failed');
      return;
    }

    // Save auth to extension storage via service worker
    await chrome.runtime.sendMessage({
      type: 'SET_AUTH',
      token: data.data.token,
      user: data.data.user,
    } satisfies ExtensionMessage);

    showUserInfo(data.data.user.email);
    showJDSelector();
  } catch (err) {
    showError('login-error', 'Connection failed. Is the app running?');
  } finally {
    ($('login-btn') as HTMLButtonElement).disabled = false;
    ($('login-btn') as HTMLButtonElement).textContent = 'Login';
  }
});

// --- JD Selector ---

async function showJDSelector(): Promise<void> {
  showState('jd');
  const select = $('jd-select') as HTMLSelectElement;
  select.innerHTML = '<option value="">Loading...</option>';

  const response = await chrome.runtime.sendMessage({ type: 'GET_JDS' });

  if (!response.success || !response.data) {
    select.innerHTML = '<option value="">Failed to load JDs</option>';
    return;
  }

  const jds = response.data;
  const activeJDs = jds.filter((jd: { status: string; parsedData: unknown }) =>
    (jd.status === 'ACTIVE' || jd.status === 'PARSED') && jd.parsedData
  );

  if (activeJDs.length === 0) {
    select.innerHTML = '<option value="">No parsed JDs found</option>';
    return;
  }

  select.innerHTML = '<option value="">Select a JD...</option>' +
    activeJDs
      .map((jd: { id: string; title: string; clientName?: string }) =>
        `<option value="${jd.id}">${jd.title}${jd.clientName ? ` — ${jd.clientName}` : ''}</option>`
      )
      .join('');
}

$('jd-activate-btn').addEventListener('click', async () => {
  const select = $('jd-select') as HTMLSelectElement;
  const jdId = select.value;
  if (!jdId) return;

  // Fetch full JD details
  const response = await chrome.runtime.sendMessage({ type: 'GET_JDS' });
  if (!response.success) return;

  const jd = response.data.find((j: { id: string }) => j.id === jdId);
  if (!jd || !jd.parsedData) return;

  const activeJD: ActiveJD = {
    id: jd.id,
    title: jd.title,
    clientName: jd.clientName,
    parsedData: jd.parsedData as ParsedJD,
    scoringConfig: jd.scoringConfig as ScoringConfig | undefined,
  };

  await chrome.runtime.sendMessage({
    type: 'SET_ACTIVE_JD',
    jd: activeJD,
  } satisfies ExtensionMessage);

  showDashboard(activeJD);
});

$('jd-logout-btn').addEventListener('click', logout);

// --- Dashboard ---

async function showDashboard(jd: ActiveJD): Promise<void> {
  showState('dashboard');

  $('dashboard-jd-title').textContent = jd.title;
  $('dashboard-jd-client').textContent = jd.clientName || '';

  // Load stats
  const statsResponse = await chrome.runtime.sendMessage({ type: 'GET_STATS' } satisfies ExtensionMessage);
  if (statsResponse.success && statsResponse.data) {
    $('stat-total').textContent = String(statsResponse.data.total);
    $('stat-green').textContent = String(statsResponse.data.green);
    $('stat-yellow').textContent = String(statsResponse.data.yellow);
    $('stat-red').textContent = String(statsResponse.data.red);
  }
}

$('dashboard-open-app').addEventListener('click', () => {
  const appUrl = import.meta.env.VITE_API_BASE || 'http://localhost:3002';
  chrome.tabs.create({ url: `${appUrl}/dashboard` });
});

$('dashboard-change-jd').addEventListener('click', () => {
  showJDSelector();
});

$('dashboard-clear-cache').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
  $('stat-total').textContent = '0';
  $('stat-green').textContent = '0';
  $('stat-yellow').textContent = '0';
  $('stat-red').textContent = '0';
});

// --- Logout ---

$('logout-link').addEventListener('click', logout);

async function logout(): Promise<void> {
  await chrome.runtime.sendMessage({ type: 'LOGOUT' } satisfies ExtensionMessage);
  $('user-info').style.display = 'none';
  showState('login');
}

// --- Start ---
init();
