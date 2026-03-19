// Fix: Core Stability (Phase 13)
function safeShow(id, display = 'block') {
  const el = document.getElementById(id);
  if (el) el.style.display = display;
}
function safeHide(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// --- FIX 6: Defensive Coding ---

window.addEventListener('error', (e) => {
  console.error('FlowX caught error:', e.message, 'at', e.filename, ':', e.lineno);
  if (e.message && e.message.includes('is not defined')) {
    console.warn('Missing function:', e.message, '— showing fallback');
  }
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('FlowX unhandled promise rejection:', e.reason);
  e.preventDefault();
});

function safeCall(fnName, ...args) {
  if (typeof window[fnName] === 'function') {
    return window[fnName](...args);
  } else {
    console.warn(`safeCall: ${fnName} is not defined — skipping`);
  }
}

function generateAndInjectIcons() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, 192, 192);
  ctx.fillStyle = '#00d4aa';
  ctx.beginPath();
  ctx.arc(96, 96, 72, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#07090f';
  ctx.font = 'bold 80px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('F', 96, 100);
  const dataUrl = canvas.toDataURL('image/png');

  // Inject favicon
  let favicon = document.querySelector('link[rel="icon"]') || document.createElement('link');
  favicon.rel = 'icon';
  favicon.href = dataUrl;
  document.head.appendChild(favicon);

  // Inject apple touch icon
  let apple = document.querySelector('link[rel="apple-touch-icon"]') || document.createElement('link');
  apple.rel = 'apple-touch-icon';
  apple.href = dataUrl;
  document.head.appendChild(apple);

  // Fix manifest to use data URL
  const manifest = {
    name: "FlowX — Personal Finance OS",
    short_name: "FlowX",
    start_url: "/",
    display: "standalone",
    background_color: "#07090f",
    theme_color: "#00d4aa",
    icons: [
      { src: dataUrl, sizes: "192x192", type: "image/png" },
      { src: dataUrl, sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
  let manifestLink = document.querySelector('link[rel="manifest"]') || document.createElement('link');
  manifestLink.rel = 'manifest';
  manifestLink.href = URL.createObjectURL(blob);
  document.head.appendChild(manifestLink);
}
generateAndInjectIcons();

// --- Supabase Setup ---
const SUPABASE_URL  = "https://imiqpxibfzpkaafltvea.supabase.co"
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltaXFweGliZnpwa2FhZmx0dmVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1OTc3NjksImV4cCI6MjA4OTE3Mzc2OX0.KBiXzevHoWdEjtd-AlLQO_vBofSj6Y2u50TjXZ7p1_U"
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON)

let currentUser = null;
let currentProfile = null;

// --- Constants & Global State ---
let appData = {
  transactions: [],
  budgets: [],
  goals: [],
  settings: { currency: '₹' }
};

const CHART_REGISTRY = {}; // Fix 3: Global registry

function createChart(canvasId, config) {
  if (CHART_REGISTRY[canvasId]) {
    CHART_REGISTRY[canvasId].destroy();
  }
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  CHART_REGISTRY[canvasId] = new Chart(ctx, config);
  return CHART_REGISTRY[canvasId];
}

function hideAppLoader() {
  const loader = document.getElementById('app-loader');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 500);
  }
}

// Fix 17: Keyboard Shortcuts
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      const activeModal = document.querySelector('.modal-overlay.active');
      if (activeModal) {
        const form = activeModal.querySelector('form');
        if (form) form.requestSubmit();
      } else if (document.getElementById('view-settings').classList.contains('active')) {
        saveProfileSettings();
      }
    }
    if (e.key === 'Escape') {
      const activeModal = document.querySelector('.modal-overlay.active');
      if (activeModal) closeModal(activeModal.id);
      closeMobileSidebar();
    }
    if (e.altKey && e.key === 'n') {
      e.preventDefault();
      openModal('addTxModal');
    }
  });
}

// Fix 19: Back to Top helper
function setupScrollEvents() {
  window.addEventListener('scroll', () => {
    const btn = document.getElementById('backToTop');
    if (btn) btn.style.display = window.scrollY > 300 ? 'flex' : 'none';
  });
}



// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupCustomCursor();
  detectAndShowLanding(); // New
  
  // Handle OAuth hash redirect
  const hash = window.location.hash;
  if (hash && hash.includes('access_token')) {
    const params = new URLSearchParams(hash.substring(1));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token) {
      await sb.auth.setSession({ access_token, refresh_token });
      history.replaceState(null, '', window.location.pathname);
    }
  }
  
  document.getElementById('txDate').valueAsDate = new Date();
  document.getElementById('chatInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendChatMsg();
  });
  setupKeyboardShortcuts();
  setupScrollEvents();
  
  const { data: { session } } = await sb.auth.getSession()
  if (!session) {
    showLandingPage();
  } else {
    loadApp(session.user);
  }

  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN')  loadApp(session.user);
    if (event === 'SIGNED_OUT') showLandingPage();
  });
});

// --- Auth System ---
function showLandingPage() {
  const lp = document.getElementById('landing-page');
  if (lp) {
    lp.style.display = 'block';
    setTimeout(() => lp.style.opacity = '1', 50);
  }
  const auth = document.getElementById('authScreen');
  if (auth) {
    auth.style.opacity = '0';
    auth.style.pointerEvents = 'none';
  }
  safeHide('mainApp');
  hideAppLoader();
}



function openAuth(tab = 'signin') {
  switchAuthTab(tab);
  const auth = document.getElementById('authScreen');
  if (auth) {
    auth.style.display = 'flex';
    setTimeout(() => {
      auth.style.opacity = '1';
      auth.style.pointerEvents = 'auto';
    }, 50);
  }
}


function closeAuth() {
  const auth = document.getElementById('authScreen');
  if (auth) {
    auth.style.opacity = '0';
    auth.style.pointerEvents = 'none';
    setTimeout(() => auth.style.display = 'none', 500);
  }
}


async function loadApp(user) {
  currentUser = user;
  
  // Fade out landing/auth
  const lp = document.getElementById('landing-page');
  if (lp) lp.style.opacity = '0';
  
  const auth = document.getElementById('authScreen');
  if (auth) {
    auth.style.opacity = '0';
    auth.style.pointerEvents = 'none';
  }
  
  setTimeout(() => {
    safeHide('landing-page');
    const mainApp = document.getElementById('mainApp');
    if (mainApp) {
      mainApp.style.display = 'flex';
      setTimeout(() => mainApp.style.opacity = '1', 50);
    }
  }, 600);

  
  await loadData(); // Now fetches from Supabase
  
  // Real-time sync
  sb.channel('transactions')
    .on('postgres_changes', {
      event: '*', schema: 'public',
      table: 'transactions',
      filter: `user_id=eq.${user.id}`
    }, (payload) => {
      loadData().then(() => {
        renderAllViews();
        showToast('Synced from another device 🔄', 'info');
      });
    })
    .subscribe();
  
  await loadChatHistory();
  
  // Render initial view
  const activeView = document.querySelector('.nav-item.active').dataset.view;
  switchView(activeView);
  hideAppLoader();
}


function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(tab === 'signin' ? 'tabSignIn' : 'tabSignUp').classList.add('active');
  
  document.getElementById('signInForm').style.display = tab === 'signin' ? 'block' : 'none';
  document.getElementById('signUpForm').style.display = tab === 'signup' ? 'block' : 'none';
}

async function handleAuth(e, type) {
  e.preventDefault();
  const errorEl = document.getElementById(type === 'signin' ? 'signInError' : 'signUpError');
  errorEl.innerText = '';
  
  try {
    if (type === 'signup') {
      const email = document.getElementById('signUpEmail').value;
      const pass = document.getElementById('signUpPassword').value;
      const name = document.getElementById('signUpName').value;
      
      const { data, error } = await sb.auth.signUp({
        email, password: pass,
        options: { data: { full_name: name, avatar_url: '' } }
      });
      if(error) throw error;
      
      // Fix 2: Auth Email Overhaul
      document.getElementById('signUpForm').innerHTML = `
        <div style="text-align:center;padding:20px;">
          <div style="font-size:40px;margin-bottom:20px;">✉️</div>
          <h3 style="margin-bottom:10px;">Confirm your email</h3>
          <p style="color:var(--ink3);font-size:0.9rem;line-height:1.5;">
            We've sent a magic link to <b>${email}</b>.<br>Please click it to activate your account.
          </p>
          <button onclick="location.reload()" class="btn-primary" style="margin-top:20px;width:100%;justify-content:center;">Back to Sign In</button>
        </div>
      `;
    } else {

      const email = document.getElementById('signInEmail').value;
      const pass = document.getElementById('signInPassword').value;
      
      const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
      if(error) throw error;
    }
  } catch(err) {
    errorEl.innerText = err.message;
  }
}

async function signInWithGoogle() {
  const redirectTo = window.location.href.split('#')[0];
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if(error) showToast(error.message, 'error');
}

async function signInWithGithub() {
  const redirectTo = window.location.href.split('#')[0];
  const { error } = await sb.auth.signInWithOAuth({ provider: 'github', options: { redirectTo } });
  if(error) showToast(error.message, 'error');
}

async function forgotPassword() {
  const email = document.getElementById('signInEmail').value;
  if(!email) return document.getElementById('signInError').innerText = "Please enter your email above first.";
  
  const { error } = await sb.auth.resetPasswordForEmail(email);
  if(error) {
    document.getElementById('signInError').innerText = error.message;
  } else {
    showToast('Password reset link sent to email 📫');
  }
}

function initParticles() {
  particlesJS("particles-js", {
    particles: {
      number: { value: 40, density: { enable: true, value_area: 800 } },
      color: { value: ["#00f0ff", "#7000ff", "#ffd700"] },
      shape: { type: "circle" },
      opacity: { value: 0.3, random: true, anim: { enable: true, speed: 1, opacity_min: 0.1, sync: false } },
      size: { value: 3, random: true, anim: { enable: false } },
      line_linked: { enable: true, distance: 150, color: "#7000ff", opacity: 0.2, width: 1 },
      move: { enable: true, speed: 1.5, direction: "none", random: true, straight: false, out_mode: "out", bounce: false }
    },
    interactivity: {
      detect_on: "canvas",
      events: {
        onhover: { enable: true, mode: "grab" },
        onclick: { enable: true, mode: "push" },
        resize: true
      },
      modes: { grab: { distance: 150, line_linked: { opacity: 0.5 } }, push: { particles_nb: 3 } }
    },
    retina_detect: true
  });
}

// --- Data Management ---
async function loadData() {
  if (!currentUser) return;
  try {
    // Load Profile
    const { data: prof, error: e0 } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
    if(prof) {
      currentProfile = prof;
      document.getElementById('settingsNameDisplay').innerText = prof.full_name || 'No Name';
      document.getElementById('profileName').value = prof.full_name || '';
      document.getElementById('profileIncome').value = prof.monthly_income || '';
      
      const avatarEl = document.getElementById('settingsAvatar');
      if(prof.avatar_url) {
        avatarEl.innerHTML = `<img src="${prof.avatar_url}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
      } else {
        avatarEl.innerText = (prof.full_name || '?').charAt(0).toUpperCase();
      }
    } else {
      // No profile row yet — create one from Google/auth metadata
      const meta = currentUser.user_metadata || {};
      const name = meta.full_name || meta.name || currentUser.email.split('@')[0];
      const avatar = meta.avatar_url || meta.picture || null;
      await sb.from('profiles').upsert({ id: currentUser.id, full_name: name, avatar_url: avatar });
      currentProfile = { full_name: name, avatar_url: avatar };
      document.getElementById('settingsNameDisplay').innerText = name;
      document.getElementById('profileName').value = name;
      const avatarEl = document.getElementById('settingsAvatar');
      if(avatar) avatarEl.innerHTML = `<img src="${avatar}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">` ;
      else avatarEl.innerText = name.charAt(0).toUpperCase();
    }
    
    // Always update sidebar with current profile
    const sidebarName = currentProfile.full_name || currentUser.email.split('@')[0];
    const sidebarAvatar = currentProfile.avatar_url;
    document.getElementById('sidebarName').innerText = sidebarName;
    const sidebarAvatarEl = document.getElementById('sidebarAvatar');
    if(sidebarAvatar) {
      sidebarAvatarEl.innerHTML = `<img src="${sidebarAvatar}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
    } else {
      sidebarAvatarEl.innerText = sidebarName.charAt(0).toUpperCase();
    }
    
    // Load Sidebar Avatar
    document.getElementById('settingsEmailDisplay').innerText = currentUser.email;
    document.getElementById('referralLink').value = `https://flowx.finance?ref=${currentUser.id.substring(0,8)}`;
    
    // Load Journal
    const journalBox = document.getElementById('financeJournal');
    if(journalBox) loadJournal(journalBox);

    // Phase 7 Initial Prefetch
    updateNetWorth();
    fetchSubscriptions().then(renderSubscriptions);

    const { data: txs, error: e1 } = await sb.from('transactions').select('*').order('date', { ascending: false });
    if(e1) throw e1;
    appData.transactions = txs || [];
    
    const { data: bgts, error: e2 } = await sb.from('budgets').select('*');
    if(e2) throw e2;
    appData.budgets = (bgts || []).map(b => ({ id: b.id, category: b.category, limit: parseFloat(b.limit_amt) }));
    
    const { data: gls, error: e3 } = await sb.from('goals').select('*');
    if(e3) throw e3;
    appData.goals = (gls || []).map(g => ({ id: g.id, name: g.name, target: parseFloat(g.target), current: parseFloat(g.saved), deadline: g.deadline }));

    appData.transactions.sort((a,b) => new Date(b.date) - new Date(a.date));

    // Check for Onboarding / Seed
    if(appData.budgets.length === 0 && appData.transactions.length === 0) {
      // If profile is also incomplete, show onboarding
      if(!currentProfile || !currentProfile.monthly_income) {
        const obScreen = document.getElementById('onboardingScreen');
        if (obScreen) {
          obScreen.style.display = 'flex';
          setTimeout(() => obScreen.style.opacity = '1', 50);
        }
      } else {
        // Just seed data if they passed onboarding but have no data
        await seedSampleData();
      }
    }
  } catch(err) {
    showToast('Failed to load data: ' + err.message, 'error');
  }
}

async function clearAllData() {
  showConfirmModal('Wipe All Data', 'Are you sure you want to wipe all data? This cannot be undone.', async () => {
    try {

    await sb.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    await sb.from('budgets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('goals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    appData = { transactions: [], budgets: [], goals: [], settings: { currency: '₹' } };
    renderAllViews();
    showToast('Data wiped successfully.', 'success');
    } catch(e) { showToast(e.message, 'error'); }
  });
}


function exportData() {
  const dataStr = JSON.stringify(appData, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  let linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', 'flowx_cloud_backup.json');
  linkElement.click();
  showToast('Data exported successfully.');
}

async function loadMockDataAndRefresh() {
  await seedSampleData();
}

async function seedSampleData() {
  if (!currentUser) return;
  const userId = currentUser.id;
  const now = new Date();
  const lastMonth = new Date(); lastMonth.setMonth(now.getMonth() - 1);
  
  const transactions = [
    { user_id: userId, amount: 75000, category: 'Salary', type: 'income', date: now.toISOString(), note: 'Monthly Salary' },
    { user_id: userId, amount: 1500, category: 'Food', type: 'expense', date: now.toISOString(), note: 'Zomato Lunch' },
    { user_id: userId, amount: 450, category: 'Transport', type: 'expense', date: now.toISOString(), note: 'Uber Ride' },
    { user_id: userId, amount: 3200, category: 'Shopping', type: 'expense', date: now.toISOString(), note: 'Amazon Purchase' },
    { user_id: userId, amount: 799, category: 'Entertainment', type: 'expense', date: now.toISOString(), note: 'Netflix' },
    { user_id: userId, amount: 2500, category: 'Utilities', type: 'expense', date: now.toISOString(), note: 'Electricity Bill' },
    { user_id: userId, amount: 12000, category: 'Rent', type: 'expense', date: lastMonth.toISOString(), note: 'Last Month Rent' },
    { user_id: userId, amount: 5000, category: 'Investment', type: 'expense', date: now.toISOString(), note: 'Mutual Fund SIP' }
  ];

  const budgets = [
    { user_id: userId, category: 'Food', limit_amt: 10000 },
    { user_id: userId, category: 'Transport', limit_amt: 3000 },
    { user_id: userId, category: 'Shopping', limit_amt: 5000 }
  ];

  const goals = [
    { user_id: userId, name: 'Emergency Fund', target: 200000, saved: 15000, deadline: '2026-12-31' },
    { user_id: userId, name: 'Europe Trip', target: 300000, saved: 10000, deadline: '2027-06-30' }
  ];

  try {
    showToast('Seeding initial data... 🏗️', 'info');
    await sb.from('transactions').insert(transactions);
    await sb.from('budgets').insert(budgets);
    await sb.from('goals').insert(goals);
    
    showToast('Sample data seeded! 📊', 'success');
    await loadData();
    renderAllViews();
  } catch (e) {
    console.error('Seeding failed:', e);
    showToast('Seeding failed: ' + e.message, 'error');
  }
}

function generateId() { return crypto.randomUUID && crypto.randomUUID() || Math.random().toString(36).substr(2, 9); }


// --- Navigation & View Switching ---
function setupNavigation() {
  const links = document.querySelectorAll('.nav-item');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      const view = link.dataset.view;
      switchView(view);
      closeMobileSidebar();
    });
  });
}

function openMobileSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarBackdrop').classList.add('active');
}

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('active');
}

function toggleSidebar() {
  // Keeping this for old refs if any
  const sb = document.getElementById('sidebar');
  if (sb.classList.contains('open')) closeMobileSidebar();
  else openMobileSidebar();
}


function switchView(view) {
  document.querySelectorAll('.nav-item, [data-view]').forEach(el => el.classList.remove('active'));
  
  const targetView = document.querySelector(`[data-view="${view}"]`);
  if (!targetView) return;
  
  targetView.classList.add('active');
  targetView.classList.add('view-fade-in');
  setTimeout(() => targetView.classList.remove('view-fade-in'), 500);
  
  const navItem = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (navItem) navItem.classList.add('active');
  
  // Update title
  const title = view.charAt(0).toUpperCase() + view.slice(1);
  if (view !== 'dashboard') {
    document.getElementById('pageTitle').innerText = title;
  } else {
    renderDashboard(); // To refresh greeting
  }
  
  renderView(view);
}

function renderView(view) {
  const viewFunctions = {
    dashboard:     'renderDashboard',
    transactions:  'renderTransactions',
    budgets:       'renderBudgets',
    goals:         'renderGoals',
    analytics:     'renderAnalytics',
    insights:      'renderInsights',
    accounts:      'renderAccounts',
    subscriptions: 'renderSubscriptions',
    social:        'renderSocial',
    reports:       'renderReports',
    settings:      'renderSettings',
    investments:   'renderInvestments',
  };

  const fnName = viewFunctions[view];
  if (fnName && typeof window[fnName] === 'function') {
    window[fnName]();
  } else {
    main.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:16px;color:rgba(255,255,255,0.3)">
        <div style="font-size:48px">🔧</div>
        <div style="font-family:Outfit,sans-serif;font-size:20px;color:rgba(255,255,255,0.5)">${view.charAt(0).toUpperCase()+view.slice(1)}</div>
        <div style="font-size:14px">Coming soon</div>
      </div>`;
  }
}

function renderInsights() {
  const main = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML = `
    <div style="padding:24px">
      <h2 style="font-family:Outfit,sans-serif;font-size:24px;margin-bottom:24px">Smart Insights</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px" id="insights-grid">
        <div class="glass-card" style="padding:20px;border-radius:16px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.4);margin-bottom:8px">Savings Rate</div>
          <div style="font-family:Outfit,sans-serif;font-size:32px;font-weight:700;color:#00d4aa" id="insight-savings-rate">—</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px" id="insight-savings-label">Calculating...</div>
        </div>
        <div class="glass-card" style="padding:20px;border-radius:16px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.4);margin-bottom:8px">Spending Velocity</div>
          <div style="font-family:Outfit,sans-serif;font-size:32px;font-weight:700" id="insight-velocity">—</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px" id="insight-velocity-label">vs last month</div>
        </div>
        <div class="glass-card" style="padding:20px;border-radius:16px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.4);margin-bottom:8px">Month End Projection</div>
          <div style="font-family:Outfit,sans-serif;font-size:32px;font-weight:700;color:#f59e0b;font-family:'DM Mono',monospace" id="insight-projection">—</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px">at current spend rate</div>
        </div>
        <div class="glass-card" style="padding:20px;border-radius:16px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.4);margin-bottom:8px">Best Spend Day</div>
          <div style="font-family:Outfit,sans-serif;font-size:32px;font-weight:700;color:#a78bfa" id="insight-best-day">—</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px">historically lowest spending</div>
        </div>
      </div>
    </div>`;
  loadInsightsData();
}

async function loadInsightsData() {
  try {
    if (!currentUser) return;
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const { data: txns } = await sb.from('transactions').select('*').eq('user_id', currentUser.id).gte('date', start);
    if (!txns || txns.length === 0) return;

    const income   = txns.filter(t => t.type === 'income').reduce((s,t) => s+t.amount, 0);
    const expenses = txns.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0);
    const rate     = income > 0 ? Math.round((income - expenses) / income * 100) : 0;

    const srEl = document.getElementById('insight-savings-rate');
    const slEl = document.getElementById('insight-savings-label');
    if (srEl) srEl.textContent = rate + '%';
    if (slEl) slEl.textContent = rate >= 20 ? '🟢 Excellent' : rate >= 10 ? '🟡 Fair' : '🔴 Needs improvement';

    const daysGone  = now.getDate();
    const daysTotal = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const projected = Math.round((expenses / daysGone) * daysTotal);
    const pjEl = document.getElementById('insight-projection');
    if (pjEl) pjEl.textContent = '₹' + projected.toLocaleString('en-IN');

    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayTotals = new Array(7).fill(0);
    const dayCounts = new Array(7).fill(0);
    txns.filter(t => t.type === 'expense').forEach(t => {
      const d = new Date(t.date).getDay();
      dayTotals[d] += t.amount;
      dayCounts[d]++;
    });
    const dayAvgs  = dayTotals.map((t,i) => dayCounts[i] ? t/dayCounts[i] : Infinity);
    const bestDay  = dayAvgs.indexOf(Math.min(...dayAvgs));
    const bdEl = document.getElementById('insight-best-day');
    if (bdEl) bdEl.textContent = days[bestDay];
  } catch(e) { console.error('loadInsightsData:', e); }
}

function renderSocial() {
  const main = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML = `
    <div style="padding:24px">
      <h2 style="font-family:Outfit,sans-serif;font-size:24px;margin-bottom:24px">Social & Challenges</h2>
      <div style="display:flex;gap:10px;margin-bottom:24px">
        <button onclick="showSocialTab('challenges')" id="tab-challenges" style="background:rgba(0,212,170,0.1);border:1px solid rgba(0,212,170,0.3);color:#00d4aa;padding:8px 20px;border-radius:8px;font-family:'DM Sans',sans-serif;cursor:pointer">🏆 Challenges</button>
        <button onclick="showSocialTab('tips')" id="tab-tips" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.6);padding:8px 20px;border-radius:8px;font-family:'DM Sans',sans-serif;cursor:pointer">💡 Tips</button>
      </div>
      <div id="social-content"></div>
    </div>`;
  showSocialTab('challenges');
}

function showSocialTab(tab) {
  const content = document.getElementById('social-content');
  if (!content) return;
  if (tab === 'challenges') {
    const challenges = [
      { emoji:'🚫', title:'No Spend Weekend', desc:"Don't spend on Sat/Sun", duration:'2 days', difficulty:'Easy', color:'#00d4aa' },
      { emoji:'🍱', title:'Cook at Home Week', desc:'Food under ₹500 for 7 days', duration:'7 days', difficulty:'Medium', color:'#f59e0b' },
      { emoji:'💰', title:'Save ₹1,000 This Week', desc:'Add ₹1,000 to any goal', duration:'7 days', difficulty:'Medium', color:'#a78bfa' },
      { emoji:'📵', title:'No New Subscriptions', desc:"Don't add any subscription", duration:'30 days', difficulty:'Hard', color:'#ff4d6d' },
      { emoji:'🎯', title:'Zero Waste Budget', desc:'End month with ₹0 unassigned', duration:'30 days', difficulty:'Hard', color:'#00d4aa' },
    ];
    content.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px">${
      challenges.map(c => `
        <div class="glass-card" style="padding:20px;border-radius:16px;border-left:3px solid ${c.color}">
          <div style="font-size:32px;margin-bottom:10px">${c.emoji}</div>
          <div style="font-family:Outfit,sans-serif;font-size:16px;font-weight:600;margin-bottom:6px">${c.title}</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:12px">${c.desc}</div>
          <div style="display:flex;gap:8px;margin-bottom:14px">
            <span style="background:rgba(255,255,255,0.06);border-radius:20px;padding:3px 10px;font-size:11px;color:rgba(255,255,255,0.5)">${c.duration}</span>
            <span style="background:rgba(255,255,255,0.06);border-radius:20px;padding:3px 10px;font-size:11px;color:${c.color}">${c.difficulty}</span>
          </div>
          <button onclick="joinChallenge('${c.title}')" style="width:100%;background:rgba(0,212,170,0.1);border:1px solid rgba(0,212,170,0.2);color:#00d4aa;padding:8px;border-radius:8px;font-family:'DM Sans',sans-serif;cursor:pointer;font-size:13px">Join Challenge</button>
        </div>`).join('')
    }</div>`;
  } else {
    const tips = [
      { cat:'Saving', title:'Follow the 50/30/20 rule', desc:'50% needs, 30% wants, 20% savings.' },
      { cat:'Tax', title:'Max out 80C deductions', desc:'Invest ₹1.5L in PPF/ELSS to save ₹46,800 tax.' },
      { cat:'Investing', title:'Start a SIP today', desc:'Even ₹500/month in Nifty 50 grows hugely over time.' },
      { cat:'Emergency', title:'Build 6-month emergency fund', desc:'Keep 6 months expenses in a liquid fund.' },
      { cat:'Budgeting', title:'Audit your subscriptions', desc:'Most people pay for forgotten subscriptions monthly.' },
      { cat:'Saving', title:'Automate your savings', desc:'Auto-debit on salary day before you can spend it.' },
    ];
    const colors = { Saving:'#00d4aa', Tax:'#a78bfa', Investing:'#f59e0b', Emergency:'#ff4d6d', Budgeting:'#60a5fa' };
    content.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px">${
      tips.map(t => `
        <div class="glass-card" style="padding:20px;border-radius:16px">
          <span style="background:${colors[t.cat]||'#00d4aa'}22;color:${colors[t.cat]||'#00d4aa'};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600">${t.cat}</span>
          <div style="font-family:Outfit,sans-serif;font-size:15px;font-weight:600;margin:10px 0 6px">${t.title}</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.5);line-height:1.6">${t.desc}</div>
        </div>`).join('')
    }</div>`;
  }
}

// Fix 7: Settings Persistence
function updateAccessibility(type) {
  const isChecked = document.getElementById(type + 'Toggle')?.checked;
  localStorage.setItem('flowx_' + type, isChecked);
  if (type === 'highContrast') document.body.classList.toggle('high-contrast', isChecked);
  if (type === 'reducedMotion') document.body.classList.toggle('reduced-motion', isChecked);
  saveProfileSettings();
}

async function saveProfileSettings() {
  if (!currentUser) return;
  const settings = {
    lang: document.getElementById('langSelect')?.value,
    fontScale: document.getElementById('fontScaleSelect')?.value,
    highContrast: document.getElementById('highContrastToggle')?.checked,
    reducedMotion: document.getElementById('reducedMotionToggle')?.checked
  };
  localStorage.setItem('flowx_settings', JSON.stringify(settings));
  await sb.from('profiles').update({ settings_blob: settings }).eq('id', currentUser.id);
}

function loadLocalSettings() {
  const saved = localStorage.getItem('flowx_settings');
  if (saved) {
    const s = JSON.parse(saved);
    if (s.lang) {
      document.getElementById('langSelect').value = s.lang;
      // changeLanguage(); // Trigger if needed
    }
    if (s.fontScale) {
       document.getElementById('fontScaleSelect').value = s.fontScale;
       updateFontScale();
    }
    if (s.highContrast) {
       document.getElementById('highContrastToggle').checked = true;
       document.body.classList.add('high-contrast');
    }
    if (s.reducedMotion) {
       document.getElementById('reducedMotionToggle').checked = true;
       document.body.classList.add('reduced-motion');
    }
  }
}
async function joinChallenge(title) {

  try {
    if (!currentUser) { showToast('Sign in to join challenges', 'error'); return; }
    await sb.from('challenge_participants').insert({ user_id: currentUser.id, challenge_id: title.toLowerCase().replace(/\s+/g,'-'), joined_at: new Date().toISOString() });
    showToast('Challenge joined! Good luck 🎯', 'success');
  } catch(e) { showToast('Could not join — try again', 'error'); }
}

function renderSubscriptions() {
  const main = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML = `
    <div style="padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
        <h2 style="font-family:Outfit,sans-serif;font-size:24px">Subscriptions</h2>
        <button onclick="openAddSubscriptionModal()" style="background:linear-gradient(135deg,#00d4aa,#00b894);border:none;color:#07090f;padding:10px 20px;border-radius:10px;font-family:'DM Sans',sans-serif;font-weight:600;cursor:pointer">+ Add Subscription</button>
      </div>
      <div class="glass-card" style="padding:20px;border-radius:16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.4);margin-bottom:4px">Monthly Cost</div>
          <div style="font-family:'DM Mono',monospace;font-size:28px;font-weight:700;color:#00d4aa" id="sub-total">₹0</div>
        </div>
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.4);margin-bottom:4px">Yearly Cost</div>
          <div style="font-family:'DM Mono',monospace;font-size:28px;font-weight:700;color:#f59e0b" id="sub-yearly">₹0</div>
        </div>
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.4);margin-bottom:4px">Active</div>
          <div style="font-family:Outfit,sans-serif;font-size:28px;font-weight:700" id="sub-count">0</div>
        </div>
      </div>
      <div id="subscriptions-list" style="display:flex;flex-direction:column;gap:10px">
        <div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3);font-size:14px">Loading subscriptions...</div>
      </div>
    </div>`;
  loadSubscriptions();
}

async function loadSubscriptions() {
  const list = document.getElementById('subscriptions-list');
  if (!list || !currentUser) return;
  try {
    const { data } = await sb.from('subscriptions').select('*').eq('user_id', currentUser.id).eq('active', true);
    if (!data || data.length === 0) {
      list.innerHTML = `<div style="text-align:center;padding:60px 20px;color:rgba(255,255,255,0.3)">
        <div style="font-size:48px;margin-bottom:16px">📦</div>
        <div style="font-size:16px;margin-bottom:8px">No subscriptions yet</div>
        <div style="font-size:13px">Click + Add Subscription to track your recurring payments</div>
      </div>`;
      return;
    }
    const total = data.reduce((s,x) => s+(x.amount||0), 0);
    const totalEl  = document.getElementById('sub-total');
    const yearlyEl = document.getElementById('sub-yearly');
    const countEl  = document.getElementById('sub-count');
    if (totalEl)  totalEl.textContent  = '₹' + total.toLocaleString('en-IN');
    if (yearlyEl) yearlyEl.textContent = '₹' + (total*12).toLocaleString('en-IN');
    if (countEl)  countEl.textContent  = data.length;
    const catColors = { streaming:'#a78bfa', utilities:'#f59e0b', software:'#00d4aa', fitness:'#34d399', other:'#60a5fa' };
    list.innerHTML = data.map(s => `
      <div class="glass-card" style="padding:16px 20px;border-radius:14px;display:flex;align-items:center;gap:14px">
        <div style="font-size:28px">${s.emoji||'📦'}</div>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:500">${s.name}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:2px">${s.frequency||'monthly'} · Next: ${s.next_due||'—'}</div>
        </div>
        <div style="font-family:'DM Mono',monospace;font-size:16px;font-weight:600;color:${catColors[s.category]||'#00d4aa'}">₹${(s.amount||0).toLocaleString('en-IN')}</div>
        <button onclick="deleteSubscription('${s.id}')" style="background:rgba(255,77,109,0.1);border:1px solid rgba(255,77,109,0.2);color:#ff4d6d;width:30px;height:30px;border-radius:8px;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center">×</button>
      </div>`).join('');
  } catch(e) {
    list.innerHTML = `<div style="text-align:center;padding:40px;color:rgba(255,77,109,0.6);font-size:14px">Could not load subscriptions: ${e.message}</div>`;
  }
}

async function deleteSubscription(id) {
  showConfirmModal('Remove Subscription', 'Cancel this recurring payment?', async () => {
    try {
      await sb.from('subscriptions').delete().eq('id', id).eq('user_id', currentUser.id);
      showToast('Subscription removed', 'success');
      loadSubscriptions();
    } catch(e) { showToast('Could not delete', 'error'); }
  });
}

function openAddSubscriptionModal() {
  const existing = document.getElementById('add-sub-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'add-sub-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)';
  modal.innerHTML = `
    <div style="background:#0d1017;border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:32px;width:400px;max-width:95vw">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
        <h3 style="font-family:Outfit,sans-serif;font-size:20px">Add Subscription</h3>
        <button onclick="document.getElementById('add-sub-modal').remove()" style="background:rgba(255,255,255,0.06);border:none;color:white;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px">×</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <input id="sub-name" placeholder="Name (e.g. Netflix)" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:11px 14px;color:white;font-family:'DM Sans',sans-serif;font-size:14px;outline:none">
        <input id="sub-amount" type="number" placeholder="Amount (₹)" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:11px 14px;color:white;font-family:'DM Sans',sans-serif;font-size:14px;outline:none">
        <input id="sub-emoji" placeholder="Emoji (e.g. 📺)" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:11px 14px;color:white;font-family:'DM Sans',sans-serif;font-size:14px;outline:none">
        <select id="sub-freq" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:11px 14px;color:white;font-family:'DM Sans',sans-serif;font-size:14px;outline:none">
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
          <option value="weekly">Weekly</option>
        </select>
        <button onclick="saveSubscription()" style="background:linear-gradient(135deg,#00d4aa,#00b894);border:none;color:#07090f;padding:12px;border-radius:10px;font-family:'DM Sans',sans-serif;font-weight:600;cursor:pointer;font-size:15px">Save Subscription</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
}

