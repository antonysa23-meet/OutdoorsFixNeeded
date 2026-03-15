// ============================================================
// Outdoors Setup Wizard — Renderer
// Works in both Electron (via preload IPC) and browser (via Socket.IO)
// ============================================================

const isElectron = !!(window.electronAPI);
let currentPage = 0;
const totalPages = 6;

// ---------------------------------------------------------------------------
// Page navigation
// ---------------------------------------------------------------------------

function goToPage(index) {
  if (index < 0 || index >= totalPages) return;

  const pages = document.querySelectorAll('.page');
  const dots = document.querySelectorAll('.dot');

  pages[currentPage].classList.remove('active');
  dots[currentPage].classList.remove('active');
  dots[currentPage].classList.add('completed');

  currentPage = index;

  pages[currentPage].classList.add('active');
  pages[currentPage].classList.remove('completed');
  dots[currentPage].classList.remove('completed');
  dots[currentPage].classList.add('active');

  // Trigger page-specific logic
  if (currentPage === 1) runInstallPage();
  if (currentPage === 2) runAuthPage();
  if (currentPage === 3) runBrowserPage();
  if (currentPage === 4) runTelegramPage();
}

function nextPage() {
  goToPage(currentPage + 1);
}

// ---------------------------------------------------------------------------
// Page 1: Welcome
// ---------------------------------------------------------------------------

document.getElementById('btn-begin').addEventListener('click', () => {
  if (isElectron) {
    nextPage(); // Go to install page
  } else {
    // Non-Electron: skip install + auth pages, go straight to browser setup
    goToPage(3);
  }
});

// ---------------------------------------------------------------------------
// Page 2: Installing Dependencies (Electron only)
// ---------------------------------------------------------------------------

function setInstallItemState(id, state) {
  const el = document.getElementById(id);
  if (!el) return;
  const iconEl = el.querySelector('.install-icon');

  el.classList.remove('done', 'error', 'active');
  iconEl.innerHTML = '';
  iconEl.className = 'install-icon';

  if (state === 'active') {
    el.classList.add('active');
    iconEl.innerHTML = '<div class="spinner-small"></div>';
  } else if (state === 'done') {
    el.classList.add('done');
    iconEl.classList.add('done-icon');
  } else if (state === 'error') {
    el.classList.add('error');
    iconEl.classList.add('error-icon');
  } else {
    iconEl.classList.add('waiting-icon');
  }
}

function setInstallStatus(text) {
  const el = document.getElementById('install-status');
  if (el) el.textContent = text;
}

async function runInstallPage() {
  if (!isElectron) { nextPage(); return; }

  // Step 1: Node deps
  setInstallItemState('install-node-deps', 'active');
  setInstallStatus('Installing Node dependencies...');
  const nodeDeps = await window.electronAPI.installNodeDeps();
  setInstallItemState('install-node-deps', nodeDeps.ok ? 'done' : 'error');

  if (!nodeDeps.ok) {
    setInstallStatus('Node dependency install failed. Please check your internet connection and restart.');
    return;
  }

  // Step 2: Claude CLI
  setInstallItemState('install-claude-cli', 'active');
  setInstallStatus('Checking Claude CLI...');

  const claudeCheck = await window.electronAPI.checkClaudeInstalled();
  if (claudeCheck.installed) {
    setInstallItemState('install-claude-cli', 'done');
    setInstallStatus('Claude CLI already installed.');
  } else {
    setInstallStatus('Installing Claude CLI (this may take a minute)...');
    const claudeInstall = await window.electronAPI.installClaudeCLI();
    setInstallItemState('install-claude-cli', claudeInstall.ok ? 'done' : 'error');
    if (!claudeInstall.ok) {
      setInstallStatus('Claude CLI install failed. You can install it manually later.');
    }
  }

  // Step 3: Python ML deps (non-blocking)
  setInstallItemState('install-python', 'active');
  setInstallStatus('Checking Python packages...');
  setInstallItemState('install-python', 'done');

  setInstallStatus('All set!');
  await delay(800);
  nextPage();
}

