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
  rotinaWeekOffset: 0,    // 0 = semana atual, -1 = anterior, +1 = próxima
  rotinaSelectedDate: null,
  financasTab: null,
  fixasTab: null,
  perfilMonthOffset: 0,   // 0 = mês atual, -1 = anterior, etc.
  perfilMonthTab: null,
  partner: null,
};

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

/* Parceiro(a) vinculado(a). Se ninguém vinculou explicitamente ainda e só
   existem 2 perfis no total, assume que são o casal (compatibilidade com
   quem já usava o app antes desse recurso existir). */
function getPartnerProfile() {
  const self = profileById(state.currentProfile);
  if (!self) return null;
  if (self.linked_partner_id) return profileById(self.linked_partner_id) || null;
  if (state.profiles.length === 2) return state.profiles.find(p => p.id !== state.currentProfile) || null;
  return null;
}

/* Lista de abas Eu / Casal / Parceiro(a), em ordem estável (por id), usada
   em Rotina, Finanças, Fixas e no Resumo do Mês. */
function coupleTabList() {
  const self = profileById(state.currentProfile);
  if (!self) return [];
  const partner = state.partner;
  if (!partner) return [self];
  const pair = [self, partner].sort((a, b) => a.id.localeCompare(b.id));
  return [pair[0], { id: 'casal', name: 'Casal' }, pair[1]];
}

async function refreshProfilesAndPartner() {
  const { data } = await sb.from('profiles').select('id,name,role,avatar_url,accent,monthly_income,linked_partner_id').order('id');
  state.profiles = data || state.profiles;
  state.partner = getPartnerProfile();
}

/* Data de "hoje" no fuso horário local do aparelho (evita o bug de uma tarefa
   criada à noite contar como o dia seguinte por causa do UTC). */
function todayLocal() {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 10);
}

function addDaysLocal(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/* Segunda-feira da semana que contém dateStr */
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay(); // 0=domingo..6=sábado
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_LABELS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function weekDatesFromMonday(mondayStr) {
  const arr = [];
  for (let i = 0; i < 7; i++) arr.push(addDaysLocal(mondayStr, i));
  return arr;
}

function dayLabelOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return DAY_LABELS[d.getDay()];
}

function formatShortDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}`;
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
  const { data, error } = await sb.from('profiles').select('id,name,role,avatar_url,accent,monthly_income,linked_partner_id').order('id');
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
    const { error: setErr } = await sb.rpc('set_password', { p_id: p.id, p_new_password: password, p_current_password: null });
    if (setErr) { status.textContent = 'Erro ao definir senha: ' + setErr.message; return; }
    toast('Senha cadastrada! Você já está logado(a).');
    document.getElementById('form-login').reset();
    enterApp(p.id);
  } else if (result === 'locked') {
    status.textContent = '🔒 Muitas tentativas erradas. Tente novamente em alguns minutos.';
  } else {
    status.textContent = 'Nome ou senha incorretos.';
  }
});

function enterApp(profileId) {
  state.currentProfile = profileId;
  state.rotinaTab = profileId;
  state.financasTab = profileId;
  state.fixasTab = profileId;
  state.perfilMonthTab = profileId;
  state.rotinaWeekOffset = 0;
  state.rotinaSelectedDate = null;
  state.perfilMonthOffset = 0;
  state.partner = getPartnerProfile();
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
  ['rotina', 'financas', 'fixas', 'casal', 'perfil'].forEach(v => {
    document.getElementById('view-' + v).classList.toggle('hidden', v !== view);
  });
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === view));

  if (view === 'rotina') loadRotina();
  if (view === 'financas') loadFinancas();
  if (view === 'casal') loadCasal();
  if (view === 'fixas') loadFixas();
  if (view === 'perfil') { renderLinkBox(); loadPerfilSummary(); }
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
  const curPwInput = document.getElementById('profile-current-password');
  if (mode === 'edit') {
    const p = profileById(state.currentProfile);
    title.textContent = 'Editar meu perfil';
    nameInput.value = p.name;
    roleInput.value = p.role || '';
    document.getElementById('profile-income').value = p.monthly_income || '';
    pwInput.value = '';
    pwInput.required = false;
    pwHint.classList.remove('hidden');
    curPwInput.value = '';
    curPwInput.classList.remove('hidden');
    document.querySelector(`input[name="profile-accent"][value="${p.accent}"]`).checked = true;
  } else {
    title.textContent = 'Novo perfil';
    document.getElementById('form-profile').reset();
    pwInput.required = true;
    pwHint.classList.add('hidden');
    curPwInput.classList.add('hidden');
    curPwInput.required = false;
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
  const currentPassword = document.getElementById('profile-current-password').value;
  const incomeRaw = document.getElementById('profile-income').value;
  const monthly_income = incomeRaw ? parseFloat(incomeRaw) : null;
  const accent = document.querySelector('input[name="profile-accent"]:checked').value;
  if (!name) return;
  if (profileModalMode === 'create' && !password) { toast('Defina uma senha', true); return; }

  if (profileModalMode === 'create') {
    const id = slugify(name);
    const { error } = await sb.from('profiles').insert({ id, name, role, accent, monthly_income, avatar_url: avatarUrl(name, accent) });
    if (error) { toast('Erro ao criar perfil: ' + error.message, true); return; }
    const { data: pwResult, error: pwError } = await sb.rpc('set_password', { p_id: id, p_new_password: password, p_current_password: null });
    if (pwError) { toast('Perfil criado, mas erro ao definir senha: ' + pwError.message, true); return; }
    toast('Perfil criado! Faça login com seu nome e senha.');
  } else {
    const p = profileById(state.currentProfile);
    if (password) {
      const { data: pwResult, error: pwError } = await sb.rpc('set_password', { p_id: p.id, p_new_password: password, p_current_password: currentPassword || null });
      if (pwError) { toast('Erro ao trocar senha: ' + pwError.message, true); return; }
      if (pwResult === 'wrong_current') { toast('Senha atual incorreta — a senha não foi trocada.', true); return; }
    }
    const { error } = await sb.from('profiles').update({ name, role, accent, monthly_income, avatar_url: avatarUrl(name, accent) }).eq('id', p.id);
    if (error) { toast('Erro ao salvar perfil: ' + error.message, true); return; }
    toast('Perfil atualizado');
  }

  const { data } = await sb.from('profiles').select('id,name,role,avatar_url,accent,monthly_income,linked_partner_id').order('id');
  state.profiles = data;
  state.partner = getPartnerProfile();
  if (state.currentView === 'perfil') renderLinkBox();

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
  const tabs = coupleTabList();
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
  const monday = mondayOf(addDaysLocal(today, state.rotinaWeekOffset * 7));
  const sunday = addDaysLocal(monday, 6);
  const weekDates = weekDatesFromMonday(monday);
  if (!state.rotinaSelectedDate || !weekDates.includes(state.rotinaSelectedDate)) {
    state.rotinaSelectedDate = weekDates.includes(today) ? today : monday;
  }

  document.getElementById('rotina-week-label').textContent =
    state.rotinaWeekOffset === 0 ? `Esta semana (${formatShortDate(monday)} – ${formatShortDate(sunday)})` : `${formatShortDate(monday)} – ${formatShortDate(sunday)}`;

  let query = sb.from('routine_tasks').select('*').gte('task_date', monday).lte('task_date', sunday).order('created_at');
  if (state.rotinaTab !== 'casal') query = query.eq('owner', state.rotinaTab);
  const { data, error } = await query;
  if (error) { toast('Erro ao carregar rotina: ' + error.message, true); return; }
  const weekData = data || [];

  /* Abas dos 7 dias */
  const dayTabsWrap = document.getElementById('rotina-day-tabs');
  dayTabsWrap.innerHTML = '';
  weekDates.forEach(dateStr => {
    const dayTasks = weekData.filter(t => t.task_date === dateStr);
    const hasFailed = dateStr < today && dayTasks.some(t => !t.completed);
    const isSelected = dateStr === state.rotinaSelectedDate;
    const isToday = dateStr === today;
    const btn = document.createElement('button');
    btn.className = `flex flex-col items-center rounded-lg py-2 transition-colors ${isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest border border-outline-variant text-on-surface-variant'}`;
    btn.innerHTML = `
      <span class="text-[10px] font-semibold uppercase">${dayLabelOf(dateStr)}</span>
      <span class="text-[14px] font-bold">${dateStr.slice(8, 10)}</span>
      ${isToday ? `<span class="w-1 h-1 rounded-full ${isSelected ? 'bg-on-primary' : 'bg-gold'} mt-0.5"></span>` : hasFailed ? `<span class="w-1 h-1 rounded-full bg-error mt-0.5"></span>` : '<span class="w-1 h-1 mt-0.5"></span>'}`;
    btn.addEventListener('click', () => { state.rotinaSelectedDate = dateStr; loadRotina(); });
    dayTabsWrap.appendChild(btn);
  });

  /* Card do dia selecionado */
  const selData = weekData.filter(t => t.task_date === state.rotinaSelectedDate);
  const done = selData.filter(t => t.completed).length;
  const total = selData.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const isTodaySelected = state.rotinaSelectedDate === today;
  const dayHeading = isTodaySelected ? 'Progresso do Dia' : `${dayLabelOf(state.rotinaSelectedDate)}, ${formatShortDate(state.rotinaSelectedDate)}`;
  document.getElementById('rotina-day-heading').textContent = dayHeading;
  document.getElementById('rotina-progress-label').textContent =
    (state.rotinaTab === 'casal' ? 'Vocês completaram ' : 'Você completou ') + `${done} de ${total} tarefas` + (isTodaySelected ? ' hoje.' : '.');
  document.getElementById('stat-done').textContent = done;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-pending').textContent = total - done;
  document.getElementById('rotina-pct').textContent = pct + '%';
  const ring = document.getElementById('rotina-ring');
  const circumference = 213.6;
  ring.setAttribute('stroke-dashoffset', circumference - (circumference * pct / 100));

  /* Gráfico da semana: concluídas x falhas por dia */
  const chartWrap = document.getElementById('rotina-week-chart');
  const labelsWrap = document.getElementById('rotina-week-chart-labels');
  chartWrap.innerHTML = '';
  labelsWrap.innerHTML = '';
  const maxCount = Math.max(1, ...weekDates.map(d => weekData.filter(t => t.task_date === d).length));
  weekDates.forEach(dateStr => {
    const dayTasks = weekData.filter(t => t.task_date === dateStr);
    const doneCount = dayTasks.filter(t => t.completed).length;
    const failedCount = dateStr < today ? dayTasks.filter(t => !t.completed).length : 0;
    const doneH = Math.round((doneCount / maxCount) * 100);
    const failH = Math.round((failedCount / maxCount) * 100);
    const col = document.createElement('div');
    col.className = 'flex items-end justify-center gap-0.5 h-full';
    col.innerHTML = `
      <div class="w-2 rounded-t bg-gold transition-all" style="height:${doneCount ? Math.max(doneH, 6) : 0}%" title="${doneCount} concluída(s)"></div>
      <div class="w-2 rounded-t bg-error transition-all" style="height:${failedCount ? Math.max(failH, 6) : 0}%" title="${failedCount} falha(s)"></div>`;
    chartWrap.appendChild(col);
    const lbl = document.createElement('div');
    lbl.className = `text-[10px] font-semibold ${dateStr === state.rotinaSelectedDate ? 'text-gold' : 'text-on-surface-variant'}`;
    lbl.textContent = dayLabelOf(dateStr)[0];
    labelsWrap.appendChild(lbl);
  });

  /* Lista de tarefas do dia selecionado, ordenada por horário */
  const container = document.getElementById('rotina-tasks');
  container.innerHTML = '';
  const owner = state.rotinaTab === 'casal';
  const sorted = [...selData].sort((a, b) => (a.task_time || '99:99').localeCompare(b.task_time || '99:99'));
  const comHorario = sorted.filter(t => t.task_time);
  const semHorario = sorted.filter(t => !t.task_time);

  if (comHorario.length) {
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-sm';
    comHorario.forEach(t => grid.appendChild(taskCard(t, owner)));
    container.appendChild(grid);
  }
  if (semHorario.length) {
    const section = document.createElement('section');
    section.className = 'mt-lg';
    section.innerHTML = `<h3 class="font-headline-md text-[15px] text-on-surface-variant mb-2">Sem horário definido</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-sm" data-sh></div>`;
    const grid = section.querySelector('[data-sh]');
    semHorario.forEach(t => grid.appendChild(taskCard(t, owner)));
    container.appendChild(section);
  }
  if (!selData.length) {
    container.innerHTML = '<p class="text-on-surface-variant font-body-md text-center py-8">✨ Dia livre por aqui!<br/>Nenhuma tarefa neste dia — toque em + para planejar.</p>';
  }
}

on('rotina-week-prev', 'click', () => { state.rotinaWeekOffset -= 1; state.rotinaSelectedDate = null; loadRotina(); });
on('rotina-week-next', 'click', () => { state.rotinaWeekOffset += 1; state.rotinaSelectedDate = null; loadRotina(); });

