const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  profiles: [],
  currentProfile: null,   // 'lucas' | 'mariana'
  currentView: 'rotina',
  rotinaTab: null,        // set after profiles load
  financasTab: null,
};

const PERIOD_LABEL = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
const PERIOD_ICON = { manha: 'routine', tarde: 'wb_sunny', noite: 'dark_mode' };

function money(n) {
  return (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2200);
}

function profileById(id) {
  return state.profiles.find(p => p.id === id);
}

function accentClasses(accent) {
  return accent === 'gold'
    ? { bg: 'bg-gold', bgContainer: 'bg-gold-container', text: 'text-gold', dot: 'bg-gold' }
    : { bg: 'bg-coral', bgContainer: 'bg-coral-container', text: 'text-coral', dot: 'bg-tertiary' };
}

/* ---------------- INIT ---------------- */

async function init() {
  const { data, error } = await sb.from('profiles').select('*').order('id');
  if (error) {
    document.getElementById('login-status').textContent = 'Erro ao conectar ao Supabase: ' + error.message;
    return;
  }
  state.profiles = data;
  renderLoginList();

  const saved = localStorage.getItem('sharedcalm_profile');
  if (saved && profileById(saved)) {
    enterApp(saved);
  }
}

function renderLoginList() {
  const list = document.getElementById('login-profile-list');
  list.innerHTML = '';
  state.profiles.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'w-full bg-surface-container-lowest rounded-lg p-sm shadow-sm flex items-center justify-between hover:shadow-md transition-shadow';
    btn.innerHTML = `
      <div class="flex items-center gap-3">
        <img src="${p.avatar_url}" class="w-12 h-12 rounded-full object-cover" alt="${p.name}"/>
        <div class="text-left">
          <div class="font-headline-md text-[20px] font-bold">${p.name}</div>
          <div class="font-body-md text-[14px] text-on-surface-variant">${p.role}</div>
        </div>
      </div>
      <span class="material-symbols-outlined text-outline">chevron_right</span>`;
    btn.addEventListener('click', () => enterApp(p.id));
    list.appendChild(btn);
  });
}

function enterApp(profileId) {
  state.currentProfile = profileId;
  state.rotinaTab = profileId;
  state.financasTab = profileId;
  localStorage.setItem('sharedcalm_profile', profileId);

  const p = profileById(profileId);
  document.getElementById('header-avatar').src = p.avatar_url;
  document.getElementById('perfil-avatar').src = p.avatar_url;
  document.getElementById('perfil-name').textContent = p.name;
  document.getElementById('perfil-role').textContent = p.role;

  document.getElementById('view-login').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  goTo('rotina');
}

/* ---------------- NAVIGATION ---------------- */

function goTo(view) {
  state.currentView = view;
  ['rotina', 'financas', 'casal', 'perfil'].forEach(v => {
    document.getElementById('view-' + v).classList.toggle('hidden', v !== view);
  });
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === view));

  if (view === 'rotina') loadRotina();
  if (view === 'financas') loadFinancas();
  if (view === 'casal') loadCasal();
}

document.getElementById('notif-btn').addEventListener('click', async () => {
  const { data } = await sb.from('nudges').select('*').order('created_at', { ascending: false }).limit(1);
  if (data && data.length && data[0].from_profile !== state.currentProfile) {
    const from = profileById(data[0].from_profile);
    toast(`💌 ${from ? from.name : 'Seu par'}: "${data[0].message}"`);
  } else {
    toast('Sem novidades por aqui');
  }
  goTo('casal');
});

document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => goTo(b.dataset.nav)));
document.getElementById('switch-profile-btn').addEventListener('click', () => {
  localStorage.removeItem('sharedcalm_profile');
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('view-login').classList.remove('hidden');
});

/* ---------------- CRIAR / EDITAR PERFIL ---------------- */

let profileModalMode = 'create'; // 'create' | 'edit'

function slugify(name) {
  const base = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  let id = base || 'perfil';
  let n = 1;
  while (profileById(id)) { id = `${base}-${n}`; n++; }
  return id;
}