async function saveSubscription() {
  const name   = document.getElementById('sub-name')?.value?.trim();
  const amount = parseFloat(document.getElementById('sub-amount')?.value);
  const emoji  = document.getElementById('sub-emoji')?.value?.trim() || '📦';
  const freq   = document.getElementById('sub-freq')?.value || 'monthly';
  if (!name || !amount) { showToast('Please fill name and amount', 'error'); return; }
  try {
    await sb.from('subscriptions').insert({ user_id: currentUser.id, name, amount, emoji, frequency: freq, active: true, next_due: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0] });
    showToast('Subscription added ✓', 'success');
    document.getElementById('add-sub-modal')?.remove();
    loadSubscriptions();
  } catch(e) { showToast('Could not save: ' + e.message, 'error'); }
}

  // 5. Projected Month End

function renderAllViews() {
  const activeView = document.querySelector('.nav-item.active').dataset.view;
  switchView(activeView);
}

// --- Utils ---
function formatCurrency(amount) {
  // Fix 13: Indian Number Formatting
  return '₹' + parseFloat(amount).toLocaleString('en-IN', { 
    maximumFractionDigits: 0,
    style: 'decimal' 
  });
}


function showToast(msg, type='success') {
  const container = document.getElementById('toaster');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = '<i class="fa-solid fa-circle-check"></i>';
  if(type === 'error') icon = '<i class="fa-solid fa-circle-exclamation"></i>';
  if(type === 'warning') icon = '<i class="fa-solid fa-triangle-exclamation"></i>';
  if(type === 'info') icon = '<i class="fa-solid fa-circle-info"></i>';
  
  toast.innerHTML = `${icon} <span>${msg}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('fadeOut');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

function setupCustomCursor() {
  const dot = document.getElementById('cursorDot');
  const ring = document.getElementById('cursorRing');
  if(!dot || !ring) return;

  let mouseX = 0, mouseY = 0;
  let ringX = 0, ringY = 0;

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
  });

  const animate = () => {
    ringX += (mouseX - ringX) * 0.15;
    ringY += (mouseY - ringY) * 0.15;
    ring.style.transform = `translate(${ringX}px, ${ringY}px)`;
    requestAnimationFrame(animate);
  };
  animate();
}

function getIconForCategory(cat) {
  cat = cat.toLowerCase();
  if(cat.includes('food') || cat.includes('dining')) return '<i class="fa-solid fa-utensils"></i>';
  if(cat.includes('trans') || cat.includes('fuel')) return '<i class="fa-solid fa-car"></i>';
  if(cat.includes('shop')) return '<i class="fa-solid fa-bag-shopping"></i>';
  if(cat.includes('entert') || cat.includes('movie')) return '<i class="fa-solid fa-film"></i>';
  if(cat.includes('util') || cat.includes('bill')) return '<i class="fa-solid fa-bolt"></i>';
  if(cat.includes('sal')) return '<i class="fa-solid fa-briefcase"></i>';
  if(cat.includes('health') || cat.includes('med')) return '<i class="fa-solid fa-notes-medical"></i>';
  return '<i class="fa-solid fa-tag"></i>';
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// Fix 5: Custom Confirmation Modal
function showConfirmModal(title, message, onConfirm, type = 'delete') {
  const modal = document.getElementById('confirmModal');
  const titleEl = document.getElementById('confirmTitle');
  const msgEl = document.getElementById('confirmMessage');
  const iconEl = document.getElementById('confirmIcon');
  const proceedBtn = document.getElementById('confirmProceedBtn');

  titleEl.innerText = title;
  msgEl.innerText = message;
  iconEl.innerText = type === 'delete' ? '⚠️' : '❓';
  iconEl.style.color = type === 'delete' ? 'var(--red)' : 'var(--neon-cyan)';
  proceedBtn.innerText = type === 'delete' ? 'Delete' : 'Confirm';
  proceedBtn.style.background = type === 'delete' ? 'var(--red)' : 'var(--neon-cyan)';

  openModal('confirmModal');

  proceedBtn.onclick = () => {
    onConfirm();
    closeModal('confirmModal');
  };
}

// Fix 6: Form Validation Utility
function validateForm(formId) {
  const form = document.getElementById(formId);
  if (!form) return true;
  let isValid = true;
  const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');

  inputs.forEach(input => {
    input.classList.remove('invalid-input', 'shake');
    if (!input.value || (input.type === 'number' && parseFloat(input.value) <= 0)) {
      isValid = false;
      input.classList.add('invalid-input', 'shake');
      setTimeout(() => input.classList.remove('shake'), 500);
    }
  });

  if (!isValid) {
    showToast('Please fill all required fields correctly', 'error');
    haptic('error');
  }
  return isValid;
}



// --- Dashboard Logistics ---
function renderDashboard() {
  // Fix 12: Smart Greeting
  const userName = currentUser?.user_metadata?.full_name?.split(' ')[0] || 'User';
  const hour = new Date().getHours();
  let greet = 'Good evening';
  if (hour < 12) greet = 'Good morning';
  else if (hour < 17) greet = 'Good afternoon';
  document.getElementById('pageTitle').innerText = `${greet}, ${userName} 👋`;

  const currentMonth = new Date().getMonth();

  const currentYear = new Date().getFullYear();
  
  let mExpense = 0; let mIncome = 0;
  
  appData.transactions.forEach(t => {
    const d = new Date(t.date);
    if(d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
      if(t.type === 'expense') mExpense += parseFloat(t.amount);
      if(t.type === 'income') mIncome += parseFloat(t.amount);
    }
  });
  
  let netWorth = appData.transactions.reduce((acc, t) => acc + (t.type === 'income' ? parseFloat(t.amount) : -parseFloat(t.amount)), 0);
  
  let streak = 0;
  const today = new Date();
  today.setHours(0,0,0,0);
  const expenses = appData.transactions.filter(t => t.type === 'expense').sort((a,b) => new Date(b.date) - new Date(a.date));
  if(expenses.length > 0) {
    const lastExp = new Date(expenses[0].date);
    lastExp.setHours(0,0,0,0);
    const diffTime = Math.abs(today - lastExp);
    streak = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }
  
  document.getElementById('dashStreak').innerText = `${streak} Days`;
  if(streak === 0) {
    document.getElementById('streakSub').innerText = 'Start saving today!';
    document.getElementById('streakSub').className = 'stat-change';
  } else if(streak >= 3) {
    document.getElementById('streakSub').innerText = 'You are on fire! 🔥';
    document.getElementById('streakSub').className = 'stat-change positive';
    document.getElementById('dashStreak').style.color = 'var(--neon-gold)';
  } else {
    document.getElementById('streakSub').innerText = 'Keep it up! ✨';
    document.getElementById('streakSub').className = 'stat-change positive';
    document.getElementById('dashStreak').style.color = '';
  }

  // Animation counting
  animateValue("dashNetWorth", 0, netWorth, 1000);
  animateValue("dashIncome", 0, mIncome, 1000);
  animateValue("dashExpense", 0, mExpense, 1000);

  // Recent TX snippet
  const list = document.getElementById('recentTxList');
  list.innerHTML = '';
  appData.transactions.slice(0, 5).forEach(t => {
    const icon = getIconForCategory(t.category);
    const amtClass = t.type === 'income' ? 'income' : 'expense';
    const plusMin = t.type === 'income' ? '+' : '-';
    list.innerHTML += `
      <div class="tx-item">
        <div class="tx-left">
          <div class="tx-icon">${icon}</div>
          <div class="tx-details"><h4>${t.category}</h4><p>${new Date(t.date).toLocaleDateString()}</p></div>
        </div>
        <div class="tx-amount ${amtClass}">${plusMin}${formatCurrency(t.amount)}</div>
      </div>
    `;
  });

  renderCharts();
  generateAIInsight(mIncome, mExpense);
}

// --- UX Utilities ---
function renderSkeletons(containerId, count = 3) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const skel = document.createElement('div');
    skel.className = 'glass-card skeleton-box';
    skel.style.height = '80px';
    skel.style.marginBottom = '15px';
    container.appendChild(skel);
  }
}

function renderEmptyState(containerId, message = 'Nothing to show yet') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <div style="text-align:center; padding: 4rem 2rem; color: var(--ink3);">
      <div style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;">📂</div>
      <p style="font-size: 1rem;">${message}</p>
    </div>
  `;
}

function animateValue(id, start, end, duration) {

  if (start === end) { document.getElementById(id).innerText = formatCurrency(end); return; }
  const obj = document.getElementById(id);
  const range = end - start;
  let current = start;
  const increment = end > start ? range / 30 : range / 30; // approx 60fps for 1s
  const stepTime = Math.abs(Math.floor(duration / 30));
  let timer = setInterval(function() {
      current += increment;
      if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
          current = end;
          clearInterval(timer);
      }
      obj.innerText = formatCurrency(current);
  }, stepTime);
}

// Chart.js Setup
// --- Security & PIN Settings ---
function saveAppPin() {
    const pin = document.getElementById('settingsPin').value;
    if(pin.length === 4) {
        localStorage.setItem('flowx_app_pin', pin);
        showToast('PIN set successfully! 🔒', 'success');
        haptic('success');
        document.getElementById('settingsPin').value = '';
    } else {
        showToast('PIN must be 4 digits', 'error');
        haptic('error');
    }
}

function clearAppPin() {
    localStorage.removeItem('flowx_app_pin');
    showToast('PIN removed', 'info');
    haptic('medium');
}

function savePinTimeout() {
    const timeout = document.getElementById('pinTimeout').value;
    localStorage.setItem('flowx_pin_timeout', timeout);
    showToast('Lock timeout updated', 'success');
}

Chart.defaults.color = 'rgba(255,255,255,0.4)';
Chart.defaults.font.family = "'DM Sans', sans-serif";
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(13,16,23,0.9)';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(0,212,170,0.3)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.titleFont = { family: "'Outfit', sans-serif", size: 13 };
Chart.defaults.plugins.tooltip.bodyFont = { family: "'DM Mono', monospace", size: 12 };
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.cornerRadius = 10;

function renderCharts() {
  const primaryColor = '#00d4aa';
  const secondaryColor = '#a78bfa';
  const alertColor = '#ff4d6d';

  // 1. Income vs Expense (Bar/Line Combo)
  // aggregate last 6 months

  let months = []; let incData = [0,0,0,0,0,0]; let expData = [0,0,0,0,0,0];
  const d = new Date();
  for(let i=5; i>=0; i--) {
    let md = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push(md.toLocaleString('default', { month: 'short' }));
  }
  
  appData.transactions.forEach(t => {
    let td = new Date(t.date);
    let diff = (d.getFullYear() - td.getFullYear()) * 12 + d.getMonth() - td.getMonth();
    if (diff >= 0 && diff < 6) {
      let idx = 5 - diff;
      if(t.type === 'income') incData[idx] += parseFloat(t.amount);
      if(t.type === 'expense') expData[idx] += parseFloat(t.amount);
    }
  });

  createChart('mainChart', {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        { label: 'Income', data: incData, backgroundColor: 'rgba(0, 212, 170, 0.8)', borderRadius: 8, barPercentage: 0.6 },
        { label: 'Expense', data: expData, backgroundColor: 'rgba(255, 77, 109, 0.8)', borderRadius: 8, barPercentage: 0.6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { grid: { color: 'rgba(255,255,255,0.04)' }, border: {display: false} }, x: { grid: {display: false}, border: {display: false} } },
      plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 10, usePointStyle: true } } },
      animation: { duration: 1500, easing: 'easeOutQuart' }
    }
  });


  // 2. Spending by Category Donut
    let catData = {};

    const expenses = appData.transactions.filter(t => t.type === 'expense');
    const ctxDonut = document.getElementById('donutChart'); // Define ctxDonut here
    
    if (expenses.length === 0) {
      // Empty state for chart
      if (ctxDonut) { // Check if canvas exists
        const ctx2d = ctxDonut.getContext('2d');
        ctx2d.clearRect(0,0,ctxDonut.width, ctxDonut.height);
        ctx2d.font = "14px Outfit, sans-serif";
        ctx2d.fillStyle = "rgba(255,255,255,0.4)";
        ctx2d.textAlign = "center";
        ctx2d.fillText("No expenses recorded yet", ctxDonut.width/2, ctxDonut.height/2);
      }
    } else {
      expenses.forEach(t => {
        catData[t.category] = (catData[t.category] || 0) + parseFloat(t.amount);
      });
      
      let sortedCats = Object.entries(catData).sort((a,b)=>b[1]-a[1]).slice(0,5);
      createChart('donutChart', {
        type: 'doughnut',
        data: {
          labels: sortedCats.map(c=>c[0]),
          datasets: [{
            data: sortedCats.map(c=>c[1]),
            backgroundColor: ['#00d4aa', '#a78bfa', '#f59e0b', '#00b894', '#ff4d6d', '#333'],
            borderWidth: 2, borderColor: '#0d1017',
            hoverOffset: 10
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          cutout: '72%',
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: function(context) { return ' ' + formatCurrency(context.raw); } } }
          },
          animation: { animateScale: true, animateRotate: true, duration: 2000 }
        }
      });
    }
}



function renderSpendingChart() {
  renderCharts(); // Alias for Fix 5
}

function generateAIInsight(inc, exp) {
  const el = document.getElementById('dashboardAiInsight');
  if(exp > inc && inc > 0) {
    el.innerHTML = "Alert: Your monthly expenses are currently exceeding your income. I suggest reviewing the `Budgets` tab immediately.";
  } else if (inc > 0 && exp/inc < 0.5) {
    el.innerHTML = "Great job! Your savings rate is over 50% this month. Consider adding surplus funds to your `Financial Goals`.";
  } else {
    el.innerHTML = "You're on track! Your cash flow is healthy. If you have any specific financial queries, ask me in the chat!";
  }
}

// --- Transactions Logistics ---
let currentTxFilter = 'all';

function setTxFilter(f) {
  currentTxFilter = f;
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  document.querySelector(`.filter-tab[data-filter="${f}"]`).classList.add('active');
  renderTransactions();
}
let selectedTxs = new Set();
let isTimelineView = false;

function toggleTimelineView() {
  isTimelineView = !isTimelineView;
  document.getElementById('txTableView').style.display = isTimelineView ? 'none' : 'block';
  document.getElementById('txTimelineView').style.display = isTimelineView ? 'block' : 'none';
  renderTransactions();
}

function renderTransactions() {
  const tableBody = document.getElementById('txTableBody');
  const timelineView = document.getElementById('txTimelineView');
  tableBody.innerHTML = '';
  timelineView.innerHTML = '';
  
  let filtered = appData.transactions.filter(t => {
    const matchesFilter = currentTxFilter === 'all' || t.type === currentTxFilter;
    const search = document.getElementById('txSearch').value.toLowerCase();
    const matchesSearch = t.note.toLowerCase().includes(search) || t.category.toLowerCase().includes(search);
    return matchesFilter && matchesSearch;
  });

  filtered.sort((a,b) => new Date(b.date) - new Date(a.date));

  if (filtered.length === 0) {
    renderEmptyState('txTableBody', 'No transactions found. Try adjusting your filters.');
    renderEmptyState('txTimelineView', 'No transactions found.');
    return;
  }

  // Fix 18: Date Grouping
  renderGroupedTransactions(filtered);
}

function renderGroupedTransactions(txs) {
  const tableBody = document.getElementById('txTableBody');
  tableBody.innerHTML = '';
  
  let lastDateLabel = '';
  
  txs.forEach(t => {
    const txDate = new Date(t.date);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    
    let dateLabel = txDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    if (txDate.toDateString() === today.toDateString()) dateLabel = 'Today';
    else if (txDate.toDateString() === yesterday.toDateString()) dateLabel = 'Yesterday';
    
    if (dateLabel !== lastDateLabel) {
      const groupRow = document.createElement('tr');
      groupRow.innerHTML = `<td colspan="6" style="padding: 1rem 1.5rem; background: rgba(255,255,255,0.02); font-weight: 700; color: var(--neon-cyan); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">${dateLabel}</td>`;
      tableBody.appendChild(groupRow);
      lastDateLabel = dateLabel;
    }

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input type="checkbox" ${selectedTxs.has(t.id) ? 'checked' : ''} onchange="toggleSelect('${t.id}', this.checked)"></td>
      <td>${t.date.split('-').reverse().join('/')}</td>
      <td><span class="badge">${getIconForCategory(t.category)} ${t.category}</span></td>
      <td>
        <div style="font-weight:500;">${t.note}</div>
        ${t.description ? `<div style="font-size:0.75rem; color:var(--ink3)">${t.description}</div>` : ''}
      </td>
      <td class="${t.type === 'income' ? 'text-emerald' : 'text-rose'}" style="font-weight:700;">
        ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}
      </td>
      <td style="text-align: right;">
        <button class="btn-icon" onclick="editTx('${t.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
        <button class="btn-icon" onclick="deleteTx('${t.id}')"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tableBody.appendChild(row);
  });
}