function taskCard(t, showOwner) {
  const owner = profileById(t.owner);
  const acc = accentClasses(owner ? owner.accent : 'primary');
  const div = document.createElement('div');
  div.className = `bg-surface-container-lowest rounded-lg p-sm border border-outline-variant shadow-sm flex items-center justify-between transition-opacity ${t.completed ? 'opacity-70' : ''}`;
  const timeLabel = t.task_time ? t.task_time.slice(0, 5) : null;
  div.innerHTML = `
    <div class="flex items-center gap-sm">
      <button class="check-btn w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${t.completed ? 'bg-secondary border-secondary text-on-secondary' : 'border-outline-variant'}">
        ${t.completed ? '<span class="material-symbols-outlined text-[16px]">check</span>' : ''}
      </button>
      ${timeLabel ? `<span class="font-label-sm text-[12px] font-bold ${t.completed ? 'text-on-surface-variant' : 'text-gold'} shrink-0">${timeLabel}</span>` : ''}
      <span class="font-body-md text-body-md ${t.completed ? 'line-through text-on-surface-variant' : 'text-on-background font-medium'}">${t.title}</span>
    </div>
    <div class="flex items-center gap-2">
      ${showOwner && owner ? `<div class="w-6 h-6 rounded-full ${acc.dot} text-black flex items-center justify-center font-label-sm text-[10px] font-bold">${owner.name[0]}</div>` : ''}
      <button class="edit-task-btn w-8 h-8 flex items-center justify-center text-outline hover:text-gold transition-colors shrink-0"><span class="material-symbols-outlined text-[18px]">edit</span></button>
      <button class="del-btn w-8 h-8 flex items-center justify-center text-outline hover:text-error transition-colors shrink-0"><span class="material-symbols-outlined text-[18px]">delete</span></button>
    </div>
  `;
  div.querySelector('.edit-task-btn').addEventListener('click', () => openTaskModal('edit', t));
  div.querySelector('.del-btn').addEventListener('click', async () => {
    if (!(await confirmDialog('Excluir esta tarefa?'))) return;
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

let taskModalMode = 'create';
let taskModalEditId = null;

function openTaskModal(mode, task) {
  taskModalMode = mode;
  taskModalEditId = mode === 'edit' ? task.id : null;
  const d = state.rotinaSelectedDate || todayLocal();
  const isToday = d === todayLocal();
  document.getElementById('task-modal-title').textContent = mode === 'edit' ? 'Editar Tarefa' : 'Nova Tarefa';
  document.getElementById('task-modal-submit').textContent = mode === 'edit' ? 'Salvar' : 'Adicionar';
  document.getElementById('task-modal-day').textContent = mode === 'edit'
    ? '' : `Será adicionada em: ${isToday ? 'hoje' : dayLabelOf(d) + ', ' + formatShortDate(d)}`;
  document.getElementById('task-title').value = mode === 'edit' ? task.title : '';
  document.getElementById('task-time').value = mode === 'edit' ? (task.task_time || '').slice(0, 5) : '';
  document.getElementById('task-visibility').value = mode === 'edit' ? task.visibility : 'individual';
  openModal('modal-task');
}

on('add-task-btn', 'click', () => openTaskModal('create'));
on('form-task', 'submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('task-title').value.trim();
  const task_time = document.getElementById('task-time').value;
  const visibility = document.getElementById('task-visibility').value;
  if (!title || !task_time) return;

  const { error } = taskModalMode === 'edit'
    ? await sb.from('routine_tasks').update({ title, task_time, visibility }).eq('id', taskModalEditId)
    : await sb.from('routine_tasks').insert({ title, task_time, visibility, owner: state.currentProfile, task_date: state.rotinaSelectedDate || todayLocal() });

  closeModals();
  document.getElementById('form-task').reset();
  if (error) { toast('Erro ao salvar tarefa: ' + error.message, true); return; }
  toast(taskModalMode === 'edit' ? 'Tarefa atualizada' : 'Tarefa adicionada');
  loadRotina();
});

/* ---------------- FINANÇAS ---------------- */

function renderFinancasTabs() {
  const wrap = document.getElementById('financas-tabs');
  const tabs = coupleTabList();
  wrap.innerHTML = '';
  tabs.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab-pill' + (state.financasTab === t.id ? ' active' : '');
    btn.textContent = t.name;
    btn.addEventListener('click', () => { state.financasTab = t.id; loadFinancas(); });
    wrap.appendChild(btn);
  });
}

/* Mapa de meses abreviados em português, para interpretar prazos como "Out 2026" */
const MONTH_ABBR = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };

function parseDeadline(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase();

  // Formato DD/MM/AAAA ou DD-MM-AAAA
  let m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const month = Number(m[2]) - 1;
    if (month >= 0 && month <= 11) return { year: Number(m[3]), month };
  }

  // Formato MM/AAAA ou MM-AAAA
  m = t.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const month = Number(m[1]) - 1;
    if (month >= 0 && month <= 11) return { year: Number(m[2]), month };
  }

  // Formato "Out 2026", "Outubro/2026", "dez-2026" etc.
  m = t.match(/([a-zç]{3})\w*[\s/\-]+(\d{4})/);
  if (m && m[1] in MONTH_ABBR) return { year: Number(m[2]), month: MONTH_ABBR[m[1]] };

  return null;
}

function monthsUntil(deadline) {
  const now = new Date();
  const diff = (deadline.year * 12 + deadline.month) - (now.getFullYear() * 12 + now.getMonth());
  return diff;
}

function monthRangeStrings(offset = 0) {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + offset);
  const year = base.getFullYear(), month = base.getMonth();
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;
  return { start, end };
}

async function loadFinancas() {
  renderFinancasTabs();
  const isCasal = state.financasTab === 'casal';

  let txQuery = sb.from('finance_transactions').select('*').order('tx_date', { ascending: false }).limit(200);
  txQuery = isCasal ? txQuery.eq('scope', 'casal') : txQuery.eq('owner', state.financasTab);
  const { data: allTxs } = await txQuery;
  const txs = allTxs || [];

  let goalQuery = sb.from('finance_goals').select('*').order('created_at');
  goalQuery = isCasal ? goalQuery.eq('scope', 'casal') : goalQuery.eq('scope', state.financasTab);
  const { data: goals } = await goalQuery;

  const signed = (t) => t.type === 'entrada' ? Number(t.amount) : -Number(t.amount);
  const total = txs.reduce((s, t) => s + signed(t), 0);
  document.getElementById('financas-balance-label').textContent = isCasal ? 'SALDO CONJUNTO' : `SALDO — ${profileById(state.financasTab).name.toUpperCase()}`;
  document.getElementById('financas-balance').textContent = (total < 0 ? '-R$ ' : 'R$ ') + money(Math.abs(total));

  /* Tendência real: gastos (saídas) deste mês x mês passado */
  const thisMonth = monthRangeStrings(0), lastMonth = monthRangeStrings(-1);
  const sumSaidasInRange = (r) => txs.filter(t => t.type === 'saida' && t.tx_date >= r.start && t.tx_date <= r.end).reduce((s, t) => s + Number(t.amount), 0);
  const thisMonthSum = sumSaidasInRange(thisMonth), lastMonthSum = sumSaidasInRange(lastMonth);
  const trendEl = document.getElementById('financas-trend');
  if (lastMonthSum > 0) {
    const pctChange = Math.round(((thisMonthSum - lastMonthSum) / lastMonthSum) * 100);
    trendEl.textContent = (pctChange <= 0 ? '📉 ' + Math.abs(pctChange) + '% a menos' : '📈 ' + pctChange + '% a mais') + ' que mês passado';
    trendEl.classList.remove('hidden');
  } else {
    trendEl.classList.add('hidden');
  }

  const contribBox = document.getElementById('financas-contrib');
  if (isCasal && state.partner) {
    contribBox.classList.remove('hidden');
    const { data: allTx } = await sb.from('finance_transactions').select('owner, amount, type').eq('scope', 'casal').eq('type', 'saida');
    const byOwner = {};
    state.profiles.forEach(p => byOwner[p.id] = 0);
    (allTx || []).forEach(t => byOwner[t.owner] = (byOwner[t.owner] || 0) + Number(t.amount));
    const sum = Object.values(byOwner).reduce((a, b) => a + b, 0) || 1;
    const [p1, p2] = [profileById(state.currentProfile), state.partner].sort((a, b) => a.id.localeCompare(b.id));
    const pct1 = Math.round((byOwner[p1.id] / sum) * 100);
    const pct2 = Math.round((byOwner[p2.id] / sum) * 100);
    document.getElementById('financas-bar-lucas').style.width = pct1 + '%';
    document.getElementById('financas-bar-mariana').style.width = pct2 + '%';
    document.getElementById('financas-pct-lucas').textContent = `${p1.name} (${pct1}%)`;
    document.getElementById('financas-pct-mariana').textContent = `${p2.name} (${pct2}%)`;
  } else {
    contribBox.classList.add('hidden');
  }

  /* "Podemos gastar?" — só faz sentido na visão do casal, e só com renda cadastrada */
  const pgWrap = document.getElementById('financas-podemos-gastar');
  if (isCasal) {
    await renderPodemosGastar(pgWrap, txs, goals || [], thisMonth);
    pgWrap.classList.remove('hidden');
  } else {
    pgWrap.classList.add('hidden');
  }

  const goalsWrap = document.getElementById('financas-goals');
  goalsWrap.innerHTML = '';
  (goals || []).forEach(g => goalsWrap.appendChild(goalCard(g)));
  if (!goals || !goals.length) {
    goalsWrap.innerHTML = '<p class="text-on-surface-variant font-body-md text-[14px] text-center py-4">🎯 Vocês ainda não têm uma meta.<br/>Criem a primeira e comecem a construir seus planos juntos.</p>';
  }

  renderDonutChart(txs.filter(t => t.type === 'saida' && t.tx_date >= thisMonth.start && t.tx_date <= thisMonth.end));
  renderTransactionList(txs);
}

