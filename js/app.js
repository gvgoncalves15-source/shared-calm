/*
 * Velo — Seu dinheiro em movimento
 * Desenvolvido por Gabriel Gonçalves
 */

let sb;
try {
  if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined') {
    throw new Error('js/config.js não carregou (verifique se o arquivo foi enviado ao GitHub)');
  }
  if (!window.supabase) {
    throw new Error('Biblioteca do Supabase não carregou (sem internet ou bloqueador de CDN)');
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (err) {
  console.error('[Velo] falha ao iniciar Supabase:', err);
  if (window.__scReportError) window.__scReportError('Falha ao iniciar: ' + err.message);
}

const state = {
  profiles: [],
  currentProfile: null,   // 'lucas' | 'mariana'
  currentView: 'rotina',
  rotinaTab: null,        // set after profiles load
  financasTab: null,
  fixasTab: null,
};

const PERIOD_LABEL = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
const PERIOD_ICON = { manha: 'routine', tarde: 'wb_sunny', noite: 'dark_mode' };

function money(n) {
  return (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.style.backgroundColor = isError ? '#ba1a1a' : '';
  t.style.maxWidth = '90vw';
  t.style.textAlign = 'center';
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => t.classList.add('hidden'), isError ? 6000 : 2200);
}

/* Painel de diagnóstico: mostra na própria tela qualquer erro de JavaScript
   ou falha de conexão com o Supabase, sem precisar abrir o console do navegador. */
window.addEventListener('error', (e) => {
  toast('Erro no app: ' + (e.message || 'erro desconhecido'), true);
});
window.addEventListener('unhandledrejection', (e) => {
  toast('Erro de conexão: ' + (e.reason && e.reason.message ? e.reason.message : e.reason), true);
});

function profileById(id) {
  return state.profiles.find(p => p.id === id);
}

/* Data de "hoje" no fuso horário local do aparelho (evita o bug de uma tarefa
   criada à noite contar como o dia seguinte por causa do UTC). */
function todayLocal() {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 10);
}

function accentClasses(accent) {
  return accent === 'gold'
    ? { bg: 'bg-gold', bgContainer: 'bg-gold-container', text: 'text-gold', dot: 'bg-gold' }
    : { bg: 'bg-coral', bgContainer: 'bg-coral-container', text: 'text-coral', dot: 'bg-tertiary' };
}

/* Ligação segura de eventos: se um elemento não existir na página (versão desatualizada,
   erro de digitação, etc.), avisa no console mas NÃO trava o resto dos botões. */
function on(id, ev, fn) {
  const el = document.getElementById(id);
  if (!el) { console.warn('[Velo] elemento não encontrado:', id); return; }
  el.addEventListener(ev, fn);
}
function onAll(selector, ev, fn) {
  document.querySelectorAll(selector).forEach(el => el.addEventListener(ev, fn));
}

/* ---------------- INIT ---------------- */

async function init() {
  const { data, error } = await sb.from('profiles').select('id,name,role,avatar_url,accent').order('id');
  if (error) {
    document.getElementById('login-status').textContent = 'Erro ao conectar ao Supabase: ' + error.message;
    return;
  }
  state.profiles = data;

  const saved = localStorage.getItem('sharedcalm_profile');
  if (saved && profileById(saved)) {
    enterApp(saved);
  }
}

function findProfileByName(name) {
  const norm = name.trim().toLowerCase();
  return state.profiles.find(p => p.name.trim().toLowerCase() === norm);
}

on('toggle-login-password', 'click', function () {
  const pw = document.getElementById('login-password');
  const isHidden = pw.type === 'password';
  pw.type = isHidden ? 'text' : 'password';
  this.textContent = isHidden ? 'visibility_off' : 'visibility';
});