function avatarUrl(name, accent) {
  const bg = accent === 'gold' ? 'a67c1c' : '9a3e40';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${bg}&color=fff&size=128&bold=true`;
}

function openProfileModal(mode) {
  profileModalMode = mode;
  const title = document.getElementById('profile-modal-title');
  const nameInput = document.getElementById('profile-name');
  const roleInput = document.getElementById('profile-role');
  if (mode === 'edit') {
    const p = profileById(state.currentProfile);
    title.textContent = 'Editar meu perfil';
    nameInput.value = p.name;
    roleInput.value = p.role || '';
    document.querySelector(`input[name="profile-accent"][value="${p.accent}"]`).checked = true;
  } else {
    title.textContent = 'Novo perfil';
    document.getElementById('form-profile').reset();
  }
  openModal('modal-profile');
}

document.getElementById('create-profile-btn').addEventListener('click', () => openProfileModal('create'));
document.getElementById('edit-profile-btn').addEventListener('click', () => openProfileModal('edit'));

document.getElementById('form-profile').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('profile-name').value.trim();
  const role = document.getElementById('profile-role').value.trim();
  const accent = document.querySelector('input[name="profile-accent"]:checked').value;
  if (!name) return;

  if (profileModalMode === 'create') {
    const id = slugify(name);
    const { error } = await sb.from('profiles').insert({ id, name, role, accent, avatar_url: avatarUrl(name, accent) });
    if (error) { toast('Erro ao criar perfil'); return; }
    toast('Perfil criado! Toque nele para entrar.');
  } else {
    const p = profileById(state.currentProfile);
    const { error } = await sb.from('profiles').update({ name, role, accent, avatar_url: avatarUrl(name, accent) }).eq('id', p.id);
    if (error) { toast('Erro ao salvar perfil'); return; }
    toast('Perfil atualizado');
  }

  const { data } = await sb.from('profiles').select('*').order('id');
  state.profiles = data;
  renderLoginList();

  if (profileModalMode === 'edit') {
    const p = profileById(state.currentProfile);
    document.getElementById('header-avatar').src = p.avatar_url;
    document.getElementById('perfil-avatar').src = p.avatar_url;
    document.getElementById('perfil-name').textContent = p.name;
    document.getElementById('perfil-role').textContent = p.role;
  }

  closeModals();
});

/* ---------------- ROTINA ---------------- */

function renderRotinaTabs() {
  const wrap = document.getElementById('rotina-tabs');
  const others = state.profiles;
  const tabs = [others[0], { id: 'casal', name: 'Casal' }, others[1]].filter(Boolean);
  wrap.innerHTML = '';
  tabs.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab-pill' + (state.rotinaTab === t.id ? ' active' : '');
    btn.textContent = t.name;
    btn.addEventListener('click', () => { state.rotinaTab = t.id; loadRotina(); });
    wrap.appendChild(btn);
  });
}

async function loadRotina() {
  renderRotinaTabs();
  const today = new Date().toISOString().slice(0, 10);
  let query = sb.from('routine_tasks').select('*').eq('task_date', today).order('created_at');
  if (state.rotinaTab !== 'casal') query = query.eq('owner', state.rotinaTab);
  const { data, error } = await query;
  if (error) { toast('Erro ao carregar rotina'); return; }

  const done = data.filter(t => t.completed).length;
  const total = data.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  document.getElementById('rotina-progress-label').textContent =
    state.rotinaTab === 'casal' ? `Vocês completaram ${done} de ${total} tarefas hoje.` : `Você completou ${done} de ${total} tarefas hoje.`;
  document.getElementById('stat-done').textContent = done;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-pending').textContent = total - done;
  document.getElementById('rotina-pct').textContent = pct + '%';
  const ring = document.getElementById('rotina-ring');
  const circumference = 213.6;
  ring.setAttribute('stroke-dashoffset', circumference - (circumference * pct / 100));

  const container = document.getElementById('rotina-tasks');
  container.innerHTML = '';
  ['manha', 'tarde', 'noite'].forEach(period => {
    const tasks = data.filter(t => t.period === period);
    if (!tasks.length) return;
    const section = document.createElement('section');
    const owner = state.rotinaTab === 'casal';
    section.innerHTML = `
      <div class="flex items-center gap-sm mb-3">
        <div class="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center text-primary">
          <span class="material-symbols-outlined text-[18px]" style="font-variation-settings:'FILL' 1;">${PERIOD_ICON[period]}</span>
        </div>
        <h3 class="font-headline-md text-headline-md text-on-background">${PERIOD_LABEL[period]}</h3>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-sm" data-period="${period}"></div>`;
    const grid = section.querySelector('[data-period]');
    tasks.forEach(t => grid.appendChild(taskCard(t, owner)));
    container.appendChild(section);
  });
  if (!data.length) {
    container.innerHTML = '<p class="text-on-surface-variant font-body-md text-center py-8">Nenhuma tarefa por aqui hoje. Toque em + para adicionar.</p>';
  }
}