function renderTransactionList(txs) {
  const catFilter = document.getElementById('tx-category-filter');
  const currentCat = catFilter.value;
  const categories = [...new Set(txs.map(t => t.category).filter(Boolean))].sort();
  catFilter.innerHTML = '<option value="">Todas categorias</option>' + categories.map(c => `<option value="${c}">${c}</option>`).join('');
  catFilter.value = categories.includes(currentCat) ? currentCat : '';

  const renderFiltered = () => {
    const q = document.getElementById('tx-search').value.trim().toLowerCase();
    const cat = document.getElementById('tx-category-filter').value;
    const filtered = txs.filter(t =>
      (!q || t.description.toLowerCase().includes(q)) &&
      (!cat || t.category === cat)
    ).slice(0, 30);

    const txWrap = document.getElementById('financas-transactions');
    txWrap.innerHTML = '';
    filtered.forEach(t => {
      const owner = profileById(t.owner);
      const isEntrada = t.type === 'entrada';
      const row = document.createElement('div');
      row.className = 'bg-surface-container-lowest rounded-lg p-sm border border-outline-variant shadow-sm flex items-center justify-between';
      row.innerHTML = `
        <div class="flex items-center gap-sm">
          <div class="w-9 h-9 rounded-lg ${isEntrada ? 'bg-secondary-container text-secondary' : 'bg-surface-container-low text-primary'} flex items-center justify-center"><span class="material-symbols-outlined text-[18px]">${isEntrada ? 'arrow_upward' : 'arrow_downward'}</span></div>
          <div>
            <div class="font-body-md text-[14px] font-medium">${t.description}</div>
            <div class="font-label-sm text-label-sm text-on-surface-variant">${owner ? owner.name : ''}${t.category ? ' • ' + t.category : ''}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="font-headline-md text-[15px] font-bold ${isEntrada ? 'text-secondary' : 'text-on-background'}">${isEntrada ? '+' : '-'} R$ ${money(t.amount)}</div>
          <button class="edit-tx-btn w-8 h-8 flex items-center justify-center text-outline hover:text-gold transition-colors shrink-0"><span class="material-symbols-outlined text-[18px]">edit</span></button>
          <button class="del-tx-btn w-8 h-8 flex items-center justify-center text-outline hover:text-error transition-colors shrink-0"><span class="material-symbols-outlined text-[18px]">delete</span></button>
        </div>`;
      row.querySelector('.edit-tx-btn').addEventListener('click', () => openTxModal('edit', t));
      row.querySelector('.del-tx-btn').addEventListener('click', async () => {
        if (!(await confirmDialog('Excluir esta transação?'))) return;
        const { error } = await sb.from('finance_transactions').delete().eq('id', t.id);
        if (error) { toast('Erro ao excluir: ' + error.message, true); return; }
        loadFinancas();
      });
      txWrap.appendChild(row);
    });
    if (!filtered.length) {
      txWrap.innerHTML = txs.length
        ? '<p class="text-on-surface-variant font-body-md text-[14px] text-center py-4">Nenhuma transação encontrada com esse filtro.</p>'
        : '<p class="text-on-surface-variant font-body-md text-[14px] text-center py-4">💰 Nenhuma transação registrada ainda.<br/>Adicione a primeira tocando no botão +.</p>';
    }
  };

  document.getElementById('tx-search').oninput = renderFiltered;
  document.getElementById('tx-category-filter').onchange = renderFiltered;
  renderFiltered();
}

/* Gráfico de rosca: distribuição dos gastos do mês por categoria */
function renderDonutChart(monthTxs) {
  const wrap = document.getElementById('financas-donut');
  if (!monthTxs.length) {
    wrap.innerHTML = '<p class="text-on-surface-variant font-body-md text-[13px]">Sem despesas registradas este mês ainda.</p>';
    return;
  }
  const byCat = {};
  monthTxs.forEach(t => { const c = t.category || 'Outros'; byCat[c] = (byCat[c] || 0) + Number(t.amount); });
  const total = Object.values(byCat).reduce((a, b) => a + b, 0) || 1;
  const colors = ['#D4AF37', '#9ca3af', '#F5E0A3', '#71717a', '#AA7C11', '#52525b', '#e5c158'];
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  const r = 40, circumference = 2 * Math.PI * r;
  let offset = 0;
  const segments = entries.map(([cat, val], i) => {
    const frac = val / total;
    const seg = `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="16"
      stroke-dasharray="${frac * circumference} ${circumference}" stroke-dashoffset="${-offset}" transform="rotate(-90 50 50)"/>`;
    offset += frac * circumference;
    return seg;
  }).join('');

  const legend = entries.map(([cat, val], i) => `
    <div class="flex items-center justify-between text-[13px] mb-1">
      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${colors[i % colors.length]}"></span>${cat}</span>
      <span class="text-on-surface-variant">R$ ${money(val)} (${Math.round((val / total) * 100)}%)</span>
    </div>`).join('');

  wrap.innerHTML = `
    <svg viewBox="0 0 100 100" class="w-28 h-28 shrink-0">${segments}</svg>
    <div class="flex-1">${legend}</div>`;
}