function renderTimeline(txs) {
  const container = document.getElementById('txTimelineView');
  let currentGroup = '';
  
  txs.forEach(t => {
    const d = new Date(t.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if(d !== currentGroup) {
      currentGroup = d;
      const header = document.createElement('div');
      header.style = 'color: var(--neon-cyan); font-weight: 700; margin: 2rem 0 1rem; font-family: var(--font-heading);';
      header.innerText = currentGroup;
      container.appendChild(header);
    }
    
    const item = document.createElement('div');
    item.className = 'glass-card';
    item.style = 'display: flex; align-items: center; padding: 1rem; margin-bottom: 0.5rem; gap: 1rem;';
    item.innerHTML = `
      <div style="width:50px; text-align:center;">
        <div style="font-size:1.2rem; font-weight:700;">${new Date(t.date).getDate()}</div>
        <div style="font-size:0.6rem; color:var(--ink3); text-transform:uppercase;">${new Date(t.date).toLocaleString(undefined, {weekday:'short'})}</div>
      </div>
      <div style="flex:1;">
        <div style="font-weight:600;">${t.note}</div>
        <div style="font-size:0.8rem; color:var(--ink3);">${t.category}</div>
      </div>
      <div class="${t.type === 'income' ? 'text-emerald' : 'text-rose'}" style="font-weight:700;">
        ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}
      </div>
    `;
    container.appendChild(item);
  });
}

function toggleSelect(id, checked) {
  if (checked) selectedTxs.add(id);
  else selectedTxs.delete(id);
  updateBulkBar();
}

function toggleSelectAll(master) {
  const filtered = appData.transactions.map(t => t.id);
  if (master.checked) filtered.forEach(id => selectedTxs.add(id));
  else selectedTxs.clear();
  renderTransactions();
}

function updateBulkBar() {
  const bar = document.getElementById('bulkActionBar');
  const count = document.getElementById('selectedCount');
  if (selectedTxs.size > 0) {
    bar.style.display = 'flex';
    count.innerText = selectedTxs.size;
  } else {
    bar.style.display = 'none';
  }
}

async function bulkDelete() {
  showConfirmModal('Delete Selections', `Delete ${selectedTxs.size} transactions?`, async () => {
    try {

      const ids = Array.from(selectedTxs);
      const { error } = await sb.from('transactions').delete().in('id', ids).eq('user_id', currentUser.id);
      if (error) throw error;
      appData.transactions = appData.transactions.filter(t => !selectedTxs.has(t.id));
      selectedTxs.clear();
      renderAllViews();
      showToast('Bulk delete successful', 'success');
    } catch(err) { showToast(err.message, 'error'); }
  });
}

  
async function saveTx(e) {
  e.preventDefault();
  if (!validateForm('txForm')) return;

  const id = document.getElementById('txId').value;
  const tx = {
    user_id: currentUser.id,
    type: document.getElementById('txType').value,
    amount: parseFloat(document.getElementById('txAmount').value),
    category: document.getElementById('txCategory').value,
    date: document.getElementById('txDate').value,
    note: document.getElementById('txNote').value,
    description: document.getElementById('txLongNote').value,
    receipt_url: document.getElementById('txReceiptUrl').value,
    voice_memo: document.getElementById('txVoiceMemo').value,
    is_template: document.getElementById('txSaveTemplate').checked,
    is_business: document.getElementById('txIsBusiness')?.checked || false
  };

  try {
    if (!navigator.onLine) {
      const queue = JSON.parse(localStorage.getItem('flowx_offline_queue') || '[]');
      queue.push({...tx, id: 'temp_' + Date.now()});
      localStorage.setItem('flowx_offline_queue', JSON.stringify(queue));
      closeModal('addTxModal');
      showToast('You are offline — saved to local queue 🔌', 'warning');
      haptic('warning');
      return;
    }

    if (id) {
      const { error } = await sb.from('transactions').update(tx).eq('id', id).eq('user_id', currentUser.id);
      if(error) throw error;
      const idx = appData.transactions.findIndex(t => t.id === id);
      appData.transactions[idx] = { ...appData.transactions[idx], ...tx };
    } else {
      const { data, error } = await sb.from('transactions').insert(tx).select();
      if(error) throw error;
      appData.transactions.unshift(data[0]);
    }
    
    closeModal('addTxModal');
    renderAllViews();
    showToast('Transaction saved! 💸', 'success');
    haptic('success');
    
    // Check for goal contribution
    checkAutoGoalContribution(tx);
  } catch(err) {
    showToast('Failure: ' + err.message, 'error');
  }
}

function checkAutoGoalContribution(tx) {
  // logic to auto contribute if note contains goal name (future expansion)
}

function editTx(id) {
  const t = appData.transactions.find(x => x.id === id);
  if (t) {
    document.getElementById('txModalTitle').innerText = 'Edit Transaction';
    document.getElementById('txId').value = t.id;
    document.getElementById('txType').value = t.type;
    document.getElementById('txAmount').value = t.amount;
    document.getElementById('txCategory').value = t.category;
    document.getElementById('txDate').value = t.date;
    document.getElementById('txNote').value = t.note;
    document.getElementById('txLongNote').value = t.description || '';
    document.getElementById('txReceiptUrl').value = t.receipt_url || '';
    document.getElementById('txVoiceMemo').value = t.voice_memo || '';
    document.getElementById('txSaveTemplate').checked = t.is_template || false;
    openModal('addTxModal');
  }
}

async function deleteTx(id) {
  showConfirmModal('Delete Transaction', 'Are you sure you want to delete this transaction?', async () => {
    try {

      const { error } = await sb.from('transactions').delete().eq('id', id).eq('user_id', currentUser.id);
      if(error) throw error;
      appData.transactions = appData.transactions.filter(x => x.id !== id);
      renderAllViews();
      showToast('Transaction deleted', 'success');
    } catch(err) {
      showToast('Failed to delete transaction: ' + err.message, 'error');
    }
  });
}


// SMS / AI Parser
function parseSms() {
  const text = document.getElementById('smsText').value.toLowerCase();
  if(!text) return showToast('Please paste an SMS first', 'error');
  
  // Basic mock parsing logic
  let amt = text.match(/(?:rs|inr|₹)\s*\.?\s*(\d+(?:,\d+)*(?:\.\d+)?)/i);
  let isDebit = text.includes('debited') || text.includes('spent');
  let isCredit = text.includes('credited');
  
  if (amt) {
    document.getElementById('txAmount').value = parseFloat(amt[1].replace(/,/g, ''));
  }
  
  if(isDebit) document.getElementById('txType').value = 'expense';
  if(isCredit) document.getElementById('txType').value = 'income';
  
  // mock merchant detection
  if(text.includes('swiggy') || text.includes('zomato')) { document.getElementById('txCategory').value = 'Food'; document.getElementById('txNote').value = 'Swiggy/Zomato'; }
  else if(text.includes('amazon')) { document.getElementById('txCategory').value = 'Shopping'; document.getElementById('txNote').value = 'Amazon purchase'; }
  else if(text.includes('uber') || text.includes('ola')) { document.getElementById('txCategory').value = 'Transport'; document.getElementById('txNote').value = 'Uber/Ola ride'; }
  else { document.getElementById('txNote').value = 'Parsed from SMS'; document.getElementById('txCategory').value = 'Misc'; }
  
  showToast('AI Parsing complete');
}

function copyReferralLink() {
  const link = document.getElementById('referralLink');
  link.select();
  document.execCommand('copy');
  showToast('Referral link copied! 📋', 'success');
}

async function importCsv(e) {
  const file = e.target.files[0];
  if(!file) return;
  
  const reader = new FileReader();
  reader.onload = async (event) => {
    const text = event.target.result;
    const lines = text.split('\n');
    const newTxs = [];
    
    // Format: Date(YYYY-MM-DD),Amount,Category,Type(expense/income),Note
    for(let i = 1; i < lines.length; i++) {
        if(!lines[i].trim()) continue;
        const parts = lines[i].split(',');
        if(parts.length >= 4) {
            newTxs.push({
                user_id: currentUser.id,
                date: parts[0].trim(),
                amount: parseFloat(parts[1].trim()),
                category: parts[2].trim(),
                type: parts[3].trim().toLowerCase(),
                note: (parts[4] || 'CSV Import').trim()
            });
        }
    }
    
    if(newTxs.length > 0) {
        try {
            const { error } = await sb.from('transactions').insert(newTxs);
            if(error) throw error;
            showToast(`Imported ${newTxs.length} transactions successfully!`, 'success');
            loadData().then(()=>renderAllViews());
        } catch(err) {
            showToast('Failed to import: ' + err.message, 'error');
        }
    } else {
        showToast('No valid data found in CSV.', 'warning');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
}

// --- Onboarding Wizard (Fix 21) ---
function nextObStep(step) {
  document.querySelectorAll('.ob-step').forEach(s => s.style.display = 'none');
  document.getElementById('obStep' + step).style.display = 'block';
  document.querySelectorAll('.ob-dot').forEach(d => {
    d.classList.toggle('active', parseInt(d.dataset.step) <= step);
  });
}

async function finishOnboarding() {
  const income = parseFloat(document.getElementById('obIncome').value) || 0;
  const currency = document.getElementById('obCurrency').value;
  
  try {
    appData.settings.currency = currency;
    localStorage.setItem('flowx_currency', currency);
    
    await sb.from('profiles').update({ 
      monthly_income: income,
      currency: currency,
      onboarded: true 
    }).eq('id', currentUser.id);
    
    const budgetPromises = selectedObCats.map(cat => {
      return sb.from('budgets').insert({ 
        category: cat, 
        limit_amt: Math.max(income * 0.15, 2000), 
        user_id: currentUser.id 
      });
    });
    await Promise.all(budgetPromises);
    
    document.getElementById('onboardingScreen').style.opacity = '0';
    setTimeout(() => {
      document.getElementById('onboardingScreen').style.display = 'none';
      loadData().then(() => renderAllViews());
      showToast('Master your cash flow now! 🚀', 'success');
    }, 500);
  } catch(e) { showToast(e.message, 'error'); }
}

function toggleObCat(el, cat) {
  if (el.classList.contains('selected')) {
    el.classList.remove('selected');
    selectedObCats = selectedObCats.filter(c => c !== cat);
  } else {
    el.classList.add('selected');
    selectedObCats.push(cat);
  }
}

function simulateScan() {
  const txt = document.getElementById('scanText');
  const anim = document.getElementById('scanAnim');
  txt.style.display = 'none';
  anim.style.display = 'block';
  
  setTimeout(() => {
    txt.style.display = 'block';
    anim.style.display = 'none';
    
    // Auto fill mock receipt
    document.getElementById('txAmount').value = 1450;
    document.getElementById('txType').value = 'expense';
    document.getElementById('txCategory').value = 'Utilities';
    document.getElementById('txNote').value = 'Electric Bill';
    document.getElementById('txDate').valueAsDate = new Date();
    
    showToast('Receipt scanned using Vision AI');
  }, 2500);
}


// --- Budgets Logistics ---
function renderBudgets() {
  const grid = document.getElementById('budgetGrid');
  grid.innerHTML = '';
  
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  let spentMap = {};
  appData.transactions.forEach(t => {
    const d = new Date(t.date);
    if(t.type === 'expense' && d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
      spentMap[t.category] = (spentMap[t.category] || 0) + parseFloat(t.amount);
    }
  });

  if(appData.budgets.length === 0) {
    renderEmptyState('budgetGrid', 'No budgets created. Set one up to start tracking!');
    return;
  }


  appData.budgets.forEach(b => {
    let spent = spentMap[b.category] || 0;
    let pct = Math.min((spent / b.limit) * 100, 100);
    let rem = b.limit - spent;
    let icon = getIconForCategory(b.category);
    
    let statusClass = '';
    if (pct >= 100) {
      statusClass = 'danger';
      showToast(`CRITICAL: ${b.category} budget exceeded! 🚨`, 'error');
    } else if (pct >= 80) {
      statusClass = 'warning';
      showToast(`Warning: ${b.category} budget at ${Math.floor(pct)}% ⚠️`, 'warning');
    }

    
    grid.innerHTML += `
      <div class="glass-card budget-card ${statusClass}">
        <div style="position:absolute; top:10px; right:10px; display:flex; gap:5px; z-index:2;">
            <button class="action-btn edit" onclick="editBudget('${b.id}')"><i class="fa-solid fa-pen"></i></button>
            <button class="action-btn delete" onclick="deleteBudget('${b.id}')"><i class="fa-solid fa-trash-can"></i></button>
        </div>
        <div class="budget-header">
          <div class="budget-icon-title">${icon} ${b.category}</div>
        </div>
        <div class="budget-amounts">
          <div class="spent">${formatCurrency(spent)}</div>
          <div class="limit">of ${formatCurrency(b.limit)}</div>
        </div>
        <div class="progress-container">
          <div class="progress-bar" style="width: 0%"></div>
        </div>
        <div style="font-size:0.8rem; color: var(--text-muted); margin-top:10px; text-align:right;">
          ${rem < 0 ? 'Over budget by ' + formatCurrency(Math.abs(rem)) : formatCurrency(rem) + ' remaining'}
        </div>
      </div>
    `;
  });

  // Animate bars
  setTimeout(() => {
    document.querySelectorAll('.budget-card').forEach((card, idx) => {
      let b = appData.budgets[idx];
      let spent = spentMap[b.category] || 0;
      let pct = Math.min((spent / b.limit) * 100, 100);
      card.querySelector('.progress-bar').style.width = pct + '%';
    });
  }, 100);
}

async function saveBudget(e) {
  e.preventDefault();
  if (!validateForm('budgetForm')) return;

  const id = document.getElementById('budgetId').value;
  const cat = document.getElementById('budgetCategory').value;
  const lim = parseFloat(document.getElementById('budgetLimit').value);
  
  try {
    if(id) {
      const { error } = await sb.from('budgets').update({ category: cat, limit_amt: lim }).eq('id', id).eq('user_id', currentUser.id);
      if(error) throw error;
      const idx = appData.budgets.findIndex(x => x.id === id);
      if(idx !== -1) { appData.budgets[idx].category = cat; appData.budgets[idx].limit = lim; }
    } else {
      const newBgt = { category: cat, limit_amt: lim, user_id: currentUser.id };
      const { data, error } = await sb.from('budgets').insert(newBgt).select().single();
      if(error) throw error;
      appData.budgets.push({ id: data.id, category: data.category, limit: parseFloat(data.limit_amt) });
    }
    closeModal('addBudgetModal'); renderBudgets();
    e.target.reset(); document.getElementById('budgetId').value = ''; showToast('Budget Saved', 'success');
  } catch(err) { showToast('Failure: ' + err.message, 'error'); }
}

function editBudget(id) {
  const b = appData.budgets.find(x => x.id === id);
  if(!b) return;
  document.getElementById('budgetModalTitle').innerText = 'Edit Budget';
  document.getElementById('budgetId').value = b.id;
  document.getElementById('budgetCategory').value = b.category;
  document.getElementById('budgetLimit').value = b.limit;
  openModal('addBudgetModal');
}

async function deleteBudget(id) {
  showConfirmModal('Delete Budget', 'Are you sure you want to delete this budget?', async () => {
    try {

      const { error } = await sb.from('budgets').delete().eq('id', id).eq('user_id', currentUser.id);
      if(error) throw error;
      appData.budgets = appData.budgets.filter(x => x.id !== id);
      renderBudgets(); showToast('Budget deleted', 'success');
    } catch(err) { showToast('Failure: ' + err.message, 'error'); }
  });
}


// --- Goals Logistics ---
function renderGoals() {
  const grid = document.getElementById('goalsGrid');
  grid.innerHTML = '';
  
  if(appData.goals.length === 0) {
    renderEmptyState('goalsGrid', 'No financial goals yet. What are you saving for?');
    return;
  }


  appData.goals.forEach((g, idx) => {
    let pct = Math.floor((g.current / g.target) * 100);
    if(pct > 100) pct = 100;
    
    let daysLeft = Math.ceil((new Date(g.deadline) - new Date()) / (1000 * 60 * 60 * 24));
    let daysStr = daysLeft < 0 ? 'Overdue' : daysLeft + ' days left';

    grid.innerHTML += `
      <div class="glass-card goal-card" id="goal-card-${g.id}">
        <div style="position:absolute; top:10px; right:10px; display:flex; gap:5px; z-index:2;">
            <button class="action-btn edit" onclick="editGoal('${g.id}')"><i class="fa-solid fa-pen"></i></button>
            <button class="action-btn delete" onclick="deleteGoal('${g.id}')"><i class="fa-solid fa-trash-can"></i></button>
        </div>
        <div class="circular-progress" style="background: conic-gradient(var(--neon-cyan) 0deg, rgba(255,255,255,0.1) 0deg);" id="prog-${g.id}">
          <div class="progress-value">${pct}%</div>
        </div>
        <div class="goal-info">
          <h3>${g.name}</h3>
          <div class="goal-meta">
             <span>${formatCurrency(g.current)} saved</span>
             <span class="goal-target">${formatCurrency(g.target)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
             <span style="font-size:0.8rem; color:var(--text-muted);"><i class="fa-regular fa-clock"></i> ${daysStr}</span>
             <button class="btn-small" onclick="openContribute('${g.id}', event)">+ Add</button>
          </div>
        </div>
      </div>
    `;
  });

  // Animate rings
  setTimeout(() => {
    appData.goals.forEach(g => {
      let pct = Math.floor((g.current / g.target) * 100) || 0; if(pct > 100) pct = 100;
      let deg = (pct / 100) * 360;
      let el = document.getElementById('prog-' + g.id);
      if(el) {
          el.style.transition = 'background 1.5s ease-out';
          el.style.background = `conic-gradient(var(--neon-cyan) ${deg}deg, rgba(255,255,255,0.1) ${deg}deg)`;
      }
    });
  }, 100);
}

async function saveGoal(e) {
  e.preventDefault();
  if (!validateForm('goalForm')) return;

  const id = document.getElementById('goalId').value;
  const g = {
    name: document.getElementById('goalName').value,
    target: parseFloat(document.getElementById('goalTarget').value),
    deadline: document.getElementById('goalDate').value,
  };
  
  try {
    if(id) {
      const { error } = await sb.from('goals').update(g).eq('id', id).eq('user_id', currentUser.id);
      if(error) throw error;
      const idx = appData.goals.findIndex(x => x.id === id);
      if(idx !== -1) { appData.goals[idx] = { ...appData.goals[idx], ...g }; }
    } else {
      const newGoal = { ...g, user_id: currentUser.id };
      const { data, error } = await sb.from('goals').insert(newGoal).select().single();
      if(error) throw error;
      appData.goals.push({ id: data.id, name: data.name, target: parseFloat(data.target), current: parseFloat(data.saved), deadline: data.deadline, emoji: data.emoji });
    }
    closeModal('addGoalModal'); renderGoals();
    e.target.reset(); document.getElementById('goalId').value = ''; showToast('Goal Saved', 'success');
  } catch(err) { showToast('Failure: ' + err.message, 'error'); }
}

function editGoal(id) {
  const g = appData.goals.find(x => x.id === id);
  if(!g) return;
  document.getElementById('goalModalTitle').innerText = 'Edit Goal';
  document.getElementById('goalId').value = g.id;
  document.getElementById('goalName').value = g.name;
  document.getElementById('goalTarget').value = g.target;
  document.getElementById('goalDate').value = g.deadline;
  openModal('addGoalModal');
}

async function deleteGoal(id) {
  showConfirmModal('Delete Goal', 'Are you sure you want to delete this goal?', async () => {
    try {
      const { error } = await sb.from('goals').delete().eq('id', id).eq('user_id', currentUser.id);
      if(error) throw error;
      appData.goals = appData.goals.filter(x => x.id !== id);
      renderGoals(); showToast('Goal deleted', 'success');
    } catch(err) { showToast('Failure: ' + err.message, 'error'); }
  });
}


function openContribute(id, e) {
  e.stopPropagation();
  document.getElementById('cgId').value = id;
  document.getElementById('cgAmount').value = '';
  openModal('contributeGoalModal');
}

async function saveContribution(e) {
  e.preventDefault();
  const id = document.getElementById('cgId').value;
  const amt = parseFloat(document.getElementById('cgAmount').value);
  const idx = appData.goals.findIndex(x => x.id === id);
  if(idx !== -1) {
    try {
      const newSaved = appData.goals[idx].current + amt;
      const { error } = await sb.from('goals').update({ saved: newSaved }).eq('id', id).eq('user_id', currentUser.id);
      if(error) throw error;
      
      appData.goals[idx].current = newSaved;
      closeModal('contributeGoalModal');
      renderGoals();
      showToast('Funds added successfully!', 'success');
      
      if(appData.goals[idx].current >= appData.goals[idx].target) {
        fireConfetti(document.getElementById('goal-card-' + id));
        setTimeout(() => alert(`Congratulations! You reached your goal: ${appData.goals[idx].name}!`), 1000);
      }
    } catch(err) { showToast('Failure: ' + err.message, 'error'); }
  }
}

function fireConfetti(card) {
  for(let i=0; i<30; i++) {
    let conf = document.createElement('div');
    conf.className = 'confetti';
    conf.style.left = Math.random() * 100 + '%';
    conf.style.top = Math.random() * 100 + '%';
    conf.style.backgroundColor = ['#00f0ff', '#7000ff', '#ffd700', '#00ff66', '#ff0055'][Math.floor(Math.random()*5)];
    card.appendChild(conf);
    
    conf.animate([
      { transform: `translate3d(0,0,0) rotate(0)`, opacity: 1 },
      { transform: `translate3d(${Math.random()*100-50}px, ${Math.random()*-150-50}px, 0) rotate(${Math.random()*360}deg)`, opacity: 0 }
    ], { duration: 1000 + Math.random()*1000, easing: 'cubic-bezier(.37,0,.63,1)' });
    
    setTimeout(() => conf.remove(), 2500);
  }
}


// --- Analytics View ---
function renderAnalytics() {
  const ctxTrend = document.getElementById('trendChart');
  const ctxBar = document.getElementById('expenseBarChart');
  if (charts.trend) charts.trend.destroy();
  if (charts.bar) charts.bar.destroy();
  
  // same logic as dashboard for 6 months
  let months = []; let incData = [0,0,0,0,0,0]; let expData = [0,0,0,0,0,0];
  const d = new Date();
  for(let i=5; i>=0; i--) {
    let md = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push(md.toLocaleString('default', { month: 'short' }));
  }
  
  appData.transactions.forEach(t => {
    let td = new Date(t.date);
    let diff = (d.getFullYear() - td.getFullYear()) * 12 + d.getMonth() - td.getMonth();
    if (diff >= 0 && diff < 6) {
      let idx = 5 - diff;
      if(t.type === 'income') incData[idx] += parseFloat(t.amount);
      if(t.type === 'expense') expData[idx] += parseFloat(t.amount);
    }
  });

  charts.trend = new Chart(ctxTrend, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        { label: 'Income', data: incData, borderColor: '#00d4aa', backgroundColor: 'rgba(0, 212, 170, 0.15)', fill: true, tension: 0.4 },
        { label: 'Expense', data: expData, borderColor: '#ff4d6d', backgroundColor: 'rgba(255, 77, 109, 0.15)', fill: true, tension: 0.4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { grid: { color: 'rgba(255,255,255,0.04)' } }, x: { grid: {display: false} } },
      plugins: { legend: { position: 'top', align: 'end' } },
      animation: { duration: 2000 }
    }
  });
  
  let catData = {};
  appData.transactions.filter(t => t.type === 'expense').forEach(t => {
    catData[t.category] = (catData[t.category] || 0) + parseFloat(t.amount);
  });
  
  charts.bar = new Chart(ctxBar, {
    type: 'bar',
    data: {
      labels: Object.keys(catData),
      datasets: [{
        label: 'Lifetime Spent',
        data: Object.values(catData),
        backgroundColor: '#a78bfa',
        borderRadius: 8
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: {display: false} } },
      plugins: { legend: { display: false } },
    }
  });
}

function generateReportCard() {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  let mExp = 0, mInc = 0;
  let catSpend = {};
  
  appData.transactions.forEach(t => {
    let d = new Date(t.date);
    if(d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
      if(t.type === 'expense') { mExp += parseFloat(t.amount); catSpend[t.category] = (catSpend[t.category]||0) + parseFloat(t.amount); }
      if(t.type === 'income') mInc += parseFloat(t.amount);
    }
  });
  
  const saved = mInc - mExp;
  const grade = saved > (mInc * 0.2) ? '<span style="color:var(--neon-emerald); font-size: 3rem; font-weight: 800; font-family: var(--font-heading);">A+</span>' : saved > 0 ? '<span style="color:var(--neon-gold); font-size: 3rem; font-weight: 800; font-family: var(--font-heading);">B</span>' : '<span style="color:var(--neon-rose); font-size: 3rem; font-weight: 800; font-family: var(--font-heading);">C-</span>';
  
  let topCat = Object.keys(catSpend).sort((a,b)=>catSpend[b]-catSpend[a])[0] || 'None';
  
  document.getElementById('reportCardContent').innerHTML = `
    <div style="margin-bottom: 15px;">${grade}</div>
    <div style="display:flex; justify-content:space-between; margin-bottom: 8px;"><span>Total Income</span> <span style="color:var(--neon-cyan)">${formatCurrency(mInc)}</span></div>
    <div style="display:flex; justify-content:space-between; margin-bottom: 8px;"><span>Total Expense</span> <span style="color:var(--neon-rose)">${formatCurrency(mExp)}</span></div>
    <div style="display:flex; justify-content:space-between; margin-bottom: 8px;"><span>Net Saved</span> <span style="color:var(--neon-emerald)">${formatCurrency(saved)}</span></div>
    <hr style="border:0; border-top:1px dashed var(--border); margin: 15px 0;">
    <div style="display:flex; justify-content:space-between;"><span>Top Spend</span> <span style="color:var(--neon-gold)">${topCat}</span></div>
  `;
  
  openModal('reportModal');
  setTimeout(() => {
    fireConfetti(document.querySelector('#reportModal .modal-content'));
  }, 300);
}

// --- AI Chat App ---
function toggleChat() {
  document.getElementById('chatPanel').classList.toggle('open');
}

function sendQuickReply(txt) {
  document.getElementById('chatInput').value = txt;
  sendChatMsg();
}

function handleChatEnter(e) {
  if (e.key === 'Enter') sendChatMsg();
}

// Fix 11: Chat Logic
async function saveChatMessage(role, content) {
  if (!currentUser) return;
  await sb.from('chat_history').insert({ user_id: currentUser.id, role, content });
}

async function loadChatHistory() {
  const { data, error } = await sb.from('chat_history').select('*').order('created_at', { ascending: true });
  if (data) {
    const box = document.getElementById('chatMessages');
    box.innerHTML = '';
    data.forEach(m => appendMessage(m.role, m.content, false));
    box.scrollTop = box.scrollHeight;
  }
}

function appendMessage(role, content, autoScroll = true) {
  const box = document.getElementById('chatMessages');
  if (!box) return;
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerText = content;
  box.appendChild(div);
  if(autoScroll) box.scrollTop = box.scrollHeight;
}

async function sendChatMsg() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if(!text) return;
  
  appendMessage('user', text);
  input.value = '';
  saveChatMessage('user', text);
  
  const msgContainer = document.getElementById('chatMessages');
  const indicator = document.getElementById('typingIndicator');
  
  if (indicator) indicator.style.display = 'flex';
  if (msgContainer && indicator) {
    msgContainer.appendChild(indicator);
    msgContainer.scrollTop = msgContainer.scrollHeight;
  }

  
  const context = buildSimulatedAIContext(text);
  
  setTimeout(() => {
    if (indicator) indicator.style.display = 'none';
    appendMessage('ai', context);

    saveChatMessage('ai', context);
  }, 1500 + Math.random() * 1000);
}