function taskCard(t, showOwner) {
  const owner = profileById(t.owner);
  const acc = accentClasses(owner ? owner.accent : 'primary');
  const div = document.createElement('div');
  div.className = `bg-surface-container-lowest rounded-lg p-sm border border-surface-container-low shadow-sm flex items-center justify-between transition-opacity ${t.completed ? 'opacity-70' : ''}`;
  div.innerHTML = `
    <div class="flex items-center gap-sm">
      <button class="check-btn w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${t.completed ? 'bg-secondary border-secondary text-on-secondary' : 'border-outline-variant'}">
        ${t.completed ? '<span class="material-symbols-outlined text-[16px]">check</span>' : ''}
      </button>
      <span class="font-body-md text-body-md ${t.completed ? 'line-through text-on-surface-variant' : 'text-on-background font-medium'}">${t.title}</span>
    </div>
    ${showOwner && owner ? `<div class="w-6 h-6 rounded-full ${acc.dot} text-white flex items-center justify-center font-label-sm text-[10px] font-bold">${owner.name[0]}</div>` : ''}
  `;
  div.querySelector('.check-btn').addEventListener('click', async () => {
    const { error } = await sb.from('routine_tasks').update({ completed: !t.completed }).eq('id', t.id);
    if (error) { toast('Erro ao atualizar'); return; }
    loadRotina();
  });
  return div;
}

document.getElementById('add-task-btn').addEventListener('click', () => openModal('modal-task'));
document.getElementById('form-task').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('task-title').value.trim();
  const period = document.getElementById('task-period').value;
  const visibility = document.getElementById('task-visibility').value;
  if (!title) return;
  const { error } = await sb.from('routine_tasks').insert({
    title, period, visibility, owner: state.currentProfile, task_date: new Date().toISOString().slice(0, 10)
  });
  closeModals();
  document.getElementById('form-task').reset();
  if (error) { toast('Erro ao salvar tarefa'); return; }
  toast('Tarefa adicionada');
  loadRotina();
});

/* ---------------- FINANÇAS ---------------- */

function renderFinancasTabs() {
  const wrap = document.getElementById('financas-tabs');
  const others = state.profiles;
  const tabs = [others[0], { id: 'casal', name: 'Casal' }, others[1]].filter(Boolean);
  wrap.innerHTML = '';
  tabs.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab-pill' + (state.financasTab === t.id ? ' active' : '');
    btn.textContent = t.name;
    btn.addEventListener('click', () => { state.financasTab = t.id; loadFinancas(); });
    wrap.appendChild(btn);
  });
}

async function loadFinancas() {
  renderFinancasTabs();
  const isCasal = state.financasTab === 'casal';
  const scope = isCasal ? 'casal' : 'individual';

  let txQuery = sb.from('finance_transactions').select('*').order('tx_date', { ascending: false }).limit(10);
  txQuery = isCasal ? txQuery.eq('scope', 'casal') : txQuery.eq('owner', state.financasTab);
  const { data: txs } = await txQuery;

  let goalQuery = sb.from('finance_goals').select('*').order('created_at');
  goalQuery = isCasal ? goalQuery.eq('scope', 'casal') : goalQuery.eq('scope', state.financasTab);
  const { data: goals } = await goalQuery;

  const total = (txs || []).reduce((s, t) => s + Number(t.amount), 0);
  document.getElementById('financas-balance-label').textContent = isCasal ? 'SALDO CONJUNTO' : `SALDO — ${profileById(state.financasTab).name.toUpperCase()}`;
  document.getElementById('financas-balance').textContent = 'R$ ' + money(total);
  document.getElementById('financas-trend').textContent = '';
  document.getElementById('financas-trend').classList.add('hidden');

  const contribBox = document.getElementById('financas-contrib');
  if (isCasal && state.profiles.length >= 2) {
    contribBox.classList.remove('hidden');
    const { data: allTx } = await sb.from('finance_transactions').select('owner, amount').eq('scope', 'casal');
    const byOwner = {};
    state.profiles.forEach(p => byOwner[p.id] = 0);
    (allTx || []).forEach(t => byOwner[t.owner] = (byOwner[t.owner] || 0) + Number(t.amount));
    const sum = Object.values(byOwner).reduce((a, b) => a + b, 0) || 1;
    const [p1, p2] = state.profiles;
    const pct1 = Math.round((byOwner[p1.id] / sum) * 100);
    const pct2 = Math.round((byOwner[p2.id] / sum) * 100);
    document.getElementById('financas-bar-lucas').style.width = pct1 + '%';
    document.getElementById('financas-bar-mariana').style.width = pct2 + '%';
    document.getElementById('financas-pct-lucas').textContent = `${p1.name} (${pct1}%)`;
    document.getElementById('financas-pct-mariana').textContent = `${p2.name} (${pct2}%)`;
  } else {
    contribBox.classList.add('hidden');
  }

  const goalsWrap = document.getElementById('financas-goals');
  goalsWrap.innerHTML = '';
  (goals || []).forEach(g => goalsWrap.appendChild(goalCard(g)));
  if (!goals || !goals.length) goalsWrap.innerHTML = '<p class="text-on-surface-variant font-body-md text-[14px]">Nenhuma meta ainda.</p>';

  const txWrap = document.getElementById('financas-transactions');
  txWrap.innerHTML = '';
  (txs || []).forEach(t => {
    const owner = profileById(t.owner);
    const row = document.createElement('div');
    row.className = 'bg-surface-container-lowest rounded-lg p-sm border border-surface-container-low shadow-sm flex items-center justify-between';
    row.innerHTML = `
      <div class="flex items-center gap-sm">
        <div class="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-primary"><span class="material-symbols-outlined text-[18px]">receipt_long</span></div>
        <div>
          <div class="font-body-md text-[14px] font-medium">${t.description}</div>
          <div class="font-label-sm text-label-sm text-on-surface-variant">${owner ? owner.name : ''}${t.category ? ' • ' + t.category : ''}</div>
        </div>
      </div>
      <div class="font-headline-md text-[15px] font-bold">R$ ${money(t.amount)}</div>`;
    txWrap.appendChild(row);
  });
  if (!txs || !txs.length) txWrap.innerHTML = '<p class="text-on-surface-variant font-body-md text-[14px]">Nenhuma despesa registrada ainda.</p>';
}