on('form-login', 'submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('login-name').value.trim();
  const password = document.getElementById('login-password').value;
  const status = document.getElementById('login-status');
  status.textContent = '';
  if (!name || !password) return;

  const p = findProfileByName(name);
  if (!p) {
    status.textContent = 'Não encontramos esse nome. Toque em "Criar novo perfil" abaixo.';
    return;
  }

  const { data: result, error } = await sb.rpc('check_login', { p_id: p.id, p_password: password });
  if (error) { status.textContent = 'Erro ao entrar: ' + error.message; return; }

  if (result === 'ok') {
    document.getElementById('form-login').reset();
    enterApp(p.id);
  } else if (result === 'no_password') {
    const { error: setErr } = await sb.rpc('set_password', { p_id: p.id, p_password: password });
    if (setErr) { status.textContent = 'Erro ao definir senha: ' + setErr.message; return; }
    toast('Senha cadastrada! Você já está logado(a).');
    document.getElementById('form-login').reset();
    enterApp(p.id);
  } else {
    status.textContent = 'Nome ou senha incorretos.';
  }
});

function enterApp(profileId) {
  state.currentProfile = profileId;
  state.rotinaTab = profileId;
  state.financasTab = profileId;
  state.fixasTab = profileId;
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
  if (view === 'fixas') loadFixas();
}

onAll('input[name="fixed-type"]', 'change', () => {
  const isParcelado = document.querySelector('input[name="fixed-type"]:checked').value === 'parcelado';
  document.getElementById('fixed-parcelado-fields').classList.toggle('hidden', !isParcelado);
  document.getElementById('fixed-recorrente-fields').classList.toggle('hidden', isParcelado);
  document.getElementById('fixed-total').required = isParcelado;
  document.getElementById('fixed-first-due').required = isParcelado;
});

on('notif-btn', 'click', async () => {
  const { data } = await sb.from('nudges').select('*').order('created_at', { ascending: false }).limit(1);
  if (data && data.length && data[0].from_profile !== state.currentProfile) {
    const from = profileById(data[0].from_profile);
    toast(`💌 ${from ? from.name : 'Seu par'}: "${data[0].message}"`);
  } else {
    toast('Sem novidades por aqui');
  }
  goTo('casal');
});