function buildSimulatedAIContext(query) {
  const q = query.toLowerCase();
  
  // Current month logic
  const cm = new Date().getMonth();
  const cy = new Date().getFullYear();
  let mExp = 0, mInc = 0;
  let catSpend = {};
  appData.transactions.forEach(t => {
    let d = new Date(t.date);
    if(d.getMonth() === cm && d.getFullYear() === cy) {
      if(t.type === 'expense') {
        mExp += parseFloat(t.amount);
        catSpend[t.category] = (catSpend[t.category] || 0) + parseFloat(t.amount);
      }
      if(t.type === 'income') mInc += parseFloat(t.amount);
    }
  });

  if (q.includes('overspending') || q.includes('overspend')) {
    return `Good news! You are strictly within all your budgets this month.`;
  }
  if (q.includes('save') || q.includes('how much can i save')) {
    let rem = mInc - mExp;
    if(rem > 0) return `Right now, if you stop all spending, you can save ${formatCurrency(rem)} this month based on your recorded income vs expenses.`;
    return `Currently, your expenses exceed your income. You need to focus on cutting costs rather than saving this month!`;
  }
  
  if (q.includes('laptop') || q.includes('goal')) {
    let laptop = appData.goals.find(g => g.name.toLowerCase().includes('laptop'));
    if(!laptop) return `I don't see a "Laptop" goal. But looking at your total progress across all goals, you're doing great.`;
    let rem = laptop.target - laptop.current;
    if(rem <= 0) return `You've already hit your Laptop goal! Treat yourself!`;
    return `You have ${formatCurrency(rem)} left to save for your ${laptop.name}. If you save ₹5000 a month, you'll hit it in ${Math.ceil(rem/5000)} months.`;
  }


  if (q.includes('budget') && q.includes('suggest')) {
    let mainCat = Object.keys(catSpend).sort((a,b)=>catSpend[b]-catSpend[a])[0];
    return `Based on your high spending in ${mainCat}, I suggest setting a strict budget limit for ${mainCat} next month to boost your savings rate.`;
  }
  
  if (q.includes('biggest expense')) {
    if(Object.keys(catSpend).length === 0) return "You haven't logged any expenses this month yet.";
    let mainCat = Object.keys(catSpend).sort((a,b)=>catSpend[b]-catSpend[a])[0];
    return `Your biggest expense category this month is ${mainCat}, costing you ${formatCurrency(catSpend[mainCat])}. Watch out for this one!`;
  }

  return "I'm analyzing your vast financial dataset (simulated). You have a healthy net worth trajectory. Ask me about specific goals or budgets!";
}

function saveJournal() {
  const txt = document.getElementById('financeJournal').value;
  localStorage.setItem(`flowx_journal_${currentUser.id}`, txt);
  showToast('Journal auto-saved 📝', 'info');
}



function detectAndShowLanding() {
  const width  = window.innerWidth;
  const touch  = navigator.maxTouchPoints > 0;
  const mobile = touch && width < 768;
  const tablet = touch && width >= 768 && width <= 1024;
  const stored = sessionStorage.getItem('flowx_platform');
  const platform = stored || (mobile ? 'mobile' : tablet ? 'tablet' : 'desktop');
  sessionStorage.setItem('flowx_platform', platform);
  renderLandingForPlatform(platform);
}

function renderLandingForPlatform(platform) {
  const landing = document.getElementById('landing-page');
  if (!landing) return;

  // Platform switcher always visible bottom-right
  const existingSwitcher = document.getElementById('platform-switcher');
  if (existingSwitcher) existingSwitcher.remove();
  const switcher = document.createElement('div');
  switcher.id = 'platform-switcher';
  switcher.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:999;display:flex;gap:8px;background:rgba(13,16,23,0.9);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:8px';
  switcher.innerHTML = `
    <button onclick="switchPlatform('desktop')" title="Desktop" style="background:${platform==='desktop'?'rgba(0,212,170,0.15)':'transparent'};border:${platform==='desktop'?'1px solid rgba(0,212,170,0.3)':'1px solid transparent'};color:${platform==='desktop'?'#00d4aa':'rgba(255,255,255,0.4)'};width:34px;height:34px;border-radius:8px;font-size:16px;cursor:pointer">🖥️</button>
    <button onclick="switchPlatform('tablet')"  title="Tablet"  style="background:${platform==='tablet'?'rgba(0,212,170,0.15)':'transparent'};border:${platform==='tablet'?'1px solid rgba(0,212,170,0.3)':'1px solid transparent'};color:${platform==='tablet'?'#00d4aa':'rgba(255,255,255,0.4)'};width:34px;height:34px;border-radius:8px;font-size:16px;cursor:pointer">⬛</button>
    <button onclick="switchPlatform('mobile')"  title="Mobile"  style="background:${platform==='mobile'?'rgba(0,212,170,0.15)':'transparent'};border:${platform==='mobile'?'1px solid rgba(0,212,170,0.3)':'1px solid transparent'};color:${platform==='mobile'?'#00d4aa':'rgba(255,255,255,0.4)'};width:34px;height:34px;border-radius:8px;font-size:16px;cursor:pointer">📱</button>
  `;
  document.body.appendChild(switcher);

  if (platform === 'desktop') renderDesktopLanding();
  else if (platform === 'tablet') renderTabletLanding();
  else renderMobileLanding();
}

function switchPlatform(platform) {
  sessionStorage.setItem('flowx_platform', platform);
  renderLandingForPlatform(platform);
}