function goalCard(g) {
  const pct = g.target_amount ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)) : 0;
  const div = document.createElement('div');
  div.className = 'bg-surface-container-lowest rounded-lg p-sm border border-surface-container-low shadow-sm';
  div.innerHTML = `
    <div class="flex justify-between items-start mb-2">
      <div class="w-9 h-9 rounded-lg bg-primary-fixed flex items-center justify-center text-on-primary-fixed-variant"><span class="material-symbols-outlined text-[18px]">${g.icon || 'savings'}</span></div>
      ${g.deadline ? `<span class="text-label-sm bg-surface-container-low rounded-full px-2 py-0.5">${g.deadline}</span>` : ''}
    </div>
    <div class="font-body-md font-semibold text-[15px]">${g.title}</div>
    <div class="font-label-sm text-label-sm text-on-surface-variant mb-2">R$ ${money(g.current_amount)} de R$ ${money(g.target_amount)}</div>
    <div class="w-full h-2 rounded-full bg-surface-container-low overflow-hidden"><div class="h-full bg-primary" style="width:${pct}%"></div></div>`;
  return div;
}

document.getElementById('add-tx-btn').addEventListener('click', () => openModal('modal-tx'));
document.getElementById('form-tx').addEventListener('submit', async (e) => {
  e.preventDefault();
  const description = document.getElementById('tx-desc').value.trim();
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const category = document.getElementById('tx-category').value.trim();
  const scope = document.getElementById('tx-scope').value;
  if (!description || isNaN(amount)) return;
  const { error } = await sb.from('finance_transactions').insert({
    description, amount, category, scope, owner: state.currentProfile, tx_date: new Date().toISOString().slice(0, 10)
  });
  closeModals();
  document.getElementById('form-tx').reset();
  if (error) { toast('Erro ao salvar despesa'); return; }
  toast('Despesa adicionada');
  loadFinancas();
});

/* ---------------- CASAL ---------------- */