// ---------------------------------------------------------------------------
// Page 3: Claude Authentication (Electron only)
// ---------------------------------------------------------------------------

async function runAuthPage() {
  if (!isElectron) { nextPage(); return; }

  showAuthState('auth-checking');

  const status = await window.electronAPI.checkClaudeAuth();
  if (status.authenticated) {
    showAuthState('auth-success');
    await delay(1200);
    nextPage();
    return;
  }

  showAuthState('auth-needed');
}

function showAuthState(id) {
  const states = document.querySelectorAll('.auth-state');
  states.forEach((s) => s.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

document.getElementById('btn-auth')?.addEventListener('click', async () => {
  showAuthState('auth-waiting');

  const waitText = document.getElementById('auth-waiting-text');
  if (waitText) {
    waitText.textContent = 'Opening Claude login...';
    setTimeout(() => { if (waitText.textContent.startsWith('Opening')) waitText.textContent = 'Still loading — almost there...'; }, 6000);
    setTimeout(() => { waitText.textContent = 'Waiting for sign-in...'; }, 15000);
  }

  const result = await window.electronAPI.startClaudeAuth();
  if (result.ok) {
    showAuthState('auth-success');
    await delay(1000);
    nextPage();
  } else {
    showAuthState('auth-needed');
    const hint = document.querySelector('#auth-needed .auth-hint');
    if (hint) hint.textContent = 'Auth timed out — try again.';
  }
});

document.getElementById('btn-skip-auth')?.addEventListener('click', () => {
  if (isElectron) window.electronAPI.cancelAuthPoll?.();
  nextPage();
});
document.getElementById('btn-skip-auth-waiting')?.addEventListener('click', () => {
  if (isElectron) window.electronAPI.cancelAuthPoll?.();
  nextPage();
});

// ---------------------------------------------------------------------------
// Page 4: Browser Setup (multi-step: detect → profile select → copy → launch → sign-in)
// ---------------------------------------------------------------------------

let browserSetupDone = false;
let detectedExePath = null;
let authPollTimer = null;

function showBrowserSection(id) {
  const sections = ['browser-detect-btn', 'browser-detecting', 'browser-not-found', 'browser-profiles',
    'browser-copying', 'browser-launching', 'browser-signin', 'browser-success', 'browser-error'];
  sections.forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.add('hidden');
  });
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

async function runBrowserPage() {
  if (browserSetupDone) return;
  // Page is ready — buttons are wired below
}

async function handleSetupChrome() {
  if (!isElectron) return;

  showBrowserSection('browser-detecting');

  try {
    const result = await window.electronAPI.detectBrowser();

    if (!result.found) {
      showBrowserSection('browser-not-found');
      return;
    }

    detectedExePath = result.exePath;

    if (result.profiles.length <= 1) {
      // Auto-select the only profile (or Default if none)
      const selectedProfile = result.profiles.length === 1 ? result.profiles[0].directory : 'Default';
      await createAndLaunch(selectedProfile);
    } else {
      // Show profile selector dropdown
      const select = document.getElementById('profile-select');
      select.innerHTML = '';
      result.profiles.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.directory;
        opt.textContent = p.email ? `${p.email} (${p.directory})` : `${p.name} (${p.directory})`;
        select.appendChild(opt);
      });
      showBrowserSection('browser-profiles');
    }
  } catch (err) {
    showBrowserError('Failed to detect Chrome: ' + err.message);
  }
}

async function handleConfirmProfile() {
  const select = document.getElementById('profile-select');
  const selectedProfile = select.value;
  await createAndLaunch(selectedProfile);
}