/* "Podemos gastar?" — cálculo real com renda, contas fixas, despesas e metas do casal */
async function renderPodemosGastar(wrap, casalTxs, casalGoals, thisMonth) {
  const p1 = profileById(state.currentProfile), p2 = state.partner;
  if (!p2) {
    wrap.className = 'bg-surface-container-lowest rounded-lg p-md border border-outline-variant shadow-sm mb-5';
    wrap.innerHTML = `<p class="font-body-md text-[14px] text-on-surface-variant text-center">🔗 Vinculem as contas em <b>Perfil → Vincular Conta</b> para ativar essa área.</p>`;
    return;
  }
  const income = (Number(p1 && p1.monthly_income) || 0) + (Number(p2 && p2.monthly_income) || 0);
  const hasIncome = (p1 && p1.monthly_income) || (p2 && p2.monthly_income);

  if (!hasIncome) {
    wrap.className = 'bg-surface-container-lowest rounded-lg p-md border border-outline-variant shadow-sm mb-5';
    wrap.innerHTML = `<p class="font-body-md text-[14px] text-on-surface-variant text-center">💡 Cadastrem a renda mensal de vocês em <b>Perfil → Editar meu perfil</b> para ativar o cálculo de quanto podem gastar.</p>`;
    return;
  }

  const despesasMes = casalTxs.filter(t => t.type === 'saida' && t.tx_date >= thisMonth.start && t.tx_date <= thisMonth.end).reduce((s, t) => s + Number(t.amount), 0);
  const receitaExtraMes = casalTxs.filter(t => t.type === 'entrada' && t.tx_date >= thisMonth.start && t.tx_date <= thisMonth.end).reduce((s, t) => s + Number(t.amount), 0);

  const { data: fes } = await sb.from('fixed_expenses').select('*').eq('scope', 'casal').eq('active', true);
  let contasPendentes = 0;
  if (fes && fes.length) {
    const { data: insts } = await sb.from('fixed_expense_installments').select('amount, paid, due_date').in('fixed_expense_id', fes.map(f => f.id)).eq('paid', false).lte('due_date', thisMonth.end);
    contasPendentes = (insts || []).reduce((s, i) => s + Number(i.amount), 0);
  }

  let metaContrib = 0;
  casalGoals.forEach(g => {
    const dl = parseDeadline(g.deadline);
    if (!dl) return;
    const months = monthsUntil(dl);
    if (months > 0) metaContrib += Math.max(0, Number(g.target_amount) - Number(g.current_amount)) / months;
  });

  const disponivel = income + receitaExtraMes - despesasMes - contasPendentes - metaContrib;
  wrap.className = `rounded-lg p-md border shadow-sm mb-5 relative overflow-hidden ${disponivel >= 0 ? 'bg-surface-container-lowest border-outline-variant' : 'bg-error-container border-error'}`;
  wrap.innerHTML = `
    <div class="flex items-center gap-2 mb-1">
      <span class="material-symbols-outlined ${disponivel >= 0 ? 'text-gold' : 'text-error'}">${disponivel >= 0 ? 'trending_up' : 'warning'}</span>
      <span class="font-label-sm text-label-sm uppercase ${disponivel >= 0 ? 'text-on-surface-variant' : 'text-error'}">${disponivel >= 0 ? 'Podemos gastar' : 'Atenção'}</span>
    </div>
    <div class="font-stats-display text-[30px] font-extrabold ${disponivel >= 0 ? 'grad-gold-text' : 'text-error'}">R$ ${money(Math.abs(disponivel))}</div>
    <p class="font-body-md text-[13px] text-on-surface-variant mt-1">
      ${disponivel >= 0
        ? 'Esse é o valor estimado que vocês podem gastar até o final do mês sem comprometer as contas e metas cadastradas.'
        : `Vocês estão R$ ${money(Math.abs(disponivel))} acima do orçamento planejado para este mês.`}
    </p>`;
}

function goalCard(g) {
  const pct = g.target_amount ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)) : 0;
  const div = document.createElement('div');
  div.className = 'bg-surface-container-lowest rounded-lg p-sm border border-outline-variant shadow-sm';
  const remaining = Math.max(0, Number(g.target_amount) - Number(g.current_amount));
  const dl = parseDeadline(g.deadline);
  const months = dl ? monthsUntil(dl) : null;
  const suggestion = (months && months > 0 && remaining > 0)
    ? `<p class="font-label-sm text-label-sm text-gold mt-1">💡 Guardando ~R$ ${money(remaining / months)}/mês, vocês atingem essa meta no prazo.</p>` : '';
  div.innerHTML = `
    <div class="flex justify-between items-start mb-2">
      <div class="w-9 h-9 rounded-lg bg-primary-fixed flex items-center justify-center text-on-primary-fixed-variant"><span class="material-symbols-outlined text-[18px]">${g.icon || 'savings'}</span></div>
      ${g.deadline ? `<span class="text-label-sm bg-surface-container-low rounded-full px-2 py-0.5">${g.deadline}</span>` : ''}
    </div>
    <div class="font-body-md font-semibold text-[15px]">${g.title}</div>
    <div class="font-label-sm text-label-sm text-on-surface-variant mb-2">R$ ${money(g.current_amount)} de R$ ${money(g.target_amount)}</div>
    <div class="w-full h-2 rounded-full bg-surface-container-low overflow-hidden mb-2"><div class="h-full bg-primary" style="width:${pct}%"></div></div>
    ${suggestion}
    <div class="flex justify-end gap-1">
      <button class="goal-edit-btn w-7 h-7 flex items-center justify-center text-outline hover:text-gold hover:bg-surface-container-low rounded-full transition-colors" title="Editar meta"><span class="material-symbols-outlined text-[16px]">edit</span></button>
      <button class="goal-add-btn w-7 h-7 flex items-center justify-center text-primary hover:bg-surface-container-low rounded-full transition-colors" title="Adicionar valor guardado"><span class="material-symbols-outlined text-[16px]">add_circle</span></button>
      <button class="goal-del-btn w-7 h-7 flex items-center justify-center text-outline hover:text-error hover:bg-surface-container-low rounded-full transition-colors" title="Excluir meta"><span class="material-symbols-outlined text-[16px]">delete</span></button>
    </div>`;
  div.querySelector('.goal-edit-btn').addEventListener('click', () => openGoalModal('edit', g));
  div.querySelector('.goal-add-btn').addEventListener('click', async () => {
    const val = await promptValue(`Quanto a mais vocês guardaram para "${g.title}"? (R$)`);
    if (val === null) return;
    const { error } = await sb.from('finance_goals').update({ current_amount: Number(g.current_amount) + val }).eq('id', g.id);
    if (error) { toast('Erro ao atualizar meta: ' + error.message, true); return; }
    toast('Meta atualizada');
    if (state.currentView === 'financas') loadFinancas();
    if (state.currentView === 'casal') loadCasal();
  });
  div.querySelector('.goal-del-btn').addEventListener('click', async () => {
    if (!(await confirmDialog(`Excluir a meta "${g.title}"?`))) return;
    const { error } = await sb.from('finance_goals').delete().eq('id', g.id);
    if (error) { toast('Erro ao excluir: ' + error.message, true); return; }
    if (state.currentView === 'financas') loadFinancas();
    if (state.currentView === 'casal') loadCasal();
  });
  return div;
}