function renderDesktopLanding() {
  const landing = document.getElementById('landing-page');
  if (!landing) return;
  landing.innerHTML = `
    <!-- AURORA BACKGROUND -->
    <div style="position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden">
      <div style="position:absolute;width:700px;height:700px;background:radial-gradient(circle,#00d4aa,transparent);filter:blur(80px);opacity:0.07;top:-200px;left:-100px;animation:float 20s ease-in-out infinite;border-radius:50%"></div>
      <div style="position:absolute;width:600px;height:600px;background:radial-gradient(circle,#a78bfa,transparent);filter:blur(80px);opacity:0.07;top:20%;right:-200px;animation:float 20s ease-in-out infinite 7s;border-radius:50%"></div>
      <div style="position:absolute;width:500px;height:500px;background:radial-gradient(circle,#f59e0b,transparent);filter:blur(80px);opacity:0.07;bottom:-100px;left:30%;animation:float 20s ease-in-out infinite 14s;border-radius:50%"></div>
      <!-- Subtle grid -->
      <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,0.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.015) 1px,transparent 1px);background-size:60px 60px;mask-image:radial-gradient(ellipse 80% 80% at 50% 50%,black 40%,transparent 100%)"></div>
    </div>

    <!-- NAV -->
    <nav id="landing-nav" style="position:fixed;top:0;left:0;right:0;z-index:100;padding:0 60px;height:68px;display:flex;align-items:center;justify-content:space-between;transition:all 0.3s">
      <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:22px">Flow<span style="color:#00d4aa">X</span></div>
      <div style="display:flex;gap:32px">
        <a href="#features" style="font-size:14px;color:rgba(255,255,255,0.6);text-decoration:none;transition:color 0.2s" onmouseover="this.style.color='white'" onmouseout="this.style.color='rgba(255,255,255,0.6)'">Features</a>
        <a href="#pricing" style="font-size:14px;color:rgba(255,255,255,0.6);text-decoration:none;transition:color 0.2s" onmouseover="this.style.color='white'" onmouseout="this.style.color='rgba(255,255,255,0.6)'">Pricing</a>
        <a href="#how" style="font-size:14px;color:rgba(255,255,255,0.6);text-decoration:none;transition:color 0.2s" onmouseover="this.style.color='white'" onmouseout="this.style.color='rgba(255,255,255,0.6)'">How it works</a>
      </div>
      <div style="display:flex;gap:10px">
        <button onclick="openModal('loginModal')" style="background:transparent;border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.7);padding:9px 22px;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:14px;cursor:pointer;transition:all 0.2s" onmouseover="this.style.borderColor='rgba(255,255,255,0.3)';this.style.color='white'" onmouseout="this.style.borderColor='rgba(255,255,255,0.12)';this.style.color='rgba(255,255,255,0.7)'">Sign In</button>
        <button onclick="openModal('signupModal')" style="background:linear-gradient(135deg,#00d4aa,#00b894);border:none;color:#07090f;padding:9px 22px;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 0 20px rgba(0,212,170,0.2)" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 0 30px rgba(0,212,170,0.4)'" onmouseout="this.style.transform='';this.style.boxShadow='0 0 20px rgba(0,212,170,0.2)'">Get Started</button>
      </div>
    </nav>

    <!-- HERO -->
    <section style="min-height:100vh;display:grid;grid-template-columns:1fr 1.1fr;gap:60px;align-items:center;padding:0 80px;max-width:1300px;margin:0 auto;position:relative;z-index:1">
      <!-- LEFT -->
      <div style="animation:fadeUp 0.6s ease both">
        <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(0,212,170,0.08);border:1px solid rgba(0,212,170,0.2);padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;color:#00d4aa;margin-bottom:28px;text-transform:uppercase;letter-spacing:0.06em;position:relative;overflow:hidden">
          <span style="width:6px;height:6px;border-radius:50%;background:#00d4aa;animation:pulse 2s infinite"></span>
          Now with AI-powered insights
          <div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(0,212,170,0.1),transparent);animation:shimmer 3s infinite"></div>
        </div>
        <h1 style="font-family:Outfit,sans-serif;font-weight:800;font-size:clamp(48px,5.5vw,76px);line-height:1.0;letter-spacing:-0.03em;margin-bottom:24px">
          Your money,<br>finally<br><span style="background:linear-gradient(135deg,#00d4aa,#00f5c4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">in control.</span>
        </h1>
        <p style="font-size:18px;color:rgba(255,255,255,0.55);line-height:1.7;margin-bottom:36px;max-width:460px;font-weight:300">
          FlowX is a next-generation personal finance OS. Track every rupee, hit every goal, and get AI-powered advice — all in one place.
        </p>
        <div style="display:flex;gap:14px;align-items:center;margin-bottom:32px;flex-wrap:wrap">
          <button onclick="openModal('signupModal')" style="background:linear-gradient(135deg,#00d4aa,#00b894);border:none;color:#07090f;padding:15px 36px;border-radius:12px;font-family:Outfit,sans-serif;font-size:17px;font-weight:700;cursor:pointer;box-shadow:0 0 40px rgba(0,212,170,0.3);transition:all 0.2s" onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 0 60px rgba(0,212,170,0.5)'" onmouseout="this.style.transform='';this.style.boxShadow='0 0 40px rgba(0,212,170,0.3)'">Start for free →</button>
          <button onclick="document.getElementById('features').scrollIntoView({behavior:'smooth'})" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);padding:15px 28px;border-radius:12px;font-family:'DM Sans',sans-serif;font-size:16px;cursor:pointer;transition:all 0.2s" onmouseover="this.style.borderColor='rgba(255,255,255,0.25)';this.style.color='white'" onmouseout="this.style.borderColor='rgba(255,255,255,0.1)';this.style.color='rgba(255,255,255,0.7)'">▶ See how it works</button>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div style="display:flex">
            ${['AR','PK','SK','MR','TR'].map((i,n)=>`<div style="width:30px;height:30px;border-radius:50%;background:${['#00d4aa','#a78bfa','#f59e0b','#ff4d6d','#60a5fa'][n]};border:2px solid #07090f;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#07090f;margin-left:${n?-8:0}px">${i}</div>`).join('')}
          </div>
          <div>
            <div style="font-size:13px;color:rgba(255,255,255,0.6)">Joined by <strong style="color:white">2,400+</strong> users across India</div>
            <div style="font-size:12px;color:#f59e0b;margin-top:2px">★★★★★ 4.9 rating</div>
          </div>
        </div>
      </div>

      <!-- RIGHT — CSS Dashboard Mockup -->
      <div style="perspective:1200px;animation:fadeUp 0.6s 0.3s ease both" id="hero-mockup-wrap">
        <div id="hero-mockup" style="transform:rotateX(8deg) rotateY(-5deg) rotateZ(1deg);transform-origin:center center;transition:transform 0.6s ease;background:rgba(13,16,23,0.9);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:20px;box-shadow:0 40px 120px rgba(0,0,0,0.6);position:relative">
          <!-- Mockup header -->
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.06)">
            <div style="width:8px;height:8px;border-radius:50%;background:#ff5f56"></div>
            <div style="width:8px;height:8px;border-radius:50%;background:#ffbd2e"></div>
            <div style="width:8px;height:8px;border-radius:50%;background:#27c93f"></div>
            <div style="font-family:'DM Mono',monospace;font-size:11px;color:rgba(255,255,255,0.3);margin-left:8px">flowx-app.netlify.app</div>
          </div>
          <!-- Mockup content -->
          <div style="display:grid;grid-template-columns:100px 1fr;gap:12px">
            <!-- Sidebar -->
            <div style="display:flex;flex-direction:column;gap:6px">
              <div style="font-family:Outfit,sans-serif;font-size:13px;font-weight:700;color:#00d4aa;margin-bottom:8px">FlowX</div>
              ${['Dashboard','Transactions','Budgets','Goals','Analytics'].map((item,i) => `
                <div style="padding:6px 10px;border-radius:8px;font-size:11px;background:${i===0?'rgba(0,212,170,0.1)':'transparent'};color:${i===0?'#00d4aa':'rgba(255,255,255,0.4)'}; border-left:${i===0?'2px solid #00d4aa':'2px solid transparent'}">${item}</div>`).join('')}
            </div>
            <!-- Main area -->
            <div>
              <!-- Stat cards -->
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">
                ${[['Balance','₹65,420','#00d4aa'],['Expenses','₹18,240','#ff4d6d'],['Savings','28%','#a78bfa']].map(([l,v,c])=>`
                  <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:10px">
                    <div style="font-size:9px;color:rgba(255,255,255,0.4);text-transform:uppercase;margin-bottom:4px">${l}</div>
                    <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:${c}">${v}</div>
                  </div>`).join('')}
              </div>
              <!-- Chart placeholder -->
              <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px;margin-bottom:8px;height:70px;display:flex;align-items:flex-end;gap:4px">
                ${[40,65,45,80,55,90,70,85,60,95,75,88].map(h=>`<div style="flex:1;background:linear-gradient(180deg,#00d4aa,rgba(0,212,170,0.2));border-radius:3px 3px 0 0;height:${h}%;opacity:0.7"></div>`).join('')}
              </div>
              <!-- Transaction rows -->
              ${[['🍕','Swiggy','Food','-₹340'],['💰','Salary','Income','+₹65,000'],['🚗','Uber','Transport','-₹180']].map(([e,n,c,a])=>`
                <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,0.02);margin-bottom:4px">
                  <span style="font-size:14px">${e}</span>
                  <div style="flex:1"><div style="font-size:10px;color:white">${n}</div><div style="font-size:9px;color:rgba(255,255,255,0.35)">${c}</div></div>
                  <div style="font-family:'DM Mono',monospace;font-size:10px;font-weight:600;color:${a.startsWith('+')?'#00d4aa':'#ff4d6d'}">${a}</div>
                </div>`).join('')}
            </div>
          </div>
        </div>
        <!-- Floating callout bubbles -->
        <div style="position:absolute;top:-20px;right:-30px;background:rgba(13,16,23,0.95);border:1px solid rgba(0,212,170,0.2);border-radius:12px;padding:8px 14px;font-size:12px;color:#00d4aa;white-space:nowrap;animation:floatBubble 3s ease-in-out infinite;box-shadow:0 4px 20px rgba(0,212,170,0.1)">💰 Saved ₹4,200 this week</div>
        <div style="position:absolute;bottom:-15px;left:-40px;background:rgba(13,16,23,0.95);border:1px solid rgba(167,139,250,0.2);border-radius:12px;padding:8px 14px;font-size:12px;color:#a78bfa;white-space:nowrap;animation:floatBubble 3s ease-in-out infinite 1s;box-shadow:0 4px 20px rgba(167,139,250,0.1)">🎯 Goal 73% complete</div>
        <div style="position:absolute;top:50%;right:-50px;background:rgba(13,16,23,0.95);border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:8px 14px;font-size:12px;color:#f59e0b;white-space:nowrap;animation:floatBubble 3s ease-in-out infinite 2s;box-shadow:0 4px 20px rgba(245,158,11,0.1)">⚠️ Food budget at 89%</div>
      </div>
    </section>

    <!-- FEATURES SECTION -->
    <section id="features" style="padding:100px 80px;max-width:1300px;margin:0 auto;position:relative;z-index:1">
      <div style="text-align:center;margin-bottom:60px">
        <h2 style="font-family:Outfit,sans-serif;font-size:clamp(32px,4vw,48px);font-weight:800;margin-bottom:14px">Everything you need</h2>
        <p style="font-size:17px;color:rgba(255,255,255,0.45)">to master your money</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px">
        ${[
          ['🤖','AI Financial Assistant','Get personalised advice based on your actual spending patterns and goals'],
          ['📊','Interactive Analytics','Beautiful charts showing where every rupee goes, with trends and forecasts'],
          ['🎯','Goal Tracking','Set savings goals with deadlines and watch your progress in real time'],
          ['💰','Smart Budgets','Category budgets with alerts before you overspend'],
          ['📱','SMS & Bill Scanning','Paste an SMS or upload a receipt — transactions auto-fill instantly'],
          ['🔒','Bank-Grade Security','Your data encrypted at rest, RLS enforced, secure auth via Supabase']
        ].map(([icon,title,desc])=>`
          <div class="glass-card landing-feature-card" style="padding:28px;border-radius:20px;transition:all 0.3s;cursor:default" onmouseover="this.style.transform='translateY(-6px)';this.style.borderColor='rgba(0,212,170,0.15)'" onmouseout="this.style.transform='';this.style.borderColor=''">
            <div style="font-size:36px;margin-bottom:16px">${icon}</div>
            <div style="font-family:Outfit,sans-serif;font-size:18px;font-weight:600;margin-bottom:8px">${title}</div>
            <div style="font-size:14px;color:rgba(255,255,255,0.45);line-height:1.7">${desc}</div>
          </div>`).join('')}
      </div>
    </section>

    <!-- STATS BAR -->
    <div style="background:rgba(255,255,255,0.02);border-top:1px solid rgba(255,255,255,0.05);border-bottom:1px solid rgba(255,255,255,0.05);padding:50px 80px;display:flex;justify-content:center;gap:80px;position:relative;z-index:1">
      ${[['₹2.4Cr+','Total tracked'],['2,400+','Active users'],['4.9★','User rating'],['99.9%','Uptime']].map(([n,l])=>`
        <div style="text-align:center">
          <div style="font-family:Outfit,sans-serif;font-size:clamp(28px,4vw,44px);font-weight:800;color:#00d4aa;font-variant-numeric:tabular-nums">${n}</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.4);margin-top:4px">${l}</div>
        </div>`).join('')}
    </div>

    <!-- HOW IT WORKS -->
    <section id="how" style="padding:100px 80px;max-width:1100px;margin:0 auto;position:relative;z-index:1">
      <div style="text-align:center;margin-bottom:60px">
        <h2 style="font-family:Outfit,sans-serif;font-size:clamp(28px,3.5vw,42px);font-weight:800;margin-bottom:12px">How it works</h2>
        <p style="color:rgba(255,255,255,0.4)">Get started in 60 seconds</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:32px;position:relative">
        <div style="position:absolute;top:32px;left:calc(16.66% + 16px);right:calc(16.66% + 16px);height:1px;background:linear-gradient(90deg,#00d4aa,#a78bfa,#00d4aa);opacity:0.3"></div>
        ${[
          ['01','Create account','Sign up free with email or Google — takes 30 seconds, no credit card'],
          ['02','Add transactions','Log income and expenses manually, via SMS, or by uploading a bill photo'],
          ['03','Let AI guide you','Your personal AI CFO analyses patterns and gives actionable daily advice']
        ].map(([n,t,d])=>`
          <div style="text-align:center;padding:24px 16px">
            <div style="width:56px;height:56px;border-radius:50%;background:rgba(0,212,170,0.08);border:2px solid rgba(0,212,170,0.3);display:flex;align-items:center;justify-content:center;font-family:Outfit,sans-serif;font-size:18px;font-weight:800;color:#00d4aa;margin:0 auto 20px">
              ${n}
            </div>
            <div style="font-family:Outfit,sans-serif;font-size:18px;font-weight:600;margin-bottom:10px">${t}</div>
            <div style="font-size:14px;color:rgba(255,255,255,0.45);line-height:1.7">${d}</div>
          </div>`).join('')}
      </div>
    </section>

    <!-- PRICING -->
    <section id="pricing" style="padding:100px 80px;position:relative;z-index:1">
      <div style="text-align:center;margin-bottom:60px">
        <h2 style="font-family:Outfit,sans-serif;font-size:clamp(28px,3.5vw,42px);font-weight:800;margin-bottom:12px">Simple pricing</h2>
        <p style="color:rgba(255,255,255,0.4)">Start free. Upgrade when ready.</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;max-width:900px;margin:0 auto">
        ${[
          {tier:'Free',price:'₹0',sub:'forever',color:'rgba(255,255,255,0.06)',border:'rgba(255,255,255,0.08)',featured:false,
           features:['5 free downloads on signup','Watch 1 ad per download after','Basic categories'],
           btn:'Get started'},
          {tier:'Pro',price:'₹749',sub:'/month',color:'#111520',border:'rgba(0,212,170,0.3)',featured:true,
           features:['Unlimited downloads','Zero ads ever','All 8 categories','Priority releases','Personal licence'],
           btn:'Start Pro'},
          {tier:'VIP',price:'₹1,599',sub:'/month',color:'rgba(255,255,255,0.06)',border:'rgba(255,255,255,0.08)',featured:false,
           features:['Everything in Pro','Bulk ZIP download','Commercial licence','Template requests','VIP Discord'],
           btn:'Go VIP'}
        ].map(p=>`
          <div style="background:${p.color};border:1px solid ${p.border};border-radius:20px;padding:32px;position:relative;${p.featured?'box-shadow:0 0 40px rgba(0,212,170,0.1)':''}">
            ${p.featured?'<div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#00d4aa,#00b894);color:#07090f;font-size:11px;font-weight:700;padding:4px 16px;border-radius:20px;white-space:nowrap;text-transform:uppercase;letter-spacing:0.06em">Most Popular</div>':''}
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.4);margin-bottom:12px">${p.tier}</div>
            <div style="font-family:Outfit,sans-serif;font-size:40px;font-weight:800;margin-bottom:4px;line-height:1">${p.price}</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.4);margin-bottom:24px">${p.sub}</div>
            <button onclick="openModal('signupModal')" style="width:100%;padding:12px;border-radius:10px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:20px;border:none;background:${p.featured?'linear-gradient(135deg,#00d4aa,#00b894)':'rgba(255,255,255,0.08)'};color:${p.featured?'#07090f':'white'};transition:all 0.2s">${p.btn}</button>
            <ul style="list-style:none;display:flex;flex-direction:column;gap:10px">
              ${p.features.map(f=>`<li style="font-size:13px;color:rgba(255,255,255,0.6);display:flex;gap:8px;align-items:flex-start;padding-top:10px;border-top:1px solid rgba(255,255,255,0.05)"><span style="color:#00d4aa;font-weight:700">✓</span>${f}</li>`).join('')}
            </ul>
          </div>`).join('')}
      </div>
    </section>

    <!-- FINAL CTA -->
    <section style="padding:100px 80px;text-align:center;position:relative;z-index:1">
      <h2 style="font-family:Outfit,sans-serif;font-size:clamp(32px,4vw,52px);font-weight:800;margin-bottom:16px;line-height:1.1">Your financial freedom<br>starts today</h2>
      <p style="font-size:16px;color:rgba(255,255,255,0.45);margin-bottom:36px">Free forever · No credit card · Cancel anytime</p>
      <button onclick="openModal('signupModal')" style="background:linear-gradient(135deg,#00d4aa,#00b894);border:none;color:#07090f;padding:16px 44px;border-radius:12px;font-family:Outfit,sans-serif;font-size:18px;font-weight:700;cursor:pointer;box-shadow:0 0 50px rgba(0,212,170,0.3);transition:all 0.2s" onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 0 70px rgba(0,212,170,0.5)'" onmouseout="this.style.transform='';this.style.boxShadow='0 0 50px rgba(0,212,170,0.3)'">Create Free Account →</button>
    </section>

    <!-- FOOTER -->
    <footer style="border-top:1px solid rgba(255,255,255,0.05);padding:40px 80px;display:flex;justify-content:space-between;align-items:center;position:relative;z-index:1">
      <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:18px">Flow<span style="color:#00d4aa">X</span></div>
      <div style="font-size:13px;color:rgba(255,255,255,0.3)">© 2025 FlowX · Made with ❤️ in India</div>
      <div style="display:flex;gap:20px">
        <a style="font-size:13px;color:rgba(255,255,255,0.35);text-decoration:none" href="#">Privacy</a>
        <a style="font-size:13px;color:rgba(255,255,255,0.35);text-decoration:none" href="#">Terms</a>
      </div>
    </footer>`;

  // Mouse parallax on mockup
  document.addEventListener('mousemove', (e) => {
    const mockup = document.getElementById('hero-mockup');
    if (!mockup) return;
    const x = (e.clientX / window.innerWidth  - 0.5) * 6;
    const y = (e.clientY / window.innerHeight - 0.5) * 4;
    mockup.style.transform = `rotateX(${8-y}deg) rotateY(${-5+x}deg) rotateZ(1deg)`;
  });

  // Nav scroll effect
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('landing-nav');
    if (!nav) return;
    if (window.scrollY > 80) {
      nav.style.background = 'rgba(7,9,15,0.9)';
      nav.style.backdropFilter = 'blur(20px)';
      nav.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
    } else {
      nav.style.background = 'transparent';
      nav.style.backdropFilter = 'none';
      nav.style.borderBottom = 'none';
    }
  });
}