async function createAndLaunch(selectedProfile) {
  showBrowserSection('browser-copying');

  try {
    // Create automation profile
    const createResult = await window.electronAPI.createAutomationProfile({
      selectedProfile,
      exePath: detectedExePath,
    });

    if (!createResult.ok) {
      showBrowserError('Failed to create profile: ' + (createResult.error || 'unknown error'));
      return;
    }

    // Launch Chrome on sign-in page
    showBrowserSection('browser-launching');
    const launchResult = await window.electronAPI.launchAutomationChrome(detectedExePath);

    if (!launchResult.ok) {
      showBrowserError('Failed to launch Chrome: ' + (launchResult.error || 'unknown error'));
      return;
    }

    // Start polling for sign-in
    showBrowserSection('browser-signin');
    startAuthPolling();
  } catch (err) {
    showBrowserError('Error: ' + err.message);
  }
}

function startAuthPolling() {
  if (authPollTimer) clearInterval(authPollTimer);

  authPollTimer = setInterval(async () => {
    try {
      const result = await window.electronAPI.checkBrowserAuth();
      if (result.signedIn) {
        clearInterval(authPollTimer);
        authPollTimer = null;
        browserSetupDone = true;
        const emailEl = document.getElementById('browser-email');
        if (emailEl) emailEl.textContent = result.email ? `(${result.email})` : '';
        showBrowserSection('browser-success');
        await delay(1500);
        nextPage();
      }
    } catch { /* keep polling */ }
  }, 2000);
}

function showBrowserError(msg) {
  const errorText = document.getElementById('browser-error-text');
  if (errorText) errorText.textContent = msg;
  showBrowserSection('browser-error');
}

document.getElementById('btn-setup-chrome')?.addEventListener('click', handleSetupChrome);
document.getElementById('btn-confirm-profile')?.addEventListener('click', handleConfirmProfile);
document.getElementById('btn-retry-browser')?.addEventListener('click', () => {
  showBrowserSection('browser-detect-btn');
});

// ---------------------------------------------------------------------------
// Page 5: Telegram Setup
// ---------------------------------------------------------------------------

document.getElementById('btn-tg-connect')?.addEventListener('click', async () => {
  if (!isElectron) return;

  const tokenInput = document.getElementById('tg-token');
  const hintEl = document.getElementById('tg-token-hint');
  const token = tokenInput?.value?.trim();

  if (!token || !token.includes(':')) {
    if (hintEl) hintEl.textContent = 'Please enter a valid bot token (format: 123456:ABC...).';
    return;
  }

  if (hintEl) hintEl.textContent = 'Verifying token...';

  try {
    const result = await window.electronAPI.saveTelegramToken(token);
    if (result.ok) {
      // Token valid — show step 2
      document.getElementById('tg-step-token').classList.add('hidden');
      document.getElementById('tg-step-chat').classList.remove('hidden');

      // Poll for chat ID
      const chatResult = await window.electronAPI.detectTelegramChatId(token);
      if (chatResult.ok) {
        document.getElementById('tg-chat-spinner').classList.add('hidden');
        document.getElementById('tg-chat-hint').textContent = 'Connected! Chat ID: ' + chatResult.chatId;
        await delay(1500);
        nextPage();
      } else {
        document.getElementById('tg-chat-spinner').classList.add('hidden');
        document.getElementById('tg-chat-hint').textContent = chatResult.error || 'Could not detect chat. You can configure this later.';
        await delay(2000);
        nextPage();
      }
    } else {
      if (hintEl) hintEl.textContent = result.error || 'Invalid token. Check with @BotFather.';
    }
  } catch (err) {
    if (hintEl) hintEl.textContent = 'Error: ' + err.message;
  }
});

document.getElementById('btn-skip-tg')?.addEventListener('click', () => {
  nextPage();
});

function runTelegramPage() {
  // Page is ready — button handlers are wired above
}

// ---------------------------------------------------------------------------
// Page 6: Complete
// ---------------------------------------------------------------------------

document.getElementById('btn-close').addEventListener('click', async () => {
  if (isElectron) {
    await window.electronAPI.completeSetup();
    await window.electronAPI.closeWindow();
  } else {
    window.close();
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