let txModalMode = 'create';
let txModalEditId = null;

function openTxModal(mode, tx) {
  txModalMode = mode;
  txModalEditId = mode === 'edit' ? tx.id : null;
  document.getElementById('tx-modal-title').textContent = mode === 'edit' ? 'Editar Transação' : 'Nova Transação';
  document.getElementById('tx-modal-submit').textContent = mode === 'edit' ? 'Salvar' : 'Adicionar';
  document.getElementById('tx-desc').value = mode === 'edit' ? tx.description : '';
  document.getElementById('tx-amount').value = mode === 'edit' ? tx.amount : '';
  document.getElementById('tx-category').value = mode === 'edit' ? (tx.category || '') : '';
  document.getElementById('tx-scope').value = mode === 'edit' ? tx.scope : 'individual';
  document.querySelector(`input[name="tx-type"][value="${mode === 'edit' ? tx.type : 'saida'}"]`).checked = true;
  openModal('modal-tx');
}

on('add-tx-btn', 'click', () => openTxModal('create'));
on('form-tx', 'submit', async (e) => {
  e.preventDefault();
  const description = document.getElementById('tx-desc').value.trim();
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const category = document.getElementById('tx-category').value.trim();
  const scope = document.getElementById('tx-scope').value;
  const type = document.querySelector('input[name="tx-type"]:checked').value;
  if (!description || isNaN(amount)) return;

  const { error } = txModalMode === 'edit'
    ? await sb.from('finance_transactions').update({ description, amount, category, scope, type }).eq('id', txModalEditId)
    : await sb.from('finance_transactions').insert({ description, amount, category, scope, type, owner: state.currentProfile, tx_date: todayLocal() });

  closeModals();
  document.getElementById('form-tx').reset();
  if (error) { toast('Erro ao salvar transação: ' + error.message, true); return; }
  toast(txModalMode === 'edit' ? 'Transação atualizada' : 'Transação adicionada');
  loadFinancas();
});

/* ---------------- DESPESAS FIXAS ---------------- */

function renderFixasTabs() {
  const wrap = document.getElementById('fixas-tabs');
  const tabs = coupleTabList();
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
  abertas.forEach(i => abertasWrap.appendChild(installmentCard(i, feById[i.fixed_expense_id], i.due_date === today ? 'vence-hoje' : 'aberta')));
  if (!abertas.length) abertasWrap.innerHTML = '<p class="text-on-surface-variant font-body-md text-[14px] text-center py-3">💰 Nenhuma conta em aberto.<br/>Adicione um financiamento ou conta recorrente tocando em +.</p>';

  const pagasWrap = document.getElementById('fixas-pagas');
  pagasWrap.innerHTML = '';
  pagas.forEach(i => pagasWrap.appendChild(installmentCard(i, feById[i.fixed_expense_id], 'paga')));
  if (!pagas.length) pagasWrap.innerHTML = '<p class="text-on-surface-variant font-body-md text-[14px]">Nenhum pagamento registrado ainda.</p>';
}