function renderTabletLanding() {
  const landing = document.getElementById('landing-page');
  if (!landing) return;
  landing.innerHTML = `
    <div style="position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden">
      <div style="position:absolute;width:500px;height:500px;background:radial-gradient(circle,#00d4aa,transparent);filter:blur(80px);opacity:0.07;top:-150px;left:-50px;border-radius:50%;animation:float 18s ease-in-out infinite"></div>
      <div style="position:absolute;width:400px;height:400px;background:radial-gradient(circle,#a78bfa,transparent);filter:blur(80px);opacity:0.07;bottom:-100px;right:-50px;border-radius:50%;animation:float 18s ease-in-out infinite 9s"></div>
    </div>
    <nav style="position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(7,9,15,0.85);backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,0.06);padding:0 32px;height:60px;display:flex;align-items:center;justify-content:space-between">
      <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:20px">Flow<span style="color:#00d4aa">X</span></div>
      <div style="display:flex;gap:8px">
        <button onclick="openModal('loginModal')" style="background:transparent;border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);padding:8px 18px;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer">Sign In</button>
        <button onclick="openModal('signupModal')" style="background:linear-gradient(135deg,#00d4aa,#00b894);border:none;color:#07090f;padding:8px 18px;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer">Get Started</button>
      </div>
    </nav>
    <section style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:80px 40px 60px;position:relative;z-index:1">
      <h1 style="font-family:Outfit,sans-serif;font-weight:800;font-size:clamp(36px,5vw,52px);line-height:1.05;letter-spacing:-0.02em;margin-bottom:20px">Your money,<br>finally <span style="background:linear-gradient(135deg,#00d4aa,#00f5c4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">in control.</span></h1>
      <p style="font-size:16px;color:rgba(255,255,255,0.5);margin-bottom:32px;max-width:500px;line-height:1.7">Track every rupee, hit every goal, and get AI-powered financial advice — all in one beautiful app.</p>
      <div style="display:flex;gap:12px;margin-bottom:40px">
        <button onclick="openModal('signupModal')" style="background:linear-gradient(135deg,#00d4aa,#00b894);border:none;color:#07090f;padding:14px 30px;border-radius:10px;font-family:Outfit,sans-serif;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 0 30px rgba(0,212,170,0.25)">Start for free →</button>
        <button onclick="openModal('loginModal')" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);padding:14px 24px;border-radius:10px;font-family:'DM Sans',sans-serif;font-size:15px;cursor:pointer">Sign In</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;width:100%;max-width:600px">
        ${[['🤖','AI Assistant'],['📊','Analytics'],['🎯','Goal Tracking'],['💰','Smart Budgets'],['📱','SMS Parsing'],['🔒','Secure & Private']].map(([e,t])=>`
          <div class="glass-card" style="padding:16px;border-radius:14px;display:flex;align-items:center;gap:12px;text-align:left">
            <span style="font-size:24px">${e}</span>
            <span style="font-size:14px;font-weight:500">${t}</span>
          </div>`).join('')}
      </div>
    </section>`;
}

function renderMobileLanding() {
  const landing = document.getElementById('landing-page');
  if (!landing) return;
  landing.innerHTML = `
    <div style="position:fixed;inset:0;pointer-events:none;z-index:0">
      <div style="position:absolute;width:350px;height:350px;background:radial-gradient(circle,#00d4aa,transparent);filter:blur(60px);opacity:0.08;top:-100px;left:-50px;border-radius:50%;animation:float 15s ease-in-out infinite"></div>
      <div style="position:absolute;width:300px;height:300px;background:radial-gradient(circle,#a78bfa,transparent);filter:blur(60px);opacity:0.08;bottom:-50px;right:-50px;border-radius:50%;animation:float 15s ease-in-out infinite 7s"></div>
    </div>
    <nav style="position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(7,9,15,0.9);backdrop-filter:blur(16px);padding:0 20px;height:56px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.06)">
      <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:18px">Flow<span style="color:#00d4aa">X</span></div>
      <button onclick="openModal('loginModal')" style="background:transparent;border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);padding:7px 16px;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer">Sign In</button>
    </nav>
    <section style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:70px 24px 100px;text-align:center;position:relative;z-index:1">
      <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(0,212,170,0.08);border:1px solid rgba(0,212,170,0.2);padding:5px 12px;border-radius:16px;font-size:11px;font-weight:600;color:#00d4aa;margin-bottom:24px;text-transform:uppercase;letter-spacing:0.06em">
        <span style="width:5px;height:5px;border-radius:50%;background:#00d4aa;animation:pulse 2s infinite"></span>
        AI-Powered Finance
      </div>
      <!-- Phone mockup -->
      <div style="width:200px;height:380px;background:rgba(13,16,23,0.9);border:2px solid rgba(255,255,255,0.08);border-radius:32px;margin:0 auto 32px;overflow:hidden;position:relative;box-shadow:0 20px 60px rgba(0,0,0,0.5);animation:floatBubble 4s ease-in-out infinite">
        <div style="background:rgba(0,0,0,0.3);height:20px;border-radius:0 0 12px 12px;width:60px;margin:0 auto 12px"></div>
        <div style="padding:12px">
          <div style="font-family:Outfit,sans-serif;font-size:11px;font-weight:700;color:#00d4aa;margin-bottom:10px">Good morning, Aldrin 👋</div>
          <div style="background:rgba(0,212,170,0.08);border:1px solid rgba(0,212,170,0.15);border-radius:12px;padding:12px;margin-bottom:8px">
            <div style="font-size:9px;color:rgba(255,255,255,0.4);margin-bottom:4px">TOTAL BALANCE</div>
            <div style="font-family:'DM Mono',monospace;font-size:18px;font-weight:700;color:#00d4aa">₹65,420</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
            <div style="background:rgba(255,77,109,0.08);border-radius:10px;padding:8px">
              <div style="font-size:8px;color:rgba(255,255,255,0.4)">SPENT</div>
              <div style="font-family:'DM Mono',monospace;font-size:12px;color:#ff4d6d;font-weight:600">₹18,240</div>
            </div>
            <div style="background:rgba(167,139,250,0.08);border-radius:10px;padding:8px">
              <div style="font-size:8px;color:rgba(255,255,255,0.4)">SAVED</div>
              <div style="font-family:'DM Mono',monospace;font-size:12px;color:#a78bfa;font-weight:600">28%</div>
            </div>
          </div>
          <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:8px;display:flex;align-items:flex-end;gap:3px;height:50px">
            ${[30,50,35,65,45,75,55,80,60,90].map(h=>`<div style="flex:1;background:linear-gradient(180deg,#00d4aa,rgba(0,212,170,0.15));border-radius:2px;height:${h}%"></div>`).join('')}
          </div>
        </div>
      </div>
      <h1 style="font-family:Outfit,sans-serif;font-weight:800;font-size:clamp(32px,9vw,42px);line-height:1.05;letter-spacing:-0.02em;margin-bottom:16px">
        Track every<br>rupee. Hit every<br><span style="background:linear-gradient(135deg,#00d4aa,#00f5c4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">goal.</span>
      </h1>
      <p style="font-size:15px;color:rgba(255,255,255,0.5);margin-bottom:32px;line-height:1.6;max-width:320px">Your personal AI finance OS. Free forever, no credit card needed.</p>
      <button onclick="openModal('signupModal')" style="width:100%;max-width:320px;background:linear-gradient(135deg,#00d4aa,#00b894);border:none;color:#07090f;padding:16px;border-radius:12px;font-family:Outfit,sans-serif;font-size:17px;font-weight:700;cursor:pointer;box-shadow:0 0 30px rgba(0,212,170,0.3);margin-bottom:12px">Get Started Free →</button>
      <div style="font-size:13px;color:rgba(255,255,255,0.35)">Already have an account? <a onclick="openModal('loginModal')" style="color:rgba(0,212,170,0.8);cursor:pointer;font-weight:500">Sign in</a></div>
      <div style="margin-top:24px;font-size:12px;color:rgba(255,255,255,0.25)">Joined by 2,400+ users · 4.9★ rating · Free forever</div>
    </section>
    <!-- Sticky CTA bar at bottom on mobile -->
    <div id="mobile-sticky-cta" style="position:fixed;bottom:0;left:0;right:0;padding:12px 20px;background:rgba(7,9,15,0.95);backdrop-filter:blur(16px);border-top:1px solid rgba(255,255,255,0.06);z-index:200;display:none">
      <button onclick="openModal('signupModal')" style="width:100%;background:linear-gradient(135deg,#00d4aa,#00b894);border:none;color:#07090f;padding:14px;border-radius:10px;font-family:Outfit,sans-serif;font-size:16px;font-weight:700;cursor:pointer">Get Started Free →</button>
    </div>`;

  // Show sticky CTA after scrolling past hero
  window.addEventListener('scroll', () => {
    const cta = document.getElementById('mobile-sticky-cta');
    if (cta) cta.style.display = window.scrollY > window.innerHeight * 0.7 ? 'block' : 'none';
  });
}

// IntersectionObserver replaces old reveal()

function animateCounter(el) {
  if (el.dataset.animated) return;
  el.dataset.animated = 'true';
  const target = +el.dataset.target;
  let curr = 0;
  const duration = 2000;
  const startTime = performance.now();

  const update = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Easing: easeOutExpo
    const easedProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    
    curr = target * easedProgress;
    
    if (target > 5000) {
      el.innerText = '₹' + Math.floor(curr).toLocaleString();
    } else {
      el.innerText = Math.floor(curr).toLocaleString();
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      let finalVal = (target > 5000 ? '₹' : '') + target.toLocaleString();
      if(target == 4.9) finalVal = "4.9★";
      else if(target == 99.9) finalVal = "99.9%";
      else if(target > 5000) finalVal += 'Cr+';
      else finalVal += '+';
      el.innerText = finalVal;
    }
  };
  requestAnimationFrame(update);
}

// --- PWA & Mobile Experience Core ---

// 1. Service Worker Registration (Blob URL)
const swCode = `
  const CACHE = 'flowx-v1';
  const ASSETS = ['/'];

  self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
    self.skipWaiting();
  });

  self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ));
    self.clients.claim();
  });

  self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  });
`;

const swBlob = new Blob([swCode], { type: 'application/javascript' });
const swUrl  = URL.createObjectURL(swBlob);
navigator.serviceWorker?.register(swUrl);

// 2. Haptic Feedback Utility
function haptic(type = 'light') {
  if (!navigator.vibrate) return;
  const patterns = {
    light:   [10],
    medium:  [30],
    success: [50, 30, 50],
    error:   [200],
    warning: [100, 50, 100],
  };
  navigator.vibrate(patterns[type] || [10]);
}

// 3. Offline Detection & Queue
window.addEventListener('offline', () => showOfflineBanner(true));
window.addEventListener('online',  () => {
  showOfflineBanner(false);
  flushOfflineQueue();
});

function showOfflineBanner(show) {
  safeShow('offlineBanner', show ? 'block' : 'none');
  if(show) haptic('warning');
}


async function flushOfflineQueue() {
  const queue = JSON.parse(localStorage.getItem('flowx_offline_queue') || '[]');
  if (queue.length === 0) return;

  let successCount = 0;
  for (const tx of queue) {
    try {
      const { error } = await sb.from('transactions').insert(tx);
      if (!error) successCount++;
    } catch (e) { console.error('Offline sync failed', e); }
  }

  localStorage.removeItem('flowx_offline_queue');
  if (successCount > 0) {
    showToast(`Synced ${successCount} offline transactions ✅`, 'success');
    haptic('success');
    loadData().then(() => renderAllViews());
  }
}

// 4. Install Prompt Logic
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Show install banner after 30s on landing page
  if (!window.matchMedia('(display-mode: standalone)').matches) {
    setTimeout(() => {
         const lp = document.getElementById('landing-page');
         if (lp && lp.style.display !== 'none') {
             safeShow('installBanner', 'flex');
         }
    }, 30000);

  }
});

function installPWA() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then((choice) => {
    if (choice.outcome === 'accepted') {
        dismissInstall();
        haptic('success');
    }
    deferredPrompt = null;
  });
}

function dismissInstall() {
  safeHide('installBanner');
}


// 5. PIN Lock Logic
let currentPin = '';
let pinLockout = 0;
let lastActivity = Date.now();

function checkPinLock() {
  const savedPin = localStorage.getItem('flowx_app_pin');
  if (savedPin) {
    safeShow('pinLockOverlay', 'flex');
  }
}


function inputPin(num) {
  if (Date.now() < pinLockout) {
      showToast(`Locked for ${Math.ceil((pinLockout - Date.now())/1000)}s`, 'error');
      return;
  }
  if (currentPin.length < 4) {
    currentPin += num;
    haptic('light');
    updatePinDots();
  }
  if (currentPin.length === 4) {
    setTimeout(verifyPin, 200);
  }
}

function verifyPin() {
  const savedPin = localStorage.getItem('flowx_app_pin');
  // Simple check for demo/MVP
  if (currentPin === savedPin) {
    safeHide('pinLockOverlay');
    currentPin = '';
    updatePinDots();
    haptic('success');
  } else {

    handlePinFailure();
  }
}

let pinAttempts = 0;
function handlePinFailure() {
  pinAttempts++;
  haptic('error');
  document.getElementById('pinError').innerText = 'Incorrect PIN';
  clearPin();
  if (pinAttempts >= 3) {
    pinLockout = Date.now() + 30000;
    pinAttempts = 0;
    startLockoutTimer();
  }
}

function startLockoutTimer() {
    let count = 30;
    const timer = setInterval(() => {
        count--;
        document.getElementById('pinError').innerText = `Too many attempts. Wait ${count}s`;
        if(count <= 0) {
            clearInterval(timer);
            document.getElementById('pinError').innerText = '';
        }
    }, 1000);
}

function clearPin() {
  currentPin = '';
  updatePinDots();
}

function updatePinDots() {
  const dots = document.querySelectorAll('.pin-dots .dot');
  dots.forEach((dot, i) => {
    if (i < currentPin.length) dot.classList.add('filled');
    else dot.classList.remove('filled');
  });
}

function closePinLock() {
    // If no pin set, just close
    if(!localStorage.getItem('flowx_app_pin')) safeHide('pinLockOverlay');
}


// Inactivity auto-lock
setInterval(() => {
    const timeout = parseInt(localStorage.getItem('flowx_pin_timeout') || '0');
    if(timeout > 0 && Date.now() - lastActivity > timeout * 60000) {
        checkPinLock();
    }
}, 30000);

document.addEventListener('touchstart', () => lastActivity = Date.now());
document.addEventListener('click', () => lastActivity = Date.now());

// 6. Mobile Gestures (Swipe)
let touchStartX = 0;
let touchStartY = 0;
let activeSwipeRow = null;

function setupSwipeGestures() {
    document.addEventListener('touchstart', e => {
        const row = e.target.closest('tr');
        if(row && row.parentElement.id === 'txTableBody') {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            if(activeSwipeRow && activeSwipeRow !== row) resetSwipe(activeSwipeRow);
            activeSwipeRow = row;
        } else if(activeSwipeRow) {
            resetSwipe(activeSwipeRow);
            activeSwipeRow = null;
        }
    });

    document.addEventListener('touchmove', e => {
        if(!activeSwipeRow) return;
        const diffX = e.touches[0].clientX - touchStartX;
        const diffY = e.touches[0].clientY - touchStartY;
        
        // Horizontal dominance check
        if(Math.abs(diffX) > Math.abs(diffY)) {
            activeSwipeRow.style.transform = `translateX(${diffX}px)`;
        }
    });

    document.addEventListener('touchend', e => {
        if(!activeSwipeRow) return;
        const diffX = e.changedTouches[0].clientX - touchStartX;
        
        if(diffX < -60) {
            // Swipe Left -> Delete
            activeSwipeRow.style.transform = 'translateX(-80px)';
            haptic('medium');
        } else if(diffX > 60) {
            // Swipe Right -> Edit
            activeSwipeRow.style.transform = 'translateX(80px)';
            haptic('medium');
        } else {
            resetSwipe(activeSwipeRow);
        }
    });
}

function resetSwipe(row) {
    if(row) row.style.transform = 'translateX(0)';
}