async function loadCasal() {
  const { data: casalTx } = await sb.from('finance_transactions').select('amount').eq('scope', 'casal');
  const balance = (casalTx || []).reduce((s, t) => s + Number(t.amount), 0);
  document.getElementById('casal-balance').textContent = money(balance);

  const today = new Date().toISOString().slice(0, 10);
  const { data: tasks } = await sb.from('routine_tasks').select('*').eq('task_date', today);
  const total = (tasks || []).length;
  const done = (tasks || []).filter(t => t.completed).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('casal-tasks-label').textContent = `${done} de ${total} tarefas concluídas`;
  document.getElementById('casal-tasks-pct').textContent = pct + '%';

  const [p1, p2] = state.profiles;
  const countFor = id => (tasks || []).filter(t => t.owner === id && t.completed).length;
  const c1 = countFor(p1.id), c2 = p2 ? countFor(p2.id) : 0;
  const sum = (c1 + c2) || 1;
  document.getElementById('casal-bar-lucas').style.width = Math.round((c1 / sum) * 100) + '%';
  document.getElementById('casal-bar-mariana').style.width = Math.round((c2 / sum) * 100) + '%';
  document.getElementById('casal-count-lucas').textContent = `${p1.name} (${c1})`;
  document.getElementById('casal-count-mariana').textContent = p2 ? `${p2.name} (${c2})` : 'Aguardando parceiro(a)';

  const { data: goals } = await sb.from('finance_goals').select('*').eq('scope', 'casal');
  const goalsWrap = document.getElementById('casal-goals');
  goalsWrap.innerHTML = '';
  (goals || []).forEach(g => goalsWrap.appendChild(goalCard(g)));

  const { data: nudges } = await sb.from('nudges').select('*').order('created_at', { ascending: false }).limit(10);
  const nudgesWrap = document.getElementById('casal-nudges');
  nudgesWrap.innerHTML = '';
  (nudges || []).forEach(n => {
    const from = profileById(n.from_profile);
    const div = document.createElement('div');
    div.className = 'bg-coral-container rounded-lg p-sm';
    div.innerHTML = `
      <div class="flex items-center gap-2 mb-1">
        <span class="material-symbols-outlined text-tertiary text-[18px]">favorite</span>
        <span class="font-label-sm text-label-sm text-tertiary font-bold">De: ${from ? from.name : ''}</span>
      </div>
      <p class="font-body-md text-[14px] text-on-tertiary-fixed-variant">"${n.message}"</p>`;
    nudgesWrap.appendChild(div);
  });
  if (!nudges || !nudges.length) nudgesWrap.innerHTML = '<p class="text-on-surface-variant font-body-md text-[14px]">Nenhum recado ainda. Mande um carinho para o seu par!</p>';
}

document.getElementById('send-nudge-btn').addEventListener('click', () => {
  const other = state.profiles.find(p => p.id !== state.currentProfile);
  if (!other) { toast('Crie o perfil do seu par primeiro, na tela de login'); return; }
  openModal('modal-nudge');
});
document.getElementById('form-nudge').addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = document.getElementById('nudge-msg').value.trim();
  if (!message) return;
  const other = state.profiles.find(p => p.id !== state.currentProfile);
  if (!other) { toast('Crie o perfil do seu par primeiro'); closeModals(); return; }
  const { error } = await sb.from('nudges').insert({ from_profile: state.currentProfile, to_profile: other.id, message });
  closeModals();
  document.getElementById('form-nudge').reset();
  if (error) { toast('Erro ao enviar recado'); return; }
  toast('Recado enviado 💌');
  loadCasal();
});

document.querySelectorAll('.add-goal-btn').forEach(btn => btn.addEventListener('click', () => {
  document.getElementById('form-goal').dataset.forceCasal = btn.dataset.scope === 'casal' ? '1' : '';
  openModal('modal-goal');
}));
document.getElementById('form-goal').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('goal-title').value.trim();
  const icon = document.getElementById('goal-icon').value;
  const target_amount = parseFloat(document.getElementById('goal-target').value);
  const current_amount = parseFloat(document.getElementById('goal-current').value) || 0;
  const deadline = document.getElementById('goal-deadline').value.trim();
  if (!title || isNaN(target_amount)) return;
  const forceCasal = e.target.dataset.forceCasal === '1';
  const scope = forceCasal ? 'casal' : state.financasTab;
  const { error } = await sb.from('finance_goals').insert({ title, icon, target_amount, current_amount, deadline, scope });
  closeModals();
  e.target.reset();
  if (error) { toast('Erro ao criar meta'); return; }
  toast('Meta criada');
  if (state.currentView === 'financas') loadFinancas();
  if (state.currentView === 'casal') loadCasal();
});

/* ---------------- MODALS ---------------- */

function openModal(id) {
  document.getElementById('modal-backdrop').classList.remove('hidden');
  document.getElementById('modal-backdrop').classList.add('flex');
  document.getElementById(id).classList.remove('hidden');
}
function closeModals() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.getElementById('modal-backdrop').classList.remove('flex');
  ['modal-task', 'modal-tx', 'modal-nudge', 'modal-profile', 'modal-goal'].forEach(id => document.getElementById(id).classList.add('hidden'));
}
document.getElementById('modal-backdrop').addEventListener('click', closeModals);
document.querySelectorAll('.modal-cancel').forEach(b => b.addEventListener('click', closeModals));

init();