function installmentCard(i, fe, status) {
  const div = document.createElement('div');
  const borderColor = status === 'atrasada' ? 'border-error' : status === 'paga' ? 'border-secondary' : status === 'vence-hoje' ? 'border-gold' : 'border-outline-variant';
  div.className = `bg-surface-container-lowest rounded-lg p-sm border ${borderColor} shadow-sm flex items-center justify-between`;
  const [y, m, d] = i.due_date.split('-');
  const parcelaLabel = i.installment_number ? `Parcela ${i.installment_number}${fe && fe.total_installments ? ' de ' + fe.total_installments : ''}` : `Venc. ${d}/${m}/${y}`;
  const statusText = status === 'atrasada' ? ' (atrasada)' : status === 'vence-hoje' ? ' (vence hoje)' : '';
  div.innerHTML = `
    <div>
      <div class="font-body-md text-[14px] font-semibold">${fe ? fe.title : ''}</div>
      <div class="font-label-sm text-label-sm ${status === 'atrasada' ? 'text-error' : status === 'vence-hoje' ? 'text-gold' : 'text-on-surface-variant'}">${parcelaLabel} • ${d}/${m}/${y}${statusText}${status === 'paga' && i.paid_date ? ' • paga em ' + i.paid_date.split('-').reverse().join('/') : ''}</div>
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
    if (!(await confirmDialog('Excluir esta ocorrência?'))) return;
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

/* Sequência de dias seguidos com a rotina 100% concluída (olhando os últimos 30 dias) */
async function renderStreak(today, todayTotal, todayDone) {
  const badge = document.getElementById('casal-streak');
  const since = addDaysLocal(today, -30);
  const { data } = await sb.from('routine_tasks').select('task_date, completed').gte('task_date', since).lte('task_date', today);
  const byDay = {};
  (data || []).forEach(t => {
    if (!byDay[t.task_date]) byDay[t.task_date] = { total: 0, done: 0 };
    byDay[t.task_date].total++;
    if (t.completed) byDay[t.task_date].done++;
  });

  let cursor = today;
  let streak = 0;
  const todayFull = todayTotal > 0 && todayDone === todayTotal;
  if (!todayFull) cursor = addDaysLocal(today, -1);
  while (byDay[cursor] && byDay[cursor].total > 0 && byDay[cursor].done === byDay[cursor].total) {
    streak++;
    cursor = addDaysLocal(cursor, -1);
  }

  badge.textContent = streak > 0 ? `🔥 ${streak} dia${streak === 1 ? '' : 's'} seguido${streak === 1 ? '' : 's'}` : 'Esta Semana';
}

async function loadCasal() {
  const { data: casalTx } = await sb.from('finance_transactions').select('amount, type').eq('scope', 'casal');
  const balance = (casalTx || []).reduce((s, t) => s + (t.type === 'entrada' ? Number(t.amount) : -Number(t.amount)), 0);
  document.getElementById('casal-balance').textContent = (balance < 0 ? '-' : '') + money(Math.abs(balance));

  const today = todayLocal();
  const { data: tasks } = await sb.from('routine_tasks').select('*').eq('task_date', today);
  const total = (tasks || []).length;
  const done = (tasks || []).filter(t => t.completed).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('casal-tasks-label').textContent = `${done} de ${total} tarefas concluídas`;
  await renderStreak(today, total, done);
  document.getElementById('casal-tasks-pct').textContent = pct + '%';

  const p1 = profileById(state.currentProfile), p2 = state.partner;
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
  if (!goals || !goals.length) {
    goalsWrap.innerHTML = '<p class="text-on-surface-variant font-body-md text-[14px] text-center py-4 col-span-2">🎯 Vocês ainda não têm uma meta.<br/>Criem a primeira e comecem a construir seus planos juntos.</p>';
  }

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
  if (!state.partner) { toast('Vincule a conta do seu par em Perfil primeiro'); return; }
  openModal('modal-nudge');
});
on('form-nudge', 'submit', async (e) => {
  e.preventDefault();
  const message = document.getElementById('nudge-msg').value.trim();
  if (!message) return;
  const other = state.partner;
  if (!other) { toast('Vincule a conta do seu par primeiro'); closeModals(); return; }
  const { error } = await sb.from('nudges').insert({ from_profile: state.currentProfile, to_profile: other.id, message });
  closeModals();
  document.getElementById('form-nudge').reset();
  if (error) { toast('Erro ao enviar recado: ' + error.message, true); return; }
  toast('Recado enviado 💌');
  loadCasal();
});

let goalModalMode = 'create';
let goalModalEditId = null;

function openGoalModal(mode, g) {
  goalModalMode = mode;
  goalModalEditId = mode === 'edit' ? g.id : null;
  document.getElementById('goal-modal-title').textContent = mode === 'edit' ? 'Editar Meta' : 'Nova Meta';
  document.getElementById('goal-modal-submit').textContent = mode === 'edit' ? 'Salvar' : 'Criar meta';
  document.getElementById('goal-title').value = mode === 'edit' ? g.title : '';
  document.getElementById('goal-icon').value = mode === 'edit' ? (g.icon || 'savings') : 'savings';
  document.getElementById('goal-target').value = mode === 'edit' ? g.target_amount : '';
  document.getElementById('goal-current').value = mode === 'edit' ? g.current_amount : '';
  document.getElementById('goal-deadline').value = mode === 'edit' ? (g.deadline || '') : '';
  openModal('modal-goal');
}

onAll('.add-goal-btn', 'click', function () {
  document.getElementById('form-goal').dataset.forceCasal = this.dataset.scope === 'casal' ? '1' : '';
  openGoalModal('create');
});
on('form-goal', 'submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('goal-title').value.trim();
  const icon = document.getElementById('goal-icon').value;
  const target_amount = parseFloat(document.getElementById('goal-target').value);
  const current_amount = parseFloat(document.getElementById('goal-current').value) || 0;
  const deadline = document.getElementById('goal-deadline').value.trim();
  if (!title || isNaN(target_amount)) return;

  let error;
  if (goalModalMode === 'edit') {
    ({ error } = await sb.from('finance_goals').update({ title, icon, target_amount, current_amount, deadline }).eq('id', goalModalEditId));
  } else {
    const forceCasal = e.target.dataset.forceCasal === '1';
    const scope = forceCasal ? 'casal' : state.financasTab;
    ({ error } = await sb.from('finance_goals').insert({ title, icon, target_amount, current_amount, deadline, scope }));
  }

  closeModals();
  e.target.reset();
  if (error) { toast('Erro ao salvar meta: ' + error.message, true); return; }
  toast(goalModalMode === 'edit' ? 'Meta atualizada' : 'Meta criada');
  if (state.currentView === 'financas') loadFinancas();
  if (state.currentView === 'casal') loadCasal();
});

/* ---------------- RESUMO DO MÊS (PERFIL) ---------------- */

function renderPerfilMonthTabs() {
  const wrap = document.getElementById('perfil-month-tabs');
  const tabs = coupleTabList();
  wrap.innerHTML = '';
  tabs.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab-pill' + (state.perfilMonthTab === t.id ? ' active' : '');
    btn.textContent = t.name;
    btn.addEventListener('click', () => { state.perfilMonthTab = t.id; loadPerfilSummary(); });
    wrap.appendChild(btn);
  });
}

/* ---------------- VINCULAR CONTA ---------------- */

function renderLinkBox() {
  const box = document.getElementById('perfil-link-box');
  const self = profileById(state.currentProfile);
  const partner = state.partner;
  const explicit = !!self.linked_partner_id;

  if (partner) {
    box.innerHTML = `
      <div class="flex items-center gap-3 mb-3">
        <img src="${partner.avatar_url}" class="w-12 h-12 rounded-full object-cover" alt="${partner.name}"/>
        <div class="flex-1">
          <div class="font-body-md text-[15px] font-semibold">${partner.name}</div>
          <div class="font-label-sm text-label-sm text-gold">🔗 ${explicit ? 'Vinculado' : 'Vinculado automaticamente'}</div>
        </div>
      </div>
      ${explicit ? '<button id="unlink-btn" class="w-full rounded-full border border-error text-error p-sm font-body-md text-[13px] font-semibold">Desvincular</button>' : '<p class="font-label-sm text-label-sm text-on-surface-variant">Únicos dois perfis cadastrados — por isso já ficaram vinculados automaticamente.</p>'}
    `;
    const unlinkBtn = document.getElementById('unlink-btn');
    if (unlinkBtn) unlinkBtn.addEventListener('click', async () => {
      if (!(await confirmDialog(`Desvincular sua conta da de ${partner.name}?`))) return;
      const { error: e1 } = await sb.from('profiles').update({ linked_partner_id: null }).eq('id', self.id);
      const { error: e2 } = await sb.from('profiles').update({ linked_partner_id: null }).eq('id', partner.id);
      if (e1 || e2) { toast('Erro ao desvincular: ' + (e1 || e2).message, true); return; }
      toast('Contas desvinculadas');
      await refreshProfilesAndPartner();
      renderLinkBox();
    });
    return;
  }

  const others = state.profiles.filter(p => p.id !== self.id);
  if (!others.length) {
    box.innerHTML = `<p class="font-body-md text-[14px] text-on-surface-variant text-center">Peça para seu par criar o perfil dele(a) na tela de login — depois disso vocês poderão se vincular aqui.</p>`;
    return;
  }
  box.innerHTML = others.map(p => `
    <div class="flex items-center justify-between gap-3 ${p !== others[others.length - 1] ? 'mb-3' : ''}">
      <div class="flex items-center gap-3">
        <img src="${p.avatar_url}" class="w-10 h-10 rounded-full object-cover" alt="${p.name}"/>
        <span class="font-body-md text-[14px] font-medium">${p.name}</span>
      </div>
      <button data-link-id="${p.id}" class="link-btn shine-btn rounded-full bg-primary text-on-primary px-4 py-1.5 font-body-md text-[13px] font-semibold">Vincular</button>
    </div>`).join('');
  box.querySelectorAll('.link-btn').forEach(btn => btn.addEventListener('click', async () => {
    const partnerId = btn.dataset.linkId;
    const { error: e1 } = await sb.from('profiles').update({ linked_partner_id: partnerId }).eq('id', self.id);
    const { error: e2 } = await sb.from('profiles').update({ linked_partner_id: self.id }).eq('id', partnerId);
    if (e1 || e2) { toast('Erro ao vincular: ' + (e1 || e2).message, true); return; }
    toast('Contas vinculadas! 🔗');
    await refreshProfilesAndPartner();
    renderLinkBox();
  }));
}

async function loadPerfilSummary() {
  if (!state.perfilMonthTab) state.perfilMonthTab = state.currentProfile;
  renderPerfilMonthTabs();

  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + state.perfilMonthOffset);
  const year = base.getFullYear();
  const month = base.getMonth(); // 0-11
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  document.getElementById('perfil-month-label').textContent = `${MONTH_LABELS[month]} ${year}`;

  let query = sb.from('routine_tasks').select('*').gte('task_date', monthStart).lte('task_date', monthEnd);
  if (state.perfilMonthTab !== 'casal') query = query.eq('owner', state.perfilMonthTab);
  const { data, error } = await query;
  if (error) { toast('Erro ao carregar resumo: ' + error.message, true); return; }
  const monthData = data || [];

  const today = todayLocal();
  const totalDone = monthData.filter(t => t.completed).length;
  const totalFailed = monthData.filter(t => !t.completed && t.task_date < today).length;
  const totalRelevant = totalDone + totalFailed;
  document.getElementById('perfil-month-done').textContent = totalDone;
  document.getElementById('perfil-month-failed').textContent = totalFailed;
  document.getElementById('perfil-month-pct').textContent = totalRelevant ? Math.round((totalDone / totalRelevant) * 100) + '%' : '—';

  /* Quebra por semana (segunda a domingo, recortada aos limites do mês) */
  const weeks = [];
  let cursor = mondayOf(monthStart);
  while (cursor <= monthEnd) {
    const weekEnd = addDaysLocal(cursor, 6);
    weeks.push({ start: cursor, end: weekEnd });
    cursor = addDaysLocal(cursor, 7);
  }

  const breakdown = document.getElementById('perfil-week-breakdown');
  breakdown.innerHTML = '';
  const csvRows = [];
  weeks.forEach((w, idx) => {
    const weekTasks = monthData.filter(t => t.task_date >= w.start && t.task_date <= w.end && t.task_date >= monthStart && t.task_date <= monthEnd);
    const done = weekTasks.filter(t => t.completed).length;
    const failed = weekTasks.filter(t => !t.completed && t.task_date < today).length;
    const relevant = done + failed;
    const pct = relevant ? Math.round((done / relevant) * 100) : null;
    csvRows.push({ semana: idx + 1, inicio: w.start, fim: w.end, concluidas: done, falhas: failed, taxa: pct === null ? '' : pct + '%' });
    const row = document.createElement('div');
    row.className = 'bg-surface-container-low rounded-lg p-sm';
    row.innerHTML = `
      <div class="flex justify-between items-center mb-1">
        <span class="font-body-md text-[13px] font-semibold">Semana ${idx + 1} (${formatShortDate(w.start)} – ${formatShortDate(w.end)})</span>
        <span class="font-label-sm text-label-sm text-on-surface-variant">${pct === null ? 'sem dados' : pct + '%'}</span>
      </div>
      <div class="w-full h-2 rounded-full bg-surface-container-high overflow-hidden flex">
        <div class="h-full bg-gold" style="width:${relevant ? (done / relevant) * 100 : 0}%"></div>
        <div class="h-full bg-error" style="width:${relevant ? (failed / relevant) * 100 : 0}%"></div>
      </div>
      <div class="flex gap-3 mt-1 text-label-sm text-on-surface-variant">
        <span>${done} concluída${done === 1 ? '' : 's'}</span>
        <span>${failed} falha${failed === 1 ? '' : 's'}</span>
      </div>`;
    breakdown.appendChild(row);
  });
  if (!weeks.length) {
    breakdown.innerHTML = '<p class="text-on-surface-variant font-body-md text-[14px]">Sem tarefas registradas neste mês.</p>';
  }

  state.perfilSummaryCache = { monthLabel: `${MONTH_LABELS[month]}_${year}`, rows: csvRows, totalDone, totalFailed };
}

on('export-csv-btn', 'click', () => {
  const cache = state.perfilSummaryCache;
  if (!cache || !cache.rows.length) { toast('Sem dados para exportar neste mês', true); return; }
  const header = 'Semana,Inicio,Fim,Concluidas,Falhas,Taxa\n';
  const body = cache.rows.map(r => `${r.semana},${r.inicio},${r.fim},${r.concluidas},${r.falhas},${r.taxa}`).join('\n');
  const footer = `\n\nTotal do mes,,,${cache.totalDone},${cache.totalFailed},`;
  const csv = header + body + footer;
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `velo_resumo_${cache.monthLabel}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

on('perfil-month-prev', 'click', () => { state.perfilMonthOffset -= 1; loadPerfilSummary(); });
on('perfil-month-next', 'click', () => { state.perfilMonthOffset += 1; loadPerfilSummary(); });

/* ---------------- MODALS ---------------- */

/* Substituem confirm()/prompt() nativos do navegador por modais no visual do app. */
function confirmDialog(message, okLabel) {
  return new Promise((resolve) => {
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-ok-btn').textContent = okLabel || 'Excluir';
    openModal('modal-confirm');
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    const backdrop = document.getElementById('modal-backdrop');
    function finish(result) {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      closeModals();
      resolve(result);
    }
    function onOk() { finish(true); }
    function onCancel() { finish(false); }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);
  });
}