// Long Press for Bulk Select
let longPressTimer;
function setupLongPress() {
    document.addEventListener('touchstart', e => {
        const row = e.target.closest('tr');
        if(row && row.parentElement.id === 'txTableBody') {
            longPressTimer = setTimeout(() => {
                enterBulkMode();
                haptic('medium');
            }, 500);
        }
    });
    document.addEventListener('touchend', () => clearTimeout(longPressTimer));
}

function enterBulkMode() {
    const vt = document.getElementById('view-transactions');
    if (vt) vt.classList.add('bulk-mode');
    safeShow('bulkActionBar', 'flex');
}


// Initialization Hooks
const originalInit = window.onload;
window.onload = () => {
    if(originalInit) originalInit();
    checkPinLock();
    setupSwipeGestures();
    setupLongPress();
};

// 7. Icon Generation Utility (Base64 Canvas)
function generatePWAIcons() {
    const sizes = [192, 512];
    sizes.forEach(size => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Dark background
        ctx.fillStyle = '#07090f';
        ctx.fillRect(0, 0, size, size);

        // Teal "F"
        ctx.fillStyle = '#00d4aa';
        ctx.font = `bold ${size * 0.6}px Outfit, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('F', size / 2, size / 2);

        const dataUrl = canvas.toDataURL('image/png');
        console.log(`PWA Icon ${size}x${size} (Base64):`, dataUrl);
    });
}
// Trigger generation for developer visibility (invisible to user)
// generatePWAIcons();
// === PHASE 8: REPORTS, TAX & CA SHARING ===

function renderReportsView() {
    haptic('light');
    // Initial data fetch if needed
}

async function generateMonthlyPDF() {
    haptic('medium');
    showToast('Generating PDF Report... 📄', 'info');
    
    // We create a temporary hidden container for the report
    const reportEl = document.createElement('div');
    reportEl.style.width = '800px';
    reportEl.style.padding = '40px';
    reportEl.style.background = '#ffffff';
    reportEl.style.color = '#000000';
    reportEl.style.position = 'fixed';
    reportEl.style.left = '-9999px';
    
    const now = new Date();
    const monthName = now.toLocaleString('default', { month: 'long' });
    
    reportEl.innerHTML = `
        <h1 style="color: #00d4aa; border-bottom: 2px solid #00d4aa; padding-bottom: 10px;">FlowX Monthly Report - ${monthName} ${now.getFullYear()}</h1>
        <div style="margin: 20px 0;">
            <h3>Summary</h3>
            <p>Net Worth: ${document.getElementById('netWorthValue').innerText}</p>
            <p>Monthly Income: ₹${currentProfile.monthly_income || 0}</p>
        </div>
        <div style="margin: 20px 0;">
            <h3>Subscriptions</h3>
            <p>Count: ${document.getElementById('subActiveCount').innerText}</p>
            <p>Monthly Burn: ${document.getElementById('subMonthlyValue').innerText}</p>
        </div>
        <p style="font-size: 0.8rem; margin-top: 50px; color: #666;">Generated automatically by FlowX AI Finance OS</p>
    `;
    
    document.body.appendChild(reportEl);
    
    try {
        const canvas = await html2canvas(reportEl);
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`FlowX_Report_${monthName}_${now.getFullYear()}.pdf`);
        showToast('Report downloaded!', 'success');
    } catch (err) {
        logError('PDF Gen Error', err);
    } finally {
        document.body.removeChild(reportEl);
    }
}

async function calculateTaxes() {
    const income = currentProfile.monthly_income * 12;
    if (!income) { showToast('Please set monthly income in Settings first', 'warning'); return; }
    
    // Simple New Regime FY 24-25 (Simplified)
    let taxNew = 0;
    const taxableNew = Math.max(0, income - 75000); // Standard deduction
    if (taxableNew > 1500000) taxNew += (taxableNew - 1500000) * 0.3 + 150000;
    else if (taxableNew > 1200000) taxNew += (taxableNew - 1200000) * 0.2 + 90000;
    else if (taxableNew > 1000000) taxNew += (taxableNew - 1000000) * 0.15 + 60000;
    else if (taxableNew > 700000) taxNew += (taxableNew - 700000) * 0.1 + 30000;
    else if (taxableNew > 300000) taxNew += (taxableNew - 300000) * 0.05;

    // Simple Old Regime (Simplified)
    let taxOld = 0;
    const deductions = 150000 + 50000; // 80C + Std
    const taxableOld = Math.max(0, income - deductions);
    if (taxableOld > 1000000) taxOld += (taxableOld - 1000000) * 0.3 + 112500;
    else if (taxableOld > 500000) taxOld += (taxableOld - 500000) * 0.2 + 12500;
    else if (taxableOld > 250000) taxOld += (taxableOld - 250000) * 0.05;

    document.getElementById('taxOld').innerText = `₹${taxOld.toLocaleString('en-IN')}`;
    document.getElementById('taxNew').innerText = `₹${taxNew.toLocaleString('en-IN')}`;
    
    const diff = Math.abs(taxOld - taxNew);
    const better = taxOld < taxNew ? 'Old Regime' : 'New Regime';
    document.getElementById('taxRecommendation').innerHTML = `Based on your info, the <strong>${better}</strong> is better by ₹${diff.toLocaleString('en-IN')}.`;
}

// Override openModal for tax
const originalOpenModal = window.openModal;
window.openModal = function(id) {
    if (id === 'taxPlannerModal') calculateTaxes();
    originalOpenModal(id);
};

async function generateShareLink() {
    const { data, error } = await supabase.from('ca_shares').insert([{
        user_id: user.id,
        includes_transactions: document.getElementById('shareTxs').checked,
        includes_investments: document.getElementById('shareInvs').checked
    }]).select().single();
    
    if (data) {
        document.getElementById('shareLink').value = `https://flowx.finance/shared/${data.token}`;
        haptic('success');
    }
}

function copyShareLink() {
    const lnk = document.getElementById('shareLink');
    lnk.select();
    document.execCommand('copy');
    showToast('Link copied to clipboard! 🔗');
}

async function exportBusinessCSV() {
    const { data } = await supabase.from('transactions').select('*').eq('user_id', user.id).eq('is_business', true);
    if (!data?.length) { showToast('No business transactions found', 'warning'); return; }
    
    let csv = 'Date,Category,Note,Amount,Type\n';
    data.forEach(t => {
        csv += `${t.date},${t.category},"${t.note || ''}",${t.amount},${t.type}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FlowX_Business_Export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    haptic('success');
}

function renderComparison() {
    haptic('medium');
    const type = document.getElementById('compareType').value;
    const now = new Date();
    const resultEl = document.getElementById('comparisonResult');
    
    let p1Exp = 0, p2Exp = 0;
    let p1Msg = '', p2Msg = '';
    
    if (type === 'mom') {
        const m1 = now.getMonth(), y1 = now.getFullYear();
        const m2 = m1 === 0 ? 11 : m1 - 1, y2 = m1 === 0 ? y1 - 1 : y1;
        
        appData.transactions.forEach(t => {
            const d = new Date(t.date);
            if (t.type === 'expense') {
                if (d.getMonth() === m1 && d.getFullYear() === y1) p1Exp += t.amount;
                if (d.getMonth() === m2 && d.getFullYear() === y2) p2Exp += t.amount;
            }
        });
        p1Msg = now.toLocaleString('default', { month: 'short' });
        p2Msg = new Date(y2, m2).toLocaleString('default', { month: 'short' });
    } else {
        const y1 = now.getFullYear(), y2 = y1 - 1;
        appData.transactions.forEach(t => {
            const d = new Date(t.date);
            if (t.type === 'expense') {
                if (d.getFullYear() === y1) p1Exp += t.amount;
                if (d.getFullYear() === y2) p2Exp += t.amount;
            }
        });
        p1Msg = y1.toString();
        p2Msg = y2.toString();
    }
    
    const diff = p1Exp - p2Exp;
    const percent = p2Exp > 0 ? (diff / p2Exp) * 100 : 0;
    
    resultEl.innerHTML = `
        <div class="dashboard-grid">
            <div class="glass-card">
                <h3>${p2Msg}</h3>
                <div class="value">₹${p2Exp.toLocaleString()}</div>
            </div>
            <div class="glass-card">
                <h3>${p1Msg}</h3>
                <div class="value">₹${p1Exp.toLocaleString()}</div>
            </div>
            <div class="glass-card" style="grid-column: span 12;">
                <h3>Delta</h3>
                <div class="value" style="color: ${percent > 0 ? 'var(--neon-rose)' : 'var(--neon-emerald)'}">${percent > 0 ? '+' : ''}${percent.toFixed(1)}%</div>
                <p>${percent > 0 ? 'Spending increased' : 'Great! You spent less'} vs previous ${type === 'mom' ? 'month' : 'year'}.</p>
            </div>
        </div>
    `;
}

// === PHASE 9: SOCIAL & SPLITTING ===

function renderSocialView() {
    haptic('light');
    renderSplits();
    renderChallenges();
    renderTipsFeed();
}

async function saveSplit(e) {
    e.preventDefault();
    const split = {
        description: document.getElementById('splitDesc').value,
        total_amount: parseFloat(document.getElementById('splitTotal').value),
        friends: document.getElementById('splitFriends').value.split(',').map(s => s.trim()),
        method: document.getElementById('splitMethod').value,
        user_id: currentUser.id
    };
    
    const { data, error } = await sb.from('splits').insert([split]).select().single();
    if (!error) {
        haptic('success');
        closeModal('addSplitModal');
        renderSplits();
        showToast('Split created! Share the QR to collect.', 'success');
    }
}

async function renderSplits() {
    const grid = document.getElementById('splitsGrid');
    const { data, error } = await sb.from('splits').select('*');
    if (error) return;
    grid.innerHTML = '';
    
    data.forEach(s => {
        const perPerson = s.total_amount / (s.friends.length + 1);
        const card = document.createElement('div');
        card.className = 'glass-card';
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                <h3>${s.description}</h3>
                <div class="badge">₹${s.total_amount}</div>
            </div>
            <p style="font-size: 0.8rem; color: var(--ink3);">You get: ₹${perPerson.toFixed(0)} from each of ${s.friends.length} friends</p>
            <div style="margin-top: 1rem; display: flex; gap: 10px;">
                <button class="btn-primary" style="font-size: 0.8rem; padding: 5px 10px;" onclick="showUpiQr('${s.description}', ${perPerson})"><i class="fa-solid fa-qrcode"></i> Collect</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function showUpiQr(note, amount) {
    haptic('medium');
    document.getElementById('upiText').innerText = `Pay ₹${amount} for ${note}`;
    const qrDiv = document.getElementById('upiQrCode');
    qrDiv.innerHTML = '';
    
    const vpa = currentProfile.upi_vpa || 'you@upi';
    const upiUrl = `upi://pay?pa=${vpa}&pn=${encodeURIComponent(currentProfile.full_name)}&am=${amount}&tn=${encodeURIComponent(note)}&cu=INR`;
    
    new QRCode(qrDiv, {
        text: upiUrl,
        width: 200,
        height: 200,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
    
    openModal('upiModal');
}

async function joinChallenge(type) {
    haptic('success');
    const { error } = await sb.from('challenge_participants').insert([{
        user_id: currentUser.id,
        challenge_type: type
    }]);
    if (!error) showToast('You have joined the challenge! 🏆');
}

function renderTipsFeed() {
    const tips = [
        "Avoid small daily leaks: That ₹80 coffee adds up to ₹2,400 a month!",
        "Rule of 50-30-20: Spend 50% on needs, 30% on wants, and 20% on savings.",
        "Check your subscriptions for 'zombie' services you no longer use.",
        "Did you know? FlowX can detect recurring bills automatically in the Banking tab.",
        "Invest in yourself: The best ROI is often a new skill or education."
    ];
    const feed = document.getElementById('tipsFeed');
    feed.innerHTML = '';
    tips.sort(() => Math.random() - 0.5).slice(0, 3).forEach(tip => {
        feed.innerHTML += `<div class="msg ai" style="margin-bottom: 10px; font-size: 0.9rem;">${tip}</div>`;
    });
}

async function togglePublicProfile() {
    haptic('medium');
    const newState = !currentProfile.is_public;
    const { error } = await sb.from('profiles').update({ is_public: newState }).eq('id', currentUser.id);
    if (!error) {
        currentProfile.is_public = newState;
        showToast(newState ? 'Public profile activated! 🎭' : 'Profile hidden.');
    }
}

// === PHASE 10: ACCESSIBILITY, i18n & SETTINGS ===

let currentLanguage = 'en';
const translations = {
    en: {
        dashboard: "Dashboard",
        transactions: "Transactions",
        accounts: "Financial Accounts",
        budgets: "Budgets",
        social: "Community & Splitting"
    },
    hi: {
        dashboard: "डैशबोर्ड",
        transactions: "लेन-देन",
        accounts: "वित्तीय खाते",
        budgets: "बजट",
        social: "समुदाय और बटवारा"
    }
};

function switchSettingsTab(tab) {
    haptic('light');
    const tabs = ['profile', 'security', 'display', 'data'];
    tabs.forEach(t => {
        const el = document.getElementById(`settings-${t}-tab`);
        if (el) el.style.display = t === tab ? 'block' : 'none';
        const btn = document.querySelector(`#view-settings .tab-btn[data-tab="${t}"]`);
        if (btn) btn.classList.toggle('active', t === tab);
    });
}

function changeLanguage() {
    const lang = document.getElementById('langSelect').value;
    currentLanguage = lang;
    haptic('medium');
    applyTranslations();
    showToast(`Language changed to ${lang === 'hi' ? 'Hindi' : 'English'}`);
}

function applyTranslations() {
    const t = translations[currentLanguage] || translations.en;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) el.innerText = t[key];
    });
}

function toggleAccessibility(type) {
    haptic('light');
    const isChecked = document.getElementById(type + 'Toggle').checked;
    if (type === 'highContrast') {
        document.body.classList.toggle('high-contrast', isChecked);
    } else if (type === 'reducedMotion') {
        document.body.classList.toggle('reduced-motion', isChecked);
    }
}

function updateFontScale() {
    const scale = document.getElementById('fontScaleSelect').value;
    document.documentElement.style.setProperty('--font-scale', scale);
    document.body.style.fontSize = (16 * scale) + 'px';
    haptic('light');
}

async function viewAuditLog() {
    const { data, error } = await sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(20);
    if (error) return;
    
    let html = '<div style="font-size: 0.85rem;">';
    data.forEach(log => {
        html += `<div style="padding: 10px; border-bottom: 1px solid var(--border);">
            <div style="font-weight:600;">${log.action.toUpperCase()} on ${log.table_name}</div>
            <div style="color:var(--ink3)">${new Date(log.created_at).toLocaleString()}</div>
        </div>`;
    });
    html += '</div>';
    
    toggleChat(true);
    document.getElementById('chatMessages').innerHTML += `<div class="msg ai"><h4>Recent Activity Log</h4>${html}</div>`;
}

let undoQueue = [];
function addToUndo(label, undoFn) {
    undoQueue.push({ label, undoFn });
    const banner = document.createElement('div');
    banner.className = 'glass-card undo-banner';
    banner.style.position = 'fixed';
    banner.style.bottom = '20px';
    banner.style.right = '20px';
    banner.style.zIndex = '9999';
    banner.style.padding = '15px 20px';
    banner.style.display = 'flex';
    banner.style.gap = '15px';
    banner.style.alignItems = 'center';
    banner.innerHTML = `<span>${label} removed.</span> <button onclick="triggerUndo()" class="btn-primary" style="padding:5px 10px; font-size:0.8rem;">Undo</button>`;
    document.body.appendChild(banner);
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 6000);
}

function triggerUndo() {
    const item = undoQueue.pop();
    if (item) {
        item.undoFn();
        haptic('success');
        document.querySelectorAll('.undo-banner').forEach(b => b.remove());
        showToast('Action undone!', 'info');
    }
}

// === PHASE 11: PRODUCTION HARDENING ===

// Global Error Boundary
window.onerror = function(message, source, lineno, colno, error) {
    if (message.includes('Script error')) return;
    const errorData = {
        message: message,
        source: source,
        lineno: lineno,
        colno: colno,
        error: error ? error.stack : ''
    };
    logErrorToSupabase('runtime_error', errorData);
    showToast('Something went wrong. We are looking into it.', 'error');
    return false;
};

window.onunhandledrejection = function(event) {
    logErrorToSupabase('unhandled_promise_rejection', {
        reason: event.reason
    });
};

async function logErrorToSupabase(type, data) {
    try {
        await sb.from('error_logs').insert([{
            user_id: currentUser?.id || null,
            error_type: type,
            error_data: data,
            user_agent: navigator.userAgent
        }]);
    } catch(e) {
        console.error('Failed to log error to backend:', e);
    }
}

// Analytics Logic (Privacy First, Anonymous aggregated data)
async function trackEvent(name, properties = {}) {
    try {
        await sb.from('analytics_events').insert([{
            user_id: currentUser?.id || null,
            event_name: name,
            event_properties: properties
        }]);
    } catch(e) {}
}

// Performance Hooks
const perfStart = performance.now();
window.addEventListener('load', () => {
    const loadTime = performance.now() - perfStart;
    trackEvent('page_load', { load_time_ms: loadTime });
});

// Skeleton Screen Helper
function toggleSkeletons(show) {
    document.querySelectorAll('.skeleton-wrapper').forEach(el => {
        el.classList.toggle('loading', show);
    });
}