onAll('.nav-btn', 'click', function () { goTo(this.dataset.nav); });
on('switch-profile-btn', 'click', () => {
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
  const bg = accent === 'gold' ? 'D4AF37' : '3f3f46';
  const color = accent === 'gold' ? '000000' : 'ffffff';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${bg}&color=${color}&size=128&bold=true`;
}

function openProfileModal(mode) {
  profileModalMode = mode;
  const title = document.getElementById('profile-modal-title');
  const nameInput = document.getElementById('profile-name');
  const roleInput = document.getElementById('profile-role');
  const pwInput = document.getElementById('profile-password');
  const pwHint = document.getElementById('profile-password-hint');
  if (mode === 'edit') {
    const p = profileById(state.currentProfile);
    title.textContent = 'Editar meu perfil';
    nameInput.value = p.name;
    roleInput.value = p.role || '';
    pwInput.value = '';
    pwInput.required = false;
    pwHint.classList.remove('hidden');
    document.querySelector(`input[name="profile-accent"][value="${p.accent}"]`).checked = true;
  } else {
    title.textContent = 'Novo perfil';
    document.getElementById('form-profile').reset();
    pwInput.required = true;
    pwHint.classList.add('hidden');
  }
  openModal('modal-profile');
}

on('create-profile-btn', 'click', () => openProfileModal('create'));
on('edit-profile-btn', 'click', () => openProfileModal('edit'));

on('form-profile', 'submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('profile-name').value.trim();
  const role = document.getElementById('profile-role').value.trim();
  const password = document.getElementById('profile-password').value;
  const accent = document.querySelector('input[name="profile-accent"]:checked').value;
  if (!name) return;
  if (profileModalMode === 'create' && !password) { toast('Defina uma senha', true); return; }

  if (profileModalMode === 'create') {
    const id = slugify(name);
    const { error } = await sb.from('profiles').insert({ id, name, role, accent, avatar_url: avatarUrl(name, accent) });
    if (error) { toast('Erro ao criar perfil: ' + error.message, true); return; }
    const { error: pwError } = await sb.rpc('set_password', { p_id: id, p_password: password });
    if (pwError) { toast('Perfil criado, mas erro ao definir senha: ' + pwError.message, true); return; }
    toast('Perfil criado! Faça login com seu nome e senha.');
  } else {
    const p = profileById(state.currentProfile);
    const { error } = await sb.from('profiles').update({ name, role, accent, avatar_url: avatarUrl(name, accent) }).eq('id', p.id);
    if (error) { toast('Erro ao salvar perfil: ' + error.message, true); return; }
    if (password) {
      const { error: pwError } = await sb.rpc('set_password', { p_id: p.id, p_password: password });
      if (pwError) { toast('Erro ao trocar senha: ' + pwError.message, true); return; }
    }
    toast('Perfil atualizado');
  }

  const { data } = await sb.from('profiles').select('id,name,role,avatar_url,accent').order('id');
  state.profiles = data;

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
  const today = todayLocal();
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
  div.className = `bg-surface-container-lowest rounded-lg p-sm border border-outline-variant shadow-sm flex items-center justify-between transition-opacity ${t.completed ? 'opacity-70' : ''}`;
  div.innerHTML = `
    <div class="flex items-center gap-sm">
      <button class="check-btn w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${t.completed ? 'bg-secondary border-secondary text-on-secondary' : 'border-outline-variant'}">
        ${t.completed ? '<span class="material-symbols-outlined text-[16px]">check</span>' : ''}
      </button>
      <span class="font-body-md text-body-md ${t.completed ? 'line-through text-on-surface-variant' : 'text-on-background font-medium'}">${t.title}</span>
    </div>
    <div class="flex items-center gap-2">
      ${showOwner && owner ? `<div class="w-6 h-6 rounded-full ${acc.dot} text-black flex items-center justify-center font-label-sm text-[10px] font-bold">${owner.name[0]}</div>` : ''}
      <button class="del-btn w-8 h-8 flex items-center justify-center text-outline hover:text-error transition-colors shrink-0"><span class="material-symbols-outlined text-[18px]">delete</span></button>
    </div>
  `;
  div.querySelector('.del-btn').addEventListener('click', async () => {
    if (!confirm('Excluir esta tarefa?')) return;
    const { error } = await sb.from('routine_tasks').delete().eq('id', t.id);
    if (error) { toast('Erro ao excluir: ' + error.message, true); return; }
    loadRotina();
  });
  div.querySelector('.check-btn').addEventListener('click', async () => {
    const { error } = await sb.from('routine_tasks').update({ completed: !t.completed }).eq('id', t.id);
    if (error) { toast('Erro ao atualizar: ' + error.message, true); return; }
    loadRotina();
  });
  return div;
}

on('add-task-btn', 'click', () => openModal('modal-task'));
on('form-task', 'submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('task-title').value.trim();
  const period = document.getElementById('task-period').value;
  const visibility = document.getElementById('task-visibility').value;
  if (!title) return;
  const { error } = await sb.from('routine_tasks').insert({
    title, period, visibility, owner: state.currentProfile, task_date: todayLocal()
  });
  closeModals();
  document.getElementById('form-task').reset();
  if (error) { toast('Erro ao salvar tarefa: ' + error.message, true); return; }
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
    row.className = 'bg-surface-container-lowest rounded-lg p-sm border border-outline-variant shadow-sm flex items-center justify-between';
    row.innerHTML = `
      <div class="flex items-center gap-sm">
        <div class="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-primary"><span class="material-symbols-outlined text-[18px]">receipt_long</span></div>
        <div>
          <div class="font-body-md text-[14px] font-medium">${t.description}</div>
          <div class="font-label-sm text-label-sm text-on-surface-variant">${owner ? owner.name : ''}${t.category ? ' • ' + t.category : ''}</div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <div class="font-headline-md text-[15px] font-bold">R$ ${money(t.amount)}</div>
        <button class="del-tx-btn w-8 h-8 flex items-center justify-center text-outline hover:text-error transition-colors shrink-0"><span class="material-symbols-outlined text-[18px]">delete</span></button>
      </div>`;
    row.querySelector('.del-tx-btn').addEventListener('click', async () => {
      if (!confirm('Excluir esta despesa?')) return;
      const { error } = await sb.from('finance_transactions').delete().eq('id', t.id);
      if (error) { toast('Erro ao excluir: ' + error.message, true); return; }
      loadFinancas();
    });
    txWrap.appendChild(row);
  });
  if (!txs || !txs.length) txWrap.innerHTML = '<p class="text-on-surface-variant font-body-md text-[14px]">Nenhuma despesa registrada ainda.</p>';
}

function goalCard(g) {
  const pct = g.target_amount ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)) : 0;
  const div = document.createElement('div');
  div.className = 'bg-surface-container-lowest rounded-lg p-sm border border-outline-variant shadow-sm';
  div.innerHTML = `
    <div class="flex justify-between items-start mb-2">
      <div class="w-9 h-9 rounded-lg bg-primary-fixed flex items-center justify-center text-on-primary-fixed-variant"><span class="material-symbols-outlined text-[18px]">${g.icon || 'savings'}</span></div>
      ${g.deadline ? `<span class="text-label-sm bg-surface-container-low rounded-full px-2 py-0.5">${g.deadline}</span>` : ''}
    </div>
    <div class="font-body-md font-semibold text-[15px]">${g.title}</div>
    <div class="font-label-sm text-label-sm text-on-surface-variant mb-2">R$ ${money(g.current_amount)} de R$ ${money(g.target_amount)}</div>
    <div class="w-full h-2 rounded-full bg-surface-container-low overflow-hidden mb-2"><div class="h-full bg-primary" style="width:${pct}%"></div></div>
    <div class="flex justify-end gap-1">
      <button class="goal-add-btn w-7 h-7 flex items-center justify-center text-primary hover:bg-surface-container-low rounded-full transition-colors" title="Adicionar valor guardado"><span class="material-symbols-outlined text-[16px]">add_circle</span></button>
      <button class="goal-del-btn w-7 h-7 flex items-center justify-center text-outline hover:text-error hover:bg-surface-container-low rounded-full transition-colors" title="Excluir meta"><span class="material-symbols-outlined text-[16px]">delete</span></button>
    </div>`;
  div.querySelector('.goal-add-btn').addEventListener('click', async () => {
    const raw = prompt(`Quanto a mais vocês guardaram para "${g.title}"? (R$)`);
    if (raw === null) return;
    const val = parseFloat(raw.replace(',', '.'));
    if (isNaN(val)) { toast('Valor inválido', true); return; }
    const { error } = await sb.from('finance_goals').update({ current_amount: Number(g.current_amount) + val }).eq('id', g.id);
    if (error) { toast('Erro ao atualizar meta: ' + error.message, true); return; }
    toast('Meta atualizada');
    if (state.currentView === 'financas') loadFinancas();
    if (state.currentView === 'casal') loadCasal();
  });
  div.querySelector('.goal-del-btn').addEventListener('click', async () => {
    if (!confirm(`Excluir a meta "${g.title}"?`)) return;
    const { error } = await sb.from('finance_goals').delete().eq('id', g.id);
    if (error) { toast('Erro ao excluir: ' + error.message, true); return; }
    if (state.currentView === 'financas') loadFinancas();
    if (state.currentView === 'casal') loadCasal();
  });
  return div;
}

on('add-tx-btn', 'click', () => openModal('modal-tx'));
on('form-tx', 'submit', async (e) => {
  e.preventDefault();
  const description = document.getElementById('tx-desc').value.trim();
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const category = document.getElementById('tx-category').value.trim();
  const scope = document.getElementById('tx-scope').value;
  if (!description || isNaN(amount)) return;
  const { error } = await sb.from('finance_transactions').insert({
    description, amount, category, scope, owner: state.currentProfile, tx_date: todayLocal()
  });
  closeModals();
  document.getElementById('form-tx').reset();
  if (error) { toast('Erro ao salvar despesa: ' + error.message, true); return; }
  toast('Despesa adicionada');
  loadFinancas();
});

/* ---------------- DESPESAS FIXAS ---------------- */

function renderFixasTabs() {
  const wrap = document.getElementById('fixas-tabs');
  const others = state.profiles;
  const tabs = [others[0], { id: 'casal', name: 'Casal' }, others[1]].filter(Boolean);
  wrap.innerHTML = '';
  tabs.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab-pill' + (state.fixasTab === t.id ? ' active' : '');
    btn.textContent = t.name;
    btn.addEventListener('click', () => { state.fixasTab = t.id; loadFixas(); });
    wrap.appendChild(btn);
  });
}

function addMonths(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

/* Garante que toda conta recorrente (sem número fixo de parcelas) sempre tenha
   uma ocorrência futura gerada — assim ela continua aparecendo mês após mês
   sem precisar de nenhuma ação manual. */
async function ensureUpcomingInstallments(recurringExpenses) {
  const today = todayLocal();
  for (const fe of recurringExpenses) {
    const { data: last } = await sb.from('fixed_expense_installments')
      .select('*').eq('fixed_expense_id', fe.id).order('due_date', { ascending: false }).limit(1);
    if (!last || !last.length) {
      let due = `${today.slice(0, 8)}${String(fe.due_day).padStart(2, '0')}`;
      if (due < today) due = addMonths(due, 1);
      await sb.from('fixed_expense_installments').insert({ fixed_expense_id: fe.id, due_date: due, amount: fe.amount });
    } else if (last[0].due_date < today) {
      const nextDue = addMonths(last[0].due_date, 1);
      await sb.from('fixed_expense_installments').insert({ fixed_expense_id: fe.id, due_date: nextDue, amount: fe.amount });
    }
  }
}

async function loadFixas() {
  renderFixasTabs();
  const isCasal = state.fixasTab === 'casal';

  let feQuery = sb.from('fixed_expenses').select('*').eq('active', true);
  feQuery = isCasal ? feQuery.eq('scope', 'casal') : feQuery.eq('owner', state.fixasTab);
  const { data: fixedExpenses } = await feQuery;
  const feList = fixedExpenses || [];

  await ensureUpcomingInstallments(feList.filter(fe => !fe.total_installments));

  const feIds = feList.map(fe => fe.id);
  let installments = [];
  if (feIds.length) {
    const { data } = await sb.from('fixed_expense_installments').select('*').in('fixed_expense_id', feIds).order('due_date');
    installments = data || [];
  }
  const feById = {};
  feList.forEach(fe => feById[fe.id] = fe);

  const today = todayLocal();
  const atrasadas = installments.filter(i => !i.paid && i.due_date < today);
  const abertas = installments.filter(i => !i.paid && i.due_date >= today);
  const pagas = installments.filter(i => i.paid).sort((a, b) => (b.paid_date || '').localeCompare(a.paid_date || '')).slice(0, 15);

  document.getElementById('fixas-total-atrasado').textContent = 'R$ ' + money(atrasadas.reduce((s, i) => s + Number(i.amount), 0));
  document.getElementById('fixas-total-aberto').textContent = 'R$ ' + money(abertas.reduce((s, i) => s + Number(i.amount), 0));

  const atrasadasWrap = document.getElementById('fixas-atrasadas');
  atrasadasWrap.innerHTML = '';
  atrasadas.forEach(i => atrasadasWrap.appendChild(installmentCard(i, feById[i.fixed_expense_id], 'atrasada')));
  if (!atrasadas.length) atrasadasWrap.innerHTML = '<p class="text-on-surface-variant font-body-md text-[14px]">Nada atrasado 🎉</p>';

  const abertasWrap = document.getElementById('fixas-abertas');
  abertasWrap.innerHTML = '';
  abertas.forEach(i => abertasWrap.appendChild(installmentCard(i, feById[i.fixed_expense_id], 'aberta')));
  if (!abertas.length) abertasWrap.innerHTML = '<p class="text-on-surface-variant font-body-md text-[14px]">Nenhuma conta em aberto.</p>';

  const pagasWrap = document.getElementById('fixas-pagas');
  pagasWrap.innerHTML = '';
  pagas.forEach(i => pagasWrap.appendChild(installmentCard(i, feById[i.fixed_expense_id], 'paga')));
  if (!pagas.length) pagasWrap.innerHTML = '<p class="text-on-surface-variant font-body-md text-[14px]">Nenhum pagamento registrado ainda.</p>';
}

function installmentCard(i, fe, status) {
  const div = document.createElement('div');
  const borderColor = status === 'atrasada' ? 'border-error' : status === 'paga' ? 'border-secondary' : 'border-outline-variant';
  div.className = `bg-surface-container-lowest rounded-lg p-sm border ${borderColor} shadow-sm flex items-center justify-between`;
  const [y, m, d] = i.due_date.split('-');
  const parcelaLabel = i.installment_number ? `Parcela ${i.installment_number}${fe && fe.total_installments ? ' de ' + fe.total_installments : ''}` : `Venc. ${d}/${m}/${y}`;
  div.innerHTML = `
    <div>
      <div class="font-body-md text-[14px] font-semibold">${fe ? fe.title : ''}</div>
      <div class="font-label-sm text-label-sm ${status === 'atrasada' ? 'text-error' : 'text-on-surface-variant'}">${parcelaLabel} • ${d}/${m}/${y}${status === 'atrasada' ? ' (atrasada)' : ''}${status === 'paga' && i.paid_date ? ' • paga em ' + i.paid_date.split('-').reverse().join('/') : ''}</div>
    </div>
    <div class="flex items-center gap-2">
      <span class="font-headline-md text-[15px] font-bold">R$ ${money(i.amount)}</span>
      ${status === 'paga'
        ? `<button class="undo-btn text-label-sm text-on-surface-variant underline">Desfazer</button>`
        : `<button class="pay-btn w-9 h-9 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center"><span class="material-symbols-outlined text-[18px]">check</span></button>`
      }
      <button class="del-fixed-inst-btn w-8 h-8 flex items-center justify-center text-outline hover:text-error transition-colors"><span class="material-symbols-outlined text-[18px]">delete</span></button>
    </div>`;
  if (status !== 'paga') {
    div.querySelector('.pay-btn').addEventListener('click', async () => {
      const { error } = await sb.from('fixed_expense_installments').update({ paid: true, paid_date: todayLocal() }).eq('id', i.id);
      if (error) { toast('Erro: ' + error.message, true); return; }
      toast('Marcado como pago');
      loadFixas();
    });
  } else {
    div.querySelector('.undo-btn').addEventListener('click', async () => {
      const { error } = await sb.from('fixed_expense_installments').update({ paid: false, paid_date: null }).eq('id', i.id);
      if (error) { toast('Erro: ' + error.message, true); return; }
      loadFixas();
    });
  }
  div.querySelector('.del-fixed-inst-btn').addEventListener('click', async () => {
    if (!confirm('Excluir esta ocorrência?')) return;
    const { error } = await sb.from('fixed_expense_installments').delete().eq('id', i.id);
    if (error) { toast('Erro: ' + error.message, true); return; }
    loadFixas();
  });
  return div;
}

on('add-fixed-btn', 'click', () => openModal('modal-fixed'));
on('form-fixed', 'submit', async (e) => {
  e.preventDefault();
  const type = document.querySelector('input[name="fixed-type"]:checked').value;
  const title = document.getElementById('fixed-title').value.trim();
  const category = document.getElementById('fixed-category').value.trim();
  const amount = parseFloat(document.getElementById('fixed-amount').value);
  const scope = document.getElementById('fixed-scope').value;
  if (!title || isNaN(amount)) return;

  const dueDayForRow = type === 'parcelado'
    ? Number(document.getElementById('fixed-first-due').value.split('-')[2])
    : Number(document.getElementById('fixed-due-day').value);

  const { data: fe, error } = await sb.from('fixed_expenses').insert({
    title, category, amount, scope, owner: state.currentProfile,
    total_installments: type === 'parcelado' ? Number(document.getElementById('fixed-total').value) : null,
    due_day: Math.min(28, dueDayForRow || 1)
  }).select().single();

  if (error || !fe) { toast('Erro ao criar: ' + (error ? error.message : ''), true); return; }

  if (type === 'parcelado') {
    const total = Number(document.getElementById('fixed-total').value);
    const firstDue = document.getElementById('fixed-first-due').value;
    const rows = [];
    for (let n = 0; n < total; n++) {
      rows.push({ fixed_expense_id: fe.id, installment_number: n + 1, due_date: addMonths(firstDue, n), amount });
    }
    const { error: instError } = await sb.from('fixed_expense_installments').insert(rows);
    if (instError) { toast('Erro ao gerar parcelas: ' + instError.message, true); return; }
  }

  closeModals();
  e.target.reset();
  document.getElementById('fixed-parcelado-fields').classList.remove('hidden');
  document.getElementById('fixed-recorrente-fields').classList.add('hidden');
  toast('Despesa fixa criada');
  loadFixas();
});

/* ---------------- CASAL ---------------- */

async function loadCasal() {
  const { data: casalTx } = await sb.from('finance_transactions').select('amount').eq('scope', 'casal');
  const balance = (casalTx || []).reduce((s, t) => s + Number(t.amount), 0);
  document.getElementById('casal-balance').textContent = money(balance);

  const today = todayLocal();
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
    div.className = 'bg-coral-container rounded-lg p-sm relative';
    div.innerHTML = `
      <button class="del-nudge-btn absolute top-2 right-2 w-7 h-7 flex items-center justify-center text-tertiary/60 hover:text-error transition-colors"><span class="material-symbols-outlined text-[16px]">close</span></button>
      <div class="flex items-center gap-2 mb-1 pr-6">
        <span class="material-symbols-outlined text-gold text-[18px]">favorite</span>
        <span class="font-label-sm text-label-sm text-tertiary font-bold">De: ${from ? from.name : ''}</span>
      </div>
      <p class="font-body-md text-[14px] text-on-tertiary-fixed-variant">"${n.message}"</p>`;
    div.querySelector('.del-nudge-btn').addEventListener('click', async () => {
      const { error } = await sb.from('nudges').delete().eq('id', n.id);
      if (error) { toast('Erro ao excluir: ' + error.message, true); return; }
      loadCasal();
    });
    nudgesWrap.appendChild(div);
  });
  if (!nudges || !nudges.length) nudgesWrap.innerHTML = '<p class="text-on-surface-variant font-body-md text-[14px]">Nenhum recado ainda. Mande um carinho para o seu par!</p>';
}

on('send-nudge-btn', 'click', () => {
  const other = state.profiles.find(p => p.id !== state.currentProfile);
  if (!other) { toast('Crie o perfil do seu par primeiro, na tela de login'); return; }
  openModal('modal-nudge');
});
on('form-nudge', 'submit', async (e) => {
  e.preventDefault();
  const message = document.getElementById('nudge-msg').value.trim();
  if (!message) return;
  const other = state.profiles.find(p => p.id !== state.currentProfile);
  if (!other) { toast('Crie o perfil do seu par primeiro'); closeModals(); return; }
  const { error } = await sb.from('nudges').insert({ from_profile: state.currentProfile, to_profile: other.id, message });
  closeModals();
  document.getElementById('form-nudge').reset();
  if (error) { toast('Erro ao enviar recado: ' + error.message, true); return; }
  toast('Recado enviado 💌');
  loadCasal();
});

onAll('.add-goal-btn', 'click', function () {
  document.getElementById('form-goal').dataset.forceCasal = this.dataset.scope === 'casal' ? '1' : '';
  openModal('modal-goal');
});
on('form-goal', 'submit', async (e) => {
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
  if (error) { toast('Erro ao criar meta: ' + error.message, true); return; }
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
  ['modal-task', 'modal-tx', 'modal-nudge', 'modal-profile', 'modal-goal', 'modal-fixed'].forEach(id => document.getElementById(id).classList.add('hidden'));
  const pw = document.getElementById('profile-password');
  if (pw) pw.value = '';
}
on('modal-backdrop', 'click', closeModals);
onAll('.modal-cancel', 'click', closeModals);

init().catch(err => {
  console.error('[Velo] erro ao iniciar app:', err);
  const status = document.getElementById('login-status');
  if (status) status.textContent = 'Ocorreu um erro ao carregar. Veja o aviso vermelho no topo da tela.';
  if (window.__scReportError) window.__scReportError('Erro ao iniciar: ' + (err && err.message ? err.message : err));
});

/* ---------------- SINCRONIA EM TEMPO REAL ---------------- */
/* Quando um dos dois mexe em algo (tarefa, despesa, meta, recado), o outro
   celular atualiza a tela sozinho, sem precisar trocar de aba. */
function refreshCurrentView() {
  if (!state.currentProfile) return;
  if (state.currentView === 'rotina') loadRotina();
  if (state.currentView === 'financas') loadFinancas();
  if (state.currentView === 'casal') loadCasal();
}

if (sb) {
  sb.channel('shared-calm-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'routine_tasks' }, refreshCurrentView)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fixed_expense_installments' }, refreshCurrentView)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fixed_expenses' }, refreshCurrentView)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_transactions' }, refreshCurrentView)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_goals' }, refreshCurrentView)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'nudges' }, () => {
      refreshCurrentView();
      if (state.currentView !== 'casal') toast('💌 Novo recado do seu par!');
    })
    .subscribe();
}