function promptValue(message) {
  return new Promise((resolve) => {
    document.getElementById('value-modal-message').textContent = message;
    const input = document.getElementById('value-modal-input');
    input.value = '';
    openModal('modal-value');
    setTimeout(() => input.focus(), 50);
    const form = document.getElementById('value-modal-form');
    const cancelBtn = document.getElementById('value-modal-cancel-btn');
    const backdrop = document.getElementById('modal-backdrop');
    function finish(result) {
      form.removeEventListener('submit', onSubmit);
      cancelBtn.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      closeModals();
      resolve(result);
    }
    function onSubmit(e) {
      e.preventDefault();
      const val = parseFloat(input.value.replace(',', '.'));
      finish(isNaN(val) ? null : val);
    }
    function onCancel() { finish(null); }
    form.addEventListener('submit', onSubmit);
    cancelBtn.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);
  });
}

function openModal(id) {
  document.getElementById('modal-backdrop').classList.remove('hidden');
  document.getElementById('modal-backdrop').classList.add('flex');
  document.getElementById(id).classList.remove('hidden');
}
function closeModals() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.getElementById('modal-backdrop').classList.remove('flex');
  ['modal-task', 'modal-tx', 'modal-nudge', 'modal-profile', 'modal-goal', 'modal-fixed', 'modal-confirm', 'modal-value'].forEach(id => document.getElementById(id).classList.add('hidden'));
  const pw = document.getElementById('profile-password');
  if (pw) pw.value = '';
  const curPw = document.getElementById('profile-current-password');
  if (curPw) curPw.value = '';
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
  if (state.currentView === 'fixas') loadFixas();
  if (state.currentView === 'perfil') { renderLinkBox(); loadPerfilSummary(); }
}

async function refreshPartnerFromRealtime() {
  await refreshProfilesAndPartner();
  refreshCurrentView();
}

if (sb) {
  sb.channel('shared-calm-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'routine_tasks' }, refreshCurrentView)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fixed_expense_installments' }, refreshCurrentView)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fixed_expenses' }, refreshCurrentView)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_transactions' }, refreshCurrentView)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_goals' }, refreshCurrentView)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, refreshPartnerFromRealtime)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'nudges' }, () => {
      refreshCurrentView();
      if (state.currentView !== 'casal') toast('💌 Novo recado do seu par!');
    })
    .subscribe();
}

/* Registro do Service Worker — permite instalar o Velo na tela inicial do celular */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(err => {
      console.warn('[Velo] Service Worker não registrado:', err.message);
    });
  });
}
