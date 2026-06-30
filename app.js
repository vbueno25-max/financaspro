/* ============================================
   FinançasPro v2 — Main Application Logic
   ============================================ */
const SUPABASE_URL = 'https://bptshsgdlsbhmyxvyoza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwdHNoc2dkbHNiaG15eHZ5b3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NDUyMTMsImV4cCI6MjA5ODMyMTIxM30.bItBv4g589ePvFDDANRoN_udN5m2FQednlNdBwzcBGM';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


// ===== CONSTANTS =====
const ICON_POOL = [
    'wallet','briefcase','laptop','trending-up','utensils','home','car','heart',
    'book-open','gamepad-2','shopping-bag','gift','plane','coffee','music','shirt',
    'dumbbell','film','phone','credit-card','banknote','piggy-bank','building',
    'store','graduation-cap','stethoscope','scissors','star','globe','zap',
    'droplets','umbrella','shield','plus-circle','tags','receipt'
];
const COLOR_POOL = [
    '#10b981','#06b6d4','#8b5cf6','#6366f1','#f59e0b','#ef4444','#3b82f6',
    '#ec4899','#14b8a6','#a855f7','#64748b','#f97316','#84cc16','#e11d48',
    '#0ea5e9','#d946ef'
];
const DEFAULT_CATEGORIES = {
    income: [
        { id: 'salary', name: 'Salário', icon: 'briefcase', color: '#10b981' },
        { id: 'freelance', name: 'Freelance', icon: 'laptop', color: '#06b6d4' },
        { id: 'investments', name: 'Investimentos', icon: 'trending-up', color: '#8b5cf6' },
        { id: 'other-income', name: 'Outros', icon: 'plus-circle', color: '#6366f1' }
    ],
    expense: [
        { id: 'food', name: 'Alimentação', icon: 'utensils', color: '#f59e0b' },
        { id: 'housing', name: 'Moradia', icon: 'home', color: '#ef4444' },
        { id: 'transport', name: 'Transporte', icon: 'car', color: '#3b82f6' },
        { id: 'health', name: 'Saúde', icon: 'heart', color: '#ec4899' },
        { id: 'education', name: 'Educação', icon: 'book-open', color: '#14b8a6' },
        { id: 'leisure', name: 'Lazer', icon: 'gamepad-2', color: '#a855f7' },
        { id: 'other-expense', name: 'Outros', icon: 'shopping-bag', color: '#64748b' }
    ]
};
const FREQ_LABELS = { daily:'Diário', weekly:'Semanal', biweekly:'Quinzenal', monthly:'Mensal', yearly:'Anual' };

// ===== STATE =====
const state = {
    transactions: [],
    recurring: [],
    investments: [],
    investment_transactions: [],
    categories: { income: [], expense: [] },
    banks: [],         // { id, name, icon, color, initialBalance }
    budgets: {},       // { catId: { type: 'monthly'|'daily', limit, distribution, fixedDay } }
    currentMonth: new Date(),
    currentSection: 'dashboard',
    filters: { type: 'all', category: 'all', search: '' }
};

let ALL_CATEGORIES = [];
function rebuildAllCategories() {
    ALL_CATEGORIES = [...state.categories.income, ...state.categories.expense];
}
function normalizeString(str) {
    return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function getCategoryById(id) {
    if (!id) return { id: '', name: 'Sem Categoria', icon: 'circle', color: '#64748b' };
    const exact = ALL_CATEGORIES.find(c => c.id === id);
    if (exact) return exact;
    const normId = normalizeString(id);
    const match = ALL_CATEGORIES.find(c => normalizeString(c.name) === normId);
    return match || { id, name: id, icon: 'circle', color: '#64748b' };
}

// ===== HELPERS =====
function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function formatCurrency(v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function formatDate(s) { return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }); }
function formatDateShort(s) { const d = new Date(s + 'T12:00:00'); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`; }
function formatMonthYear(d) { return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase()); }
function isSameMonth(s, ref) { const d = new Date(s + 'T12:00:00'); return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear(); }
function toDateStr(d) { return d.toISOString().slice(0, 10); }
function prevMonth(d) { const r = new Date(d); r.setMonth(r.getMonth() - 1); return r; }
function percentChange(cur, prev) { if (prev === 0) return cur > 0 ? 100 : 0; return ((cur - prev) / prev) * 100; }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

// ===== LOCAL STORAGE & SUPABASE =====
function saveState() {
    localStorage.setItem('fp_transactions', JSON.stringify(state.transactions));
    localStorage.setItem('fp_recurring', JSON.stringify(state.recurring));
    localStorage.setItem('fp_categories', JSON.stringify(state.categories));
    localStorage.setItem('fp_budgets_v3', JSON.stringify(state.budgets));
    localStorage.setItem('fp_banks', JSON.stringify(state.banks));
    localStorage.setItem('fp_investments', JSON.stringify(state.investments));
    localStorage.setItem('fp_inv_txs', JSON.stringify(state.investment_transactions));
}

async function loadState() {
    try {
        const [txs, cats, banks, recs, buds, invs, invTxs] = await Promise.all([
            sb.from('transactions').select('*'),
            sb.from('categories').select('*'),
            sb.from('banks').select('*'),
            sb.from('recurring').select('*'),
            sb.from('budgets').select('*'),
            sb.from('investments').select('*'),
            sb.from('investment_transactions').select('*')
        ]);
        
        if (cats.data && cats.data.length > 0) {
            state.banks = (banks.data || []).map(b => ({
                id: b.id, name: b.name, icon: b.icon, color: b.color,
                initialBalance: b.initial_balance
            }));
            
            state.recurring = (recs.data || []).map(r => ({
                id: r.id, type: r.type, amount: r.amount, category: r.category,
                bankId: r.bank_id, description: r.description, frequency: r.frequency,
                startDate: r.start_date, endDate: r.end_date, nextDate: r.next_date, active: r.active
            }));

            state.investments = (invs.data || []).map(i => ({
                id: i.id, name: i.name, broker: i.broker, class: i.class, type: i.type,
                yieldRate: i.yield_rate, color: i.color, icon: i.icon
            }));
            state.investment_transactions = (invTxs.data || []).map(t => ({
                id: t.id, investmentId: t.investment_id, date: t.date, type: t.type, amount: parseFloat(t.amount)
            }));

            state.categories.income = cats.data.filter(c => c.type === 'income');
            state.categories.expense = cats.data.filter(c => c.type === 'expense');
            rebuildAllCategories();
            
            state.transactions = (txs.data || []).map(tx => {
                if (tx.category && !ALL_CATEGORIES.some(c => c.id === tx.category)) {
                    const normCat = normalizeString(tx.category);
                    let match = ALL_CATEGORIES.find(c => normalizeString(c.name) === normCat);
                    if (match) tx.category = match.id;
                }
                if (tx.bank_id && !state.banks.some(b => b.id === tx.bank_id)) {
                    const normBank = normalizeString(tx.bank_id);
                    let match = state.banks.find(b => normalizeString(b.name) === normBank);
                    if (match) tx.bank_id = match.id;
                }
                return {
                    id: tx.id, type: tx.type, amount: tx.amount, category: tx.category,
                    bankId: tx.bank_id, date: tx.date, description: tx.description,
                    autoGenerated: tx.auto_generated, recurringId: tx.recurring_id
                };
            });
            
            state.budgets = {};
            (buds.data || []).forEach(b => {
                state.budgets[b.category_id] = { type: b.type, limit: b.limit_amount, distribution: b.distribution, fixedDay: b.fixed_day };
            });
            saveState(); // Backup to local storage
            return; // Loaded from cloud
        }
    } catch(e) {
        console.error("Cloud load failed:", e);
    }

    // Fallback/Initial load from local
    try {
        const t = localStorage.getItem('fp_transactions');
        const r = localStorage.getItem('fp_recurring');
        const c = localStorage.getItem('fp_categories');
        const b = localStorage.getItem('fp_budgets_v3');
        const storedBanks = localStorage.getItem('fp_banks');
        const invs = localStorage.getItem('fp_investments');
        const invTxs = localStorage.getItem('fp_inv_txs');
        
        if (t) state.transactions = JSON.parse(t);
        if (r) state.recurring = JSON.parse(r);
        if (c) state.categories = JSON.parse(c);
        if (storedBanks) state.banks = JSON.parse(storedBanks);
        if (b) state.budgets = JSON.parse(b);
        if (invs) state.investments = JSON.parse(invs);
        if (invTxs) state.investment_transactions = JSON.parse(invTxs);
        
        await migrateLocalToSupabase();
    } catch (e) { console.error('Local load error:', e); }
}

async function migrateLocalToSupabase() {
    if (state.transactions.length > 0) await sb.from('transactions').upsert(state.transactions).catch(()=>{});
    if (state.banks.length > 0) await sb.from('banks').upsert(state.banks).catch(()=>{});
    if (state.recurring.length > 0) await sb.from('recurring').upsert(state.recurring).catch(()=>{});
    let initialCats = [...state.categories.income.map(c => ({...c, type: 'income'})), ...state.categories.expense.map(c => ({...c, type: 'expense'}))];
    if (initialCats.length > 0) await sb.from('categories').upsert(initialCats).catch(()=>{});
    const budgArr = Object.entries(state.budgets).map(([category_id, b]) => ({ category_id, type: b.type, limit_amount: b.limit, distribution: b.distribution, fixed_day: b.fixedDay }));
    if (budgArr.length > 0) await sb.from('budgets').upsert(budgArr).catch(()=>{});
}

// ===== INVESTMENTS =====

function renderInvestmentsPage() {
    const grid = document.getElementById('investments-grid');
    if (state.investments.length === 0) {
        grid.innerHTML = '<p class="empty-state">Nenhum ativo cadastrado.</p>';
        document.getElementById('investments-total').textContent = 'R$ 0,00';
        document.getElementById('investments-invested').textContent = 'R$ 0,00';
        document.getElementById('investments-yield').textContent = 'R$ 0,00';
        if (typeof renderInvestmentsCharts === 'function') renderInvestmentsCharts();
        return;
    }

    let totalPatrimonio = 0;
    let totalInvestido = 0;
    let totalRendimento = 0;

    const cards = state.investments.map(inv => {
        // Calculate asset numbers
        const txs = state.investment_transactions.filter(t => t.investmentId === inv.id);
        let aportes = 0, retiradas = 0, rendimentos = 0, perdas = 0;
        txs.forEach(t => {
            if (t.type === 'aporte') aportes += t.amount;
            if (t.type === 'retirada') retiradas += t.amount;
            if (t.type === 'rendimento') rendimentos += t.amount;
            if (t.type === 'perda') perdas += t.amount;
        });
        
        const invested = aportes - retiradas;
        const yieldAmt = rendimentos - perdas;
        const balance = invested + yieldAmt;

        totalPatrimonio += balance;
        totalInvestido += invested;
        totalRendimento += yieldAmt;

        return `
        <div class="category-card" style="border-left-color: ${inv.color}">
            <div class="cat-header">
                <div class="cat-icon" style="background:${inv.color}18;color:${inv.color}"><i data-lucide="${inv.icon}"></i></div>
                <div class="cat-info">
                    <h4>${inv.name}</h4>
                    <span style="font-size: 0.75rem; color: var(--text-muted)">${inv.broker} | ${inv.type}</span>
                </div>
            </div>
            <div style="margin-top: 16px;">
                <p style="font-size: 0.8rem; color: var(--text-secondary)">Saldo Atual</p>
                <h3 style="font-size: 1.2rem; font-weight: 600; margin-bottom: 8px;">${formatCurrency(balance)}</h3>
                
                <div style="display:flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 12px;">
                    <span>Investido: ${formatCurrency(invested)}</span>
                    <span style="color: ${yieldAmt >= 0 ? 'var(--income)' : 'var(--expense)'}">Rend: ${formatCurrency(yieldAmt)}</span>
                </div>
            </div>
            <div class="cat-actions" style="margin-top: 12px; border-top: 1px solid var(--border); padding-top: 12px; display: flex; justify-content: space-between;">
                <button class="btn btn-sm btn-primary" onclick="openInvestmentTxModal('${inv.id}')" style="flex: 1; margin-right: 8px;">Atualizar</button>
                <button class="btn btn-sm" onclick="openInvestmentDetailsModal('${inv.id}')" style="background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border); flex: 1; margin-right: 8px;">Analisar</button>
                <button class="category-delete-btn" onclick="deleteInvestment('${inv.id}')" title="Excluir"><i data-lucide="trash-2"></i></button>
            </div>
        </div>`;
    }).join('');
    
    grid.innerHTML = cards;
    document.getElementById('investments-total').textContent = formatCurrency(totalPatrimonio);
    document.getElementById('investments-invested').textContent = formatCurrency(totalInvestido);
    document.getElementById('investments-yield').textContent = formatCurrency(totalRendimento);
    document.getElementById('investments-yield').style.color = totalRendimento >= 0 ? 'var(--income)' : 'var(--expense)';
    
    lucide.createIcons({ nodes: [grid] });
    if (typeof renderInvestmentsCharts === 'function') renderInvestmentsCharts();
}

async function addInvestment(e) {
    e.preventDefault();
    const isVar = document.getElementById('inv-class').value === 'Renda Variável';
    const inv = {
        id: generateId(),
        name: document.getElementById('inv-name').value,
        broker: document.getElementById('inv-broker').value,
        class: document.getElementById('inv-class').value,
        type: document.getElementById('inv-type').value,
        yieldRate: document.getElementById('inv-yield').value || null,
        color: isVar ? '#8b5cf6' : '#3b82f6',
        icon: isVar ? 'trending-up' : 'shield'
    };
    
    state.investments.push(inv);
    renderInvestmentsPage();
    closeModal('investment-modal');
    showToast('Investimento cadastrado.', 'success');
    
    const { error } = await sb.from('investments').insert([{
        id: inv.id, name: inv.name, broker: inv.broker, class: inv.class, type: inv.type,
        yield_rate: inv.yieldRate, color: inv.color, icon: inv.icon
    }]);
    if(error) alert('Erro ao salvar investimento na nuvem: ' + error.message);
}

async function deleteInvestment(id) {
    if(!confirm('Excluir este investimento? Todo o histórico de movimentações dele será perdido.')) return;
    state.investments = state.investments.filter(i => i.id !== id);
    state.investment_transactions = state.investment_transactions.filter(t => t.investmentId !== id);
    renderInvestmentsPage();
    showToast('Investimento excluído.', 'info');
    
    const { error } = await sb.from('investments').delete().eq('id', id);
    if(error) alert('Erro ao excluir na nuvem: ' + error.message);
}

function openInvestmentTxModal(invId) {
    document.getElementById('inv-tx-asset-id').value = invId;
    document.getElementById('inv-tx-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('inv-tx-amount').value = '';
    document.getElementById('inv-tx-modal').classList.add('open');
}

async function addInvestmentTx(e) {
    e.preventDefault();
    const tx = {
        id: generateId(),
        investmentId: document.getElementById('inv-tx-asset-id').value,
        date: document.getElementById('inv-tx-date').value,
        type: document.getElementById('inv-tx-type').value,
        amount: parseFloat(document.getElementById('inv-tx-amount').value)
    };
    
    state.investment_transactions.push(tx);
    renderInvestmentsPage();
    closeModal('inv-tx-modal');
    showToast('Atualização registrada.', 'success');
    
    const { error } = await sb.from('investment_transactions').insert([{
        id: tx.id, investment_id: tx.investmentId, date: tx.date, type: tx.type, amount: tx.amount
    }]);
    if(error) alert('Erro ao salvar atualização na nuvem: ' + error.message);
}

function openInvestmentDetailsModal(invId) {
    const inv = state.investments.find(i => i.id === invId);
    if (!inv) return;
    
    document.getElementById('inv-details-title').textContent = `Análise: ${inv.name}`;
    
    // Sort transactions latest first
    const txs = state.investment_transactions.filter(t => t.investmentId === invId).sort((a,b) => new Date(b.date) - new Date(a.date));
    
    const tbody = document.getElementById('inv-details-history');
    if (txs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 16px; color: var(--text-muted);">Nenhuma movimentação registrada.</td></tr>';
    } else {
        tbody.innerHTML = txs.map(t => {
            const d = new Date(t.date + 'T00:00:00');
            const dateStr = d.toLocaleDateString('pt-BR');
            let color = 'var(--text-primary)';
            if(t.type === 'aporte') color = 'var(--primary)';
            if(t.type === 'rendimento') color = 'var(--income)';
            if(t.type === 'retirada') color = 'var(--accent)';
            if(t.type === 'perda') color = 'var(--expense)';
            
            const typeLabels = { aporte: 'Aporte', rendimento: 'Rendimento', retirada: 'Retirada', perda: 'Perda' };
            
            return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 12px 8px;">${dateStr}</td>
                <td style="padding: 12px 8px; color: ${color}; text-transform: capitalize;">${typeLabels[t.type] || t.type}</td>
                <td style="padding: 12px 8px; text-align: right; font-weight: 500;">${formatCurrency(t.amount)}</td>
                <td style="padding: 12px 8px; text-align: center;">
                    <button class="category-delete-btn" onclick="deleteInvestmentTx('${t.id}', '${invId}')" title="Excluir Histórico"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>`;
        }).join('');
    }
    
    lucide.createIcons({ nodes: [tbody] });
    document.getElementById('inv-details-modal').classList.add('open');
    
    // Render individual charts
    if (typeof renderInvestmentDetailsCharts === 'function') {
        renderInvestmentDetailsCharts(inv, txs);
    }
}

async function deleteInvestmentTx(txId, invId) {
    if(!confirm('Tem certeza que deseja excluir esta movimentação? O saldo do ativo será recalculado.')) return;
    state.investment_transactions = state.investment_transactions.filter(t => t.id !== txId);
    
    // Refresh views
    openInvestmentDetailsModal(invId);
    renderInvestmentsPage();
    
    showToast('Movimentação excluída.', 'info');
    
    const { error } = await sb.from('investment_transactions').delete().eq('id', txId);
    if(error) alert('Erro ao excluir na nuvem: ' + error.message);
}

// ===== CATEGORIES CRUD =====
async function addCategory(type, data) {
    const id = data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + generateId().slice(0, 4);
    const cat = { id, name: data.name, icon: data.icon, color: data.color };
    state.categories[type].push(cat);
    rebuildAllCategories();
    saveState();
    refreshAll();
    showToast(`Categoria "${data.name}" criada!`, 'success');
    const { error } = await sb.from('categories').insert([{ id: cat.id, type, name: cat.name, icon: cat.icon, color: cat.color }]);
    if (error) { alert('Erro ao salvar categoria na nuvem: ' + error.message); console.error(error); }
}

async function deleteCategory(id) {
    if (!confirm('Tem certeza que deseja excluir esta categoria?')) return;
    const hasTx = state.transactions.some(t => t.category === id);
    const hasRec = state.recurring.some(r => r.category === id);
    if (hasTx || hasRec) {
        showToast('Não é possível excluir: existem transações vinculadas.', 'error');
        return;
    }
    state.categories.income = state.categories.income.filter(c => c.id !== id);
    state.categories.expense = state.categories.expense.filter(c => c.id !== id);
    delete state.budgets[id];
    rebuildAllCategories();
    saveState();
    refreshAll();
    showToast('Categoria removida.', 'info');
    const { error } = await sb.from('categories').delete().eq('id', id);
    if (error) { alert('Erro ao excluir categoria na nuvem: ' + error.message); console.error(error); }
}

// ===== BANKS CRUD =====
async function addBank(data) {
    const id = data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + generateId().slice(0, 4);
    const bank = { id, name: data.name, icon: data.icon, color: data.color, initialBalance: parseFloat(data.initialBalance) || 0 };
    state.banks.push(bank);
    saveState();
    refreshAll();
    showToast(`Conta "${data.name}" criada!`, 'success');
    const { error } = await sb.from('banks').insert([{ id: bank.id, name: bank.name, icon: bank.icon, color: bank.color, initial_balance: bank.initialBalance }]);
    if (error) { alert('Erro ao salvar conta na nuvem: ' + error.message); console.error(error); }
}

async function deleteBank(id) {
    if (!confirm('Tem certeza que deseja excluir esta conta bancária?')) return;
    const hasTx = state.transactions.some(t => t.bankId === id);
    const hasRec = state.recurring.some(r => r.bankId === id);
    if (hasTx || hasRec) {
        showToast('Existem transações vinculadas a esta conta. Edite-as antes de remover.', 'error');
        return;
    }
    state.banks = state.banks.filter(b => b.id !== id);
    saveState();
    refreshAll();
    showToast('Conta removida.', 'info');
    const { error } = await sb.from('banks').delete().eq('id', id);
    if (error) { alert('Erro ao excluir conta na nuvem: ' + error.message); console.error(error); }
}

// ===== RECURRING ENGINE =====
function generateDatesForRecurring(rec, rangeEnd) {
    const dates = [];
    let cur = new Date(rec.startDate + 'T12:00:00');
    const end = rec.endDate ? new Date(Math.min(new Date(rec.endDate + 'T12:00:00').getTime(), rangeEnd.getTime())) : rangeEnd;
    let safety = 0;
    while (cur <= end && safety < 5000) {
        dates.push(toDateStr(cur));
        const next = new Date(cur);
        switch (rec.frequency) {
            case 'daily': next.setDate(next.getDate() + 1); break;
            case 'weekly': next.setDate(next.getDate() + 7); break;
            case 'biweekly': next.setDate(next.getDate() + 14); break;
            case 'monthly': next.setMonth(next.getMonth() + 1); break;
            case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
        }
        cur = next;
        safety++;
    }
    return dates;
}

async function generateRecurringTransactions() {
    const today = new Date();
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    let changed = false;
    state.recurring.filter(r => r.active).forEach(rec => {
        const dates = generateDatesForRecurring(rec, endOfMonth);
        dates.forEach(dateStr => {
            if (!state.transactions.some(tx => tx.recurringId === rec.id && tx.date === dateStr)) {
                state.transactions.push({
                    id: generateId(), type: rec.type, category: rec.category,
                    amount: rec.amount, date: dateStr, description: rec.description,
                    recurringId: rec.id, autoGenerated: true
                });
                changed = true;
            }
        });
    });
    if (changed) {
        saveState();
        const mappedTxs = state.transactions.map(t => ({id: t.id, type: t.type, amount: t.amount, category: t.category, bank_id: t.bankId, date: t.date, description: t.description, auto_generated: t.autoGenerated, recurring_id: t.recurringId}));
        await sb.from('transactions').upsert(mappedTxs).catch(console.error);
    }
}

function isRecurrenceOnDate(rec, dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const start = new Date(rec.startDate + 'T12:00:00');
    if (d < start) return false;
    if (rec.endDate && d > new Date(rec.endDate + 'T12:00:00')) return false;
    switch (rec.frequency) {
        case 'daily': return true;
        case 'weekly': return Math.round((d - start) / 86400000) % 7 === 0;
        case 'biweekly': return Math.round((d - start) / 86400000) % 14 === 0;
        case 'monthly': {
            const targetDay = start.getDate();
            const lastDay = daysInMonth(d.getFullYear(), d.getMonth());
            return d.getDate() === Math.min(targetDay, lastDay);
        }
        case 'yearly': return d.getMonth() === start.getMonth() && d.getDate() === start.getDate();
        default: return false;
    }
}

async function addRecurring(data) {
    const rec = {
        id: generateId(), type: data.type, category: data.category, bankId: data.bankId,
        amount: parseFloat(data.amount), description: data.description,
        frequency: data.frequency, startDate: data.startDate,
        endDate: data.endDate || null, active: true
    };
    state.recurring.push(rec);
    generateRecurringTransactions();
    saveState();
    refreshAll();
    showToast('Recorrência adicionada.', 'success');
    
    const sRec = {
        id: rec.id, type: rec.type, amount: rec.amount, category: rec.category,
        bank_id: rec.bankId, description: rec.description, frequency: rec.frequency,
        start_date: rec.startDate, end_date: rec.endDate, active: rec.active
    };
    const { error } = await sb.from('recurring').insert([sRec]);
    if (error) { alert('Erro ao salvar recorrência na nuvem: ' + error.message); console.error(error); }
}

async function deleteRecurring(id) {
    if (!confirm('Excluir esta transação recorrente? Isso também excluirá todos os lançamentos futuros vinculados a ela.')) return;
    state.recurring = state.recurring.filter(r => r.id !== id);
    state.transactions = state.transactions.filter(t => !(t.recurringId === id && t.autoGenerated));
    saveState();
    refreshAll();
    showToast('Recorrência removida.', 'info');
    
    // Also delete any auto-generated future transactions in Supabase for this recurring
    await sb.from('transactions').delete().match({ recurring_id: id, auto_generated: true }).catch(console.error);
    const { error } = await sb.from('recurring').delete().eq('id', id);
    if (error) { alert('Erro ao excluir recorrência na nuvem: ' + error.message); console.error(error); }
}

async function toggleRecurring(id) {
    const rec = state.recurring.find(r => r.id === id);
    if (rec) {
        rec.active = !rec.active;
        if (rec.active) generateRecurringTransactions();
        saveState();
        refreshAll();
        showToast(rec.active ? 'Recorrência ativada.' : 'Recorrência pausada.', 'info');
        const { error } = await sb.from('recurring').update({ active: rec.active }).eq('id', id);
        if (error) { alert('Erro ao atualizar recorrência na nuvem: ' + error.message); console.error(error); }
    }
}

// ===== CALCULATIONS =====
function getMonthTransactions(ref) { return state.transactions.filter(tx => isSameMonth(tx.date, ref)); }
function getMonthStats(ref) {
    const txs = getMonthTransactions(ref);
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { income, expenses, savings: income - expenses };
}
function getTotalBalance() {
    return state.transactions.reduce((s, tx) => s + (tx.type === 'income' ? tx.amount : -tx.amount), 0);
}
function getCategoryExpenses(ref) {
    const map = {};
    getMonthTransactions(ref).filter(t => t.type === 'expense').forEach(tx => {
        const catId = getCategoryById(tx.category).id;
        map[catId] = (map[catId] || 0) + tx.amount;
    });
    return map;
}
function getTodayCategoryExpenses() {
    const todayStr = toDateStr(new Date());
    const map = {};
    state.transactions.filter(t => t.type === 'expense' && t.date === todayStr).forEach(tx => {
        const catId = getCategoryById(tx.category).id;
        map[catId] = (map[catId] || 0) + tx.amount;
    });
    return map;
}

// ===== TIMELINE ENGINE =====
function calculateTimeline() {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const todayStr = toDateStr(today);
    
    // Determine the projection window based on state.currentMonth
    const projMonth = new Date(state.currentMonth);
    projMonth.setHours(12, 0, 0, 0);
    
    // Always calculate from 1st to last day of projMonth
    const startDate = new Date(projMonth.getFullYear(), projMonth.getMonth(), 1);
    const endDate = new Date(projMonth.getFullYear(), projMonth.getMonth() + 1, 0);

    // Calculate initial balance right before the startDate
    const startStr = toDateStr(startDate);
    let balance = state.transactions
        .filter(tx => tx.date < startStr)
        .reduce((s, tx) => s + (tx.type === 'income' ? tx.amount : -tx.amount), 0);

    const days = [];
    let curDate = new Date(startDate);
    const dim = daysInMonth(curDate.getFullYear(), curDate.getMonth());

    while (curDate <= endDate) {
        const dateStr = toDateStr(curDate);
        const dom = curDate.getDate();
        const isFuture = dateStr > todayStr;

        let income = 0;
        let recurringExpense = 0;
        let dailySpending = 0;
        let monthlySpending = 0;
        
        let expectedDailyLimit = 0;
        let expectedMonthlyLimit = 0;
        const monthlyBreakdown = {};
        const dailyBreakdown = {};
        const incomeItems = [];
        const expenseItems = [];

        // Calculate expected limits
        for (const [catId, config] of Object.entries(state.budgets)) {
            if (config.type === 'daily') {
                expectedDailyLimit += config.limit;
                dailyBreakdown[catId] = config.limit; // Expected breakdown
            } else if (config.type === 'monthly') {
                let amount = 0;
                if (config.distribution === 'spread') {
                    amount = config.limit / dim;
                } else if (config.distribution === 'fixed' && dom === (config.fixedDay || 1)) {
                    amount = config.limit;
                }
                if (amount > 0) {
                    monthlyBreakdown[catId] = amount;
                    expectedMonthlyLimit += amount;
                }
            }
        }

        if (isFuture) {
            // Future: Use recurring projection and limits
            state.recurring.filter(r => r.active).forEach(rec => {
                if (isRecurrenceOnDate(rec, dateStr)) {
                    if (rec.type === 'income') {
                        income += rec.amount;
                        incomeItems.push({ name: rec.description, amount: rec.amount });
                    } else {
                        recurringExpense += rec.amount;
                        expenseItems.push({ name: rec.description, amount: rec.amount });
                    }
                }
            });
            dailySpending = expectedDailyLimit;
            monthlySpending = expectedMonthlyLimit;
        } else {
            // Past/Today: Use real transactions
            const txs = state.transactions.filter(t => t.date === dateStr);
            txs.forEach(tx => {
                if (tx.type === 'income') {
                    income += tx.amount;
                    incomeItems.push({ name: tx.description, amount: tx.amount });
                } else {
                    if (tx.autoGenerated) {
                        recurringExpense += tx.amount;
                        expenseItems.push({ name: tx.description, amount: tx.amount });
                    } else {
                        const conf = state.budgets[tx.category];
                        if (conf && conf.type === 'daily') {
                            dailySpending += tx.amount;
                            dailyBreakdown[tx.category] = (dailyBreakdown[tx.category] || 0) + tx.amount; // Real breakdown
                        } else {
                            // Monthly or no config
                            monthlySpending += tx.amount;
                        }
                    }
                }
            });
        }

        const dayTotal = income - recurringExpense - dailySpending - monthlySpending;
        balance += dayTotal;

        days.push({ 
            date: dateStr, 
            isFuture,
            income, incomeItems, 
            recurringExpense, expenseItems,
            dailySpending, monthlySpending, 
            expectedDailyLimit, expectedMonthlyLimit, monthlyBreakdown, dailyBreakdown,
            dayTotal, balance 
        });

        curDate.setDate(curDate.getDate() + 1);
    }
    return days;
}

// ===== CRUD =====
async function addTransaction(data) {
    const tx = {
        id: generateId(),
        type: data.type,
        amount: parseFloat(data.amount),
        category: data.category,
        bankId: data.bankId,
        date: data.date,
        description: data.description,
        autoGenerated: false,
        recurringId: null
    };
    state.transactions.push(tx);
    saveState();
    refreshAll();
    showToast('Transação registrada!', 'success');
    
    const sTx = {
        id: tx.id, 
        type: tx.type, 
        amount: tx.amount, 
        category: tx.category, 
        bank_id: tx.bankId, 
        date: tx.date, 
        description: tx.description, 
        auto_generated: tx.autoGenerated, 
        recurring_id: tx.recurringId
    };
    const { error } = await sb.from('transactions').insert([sTx]);
    if (error) {
        alert('Erro ao salvar na nuvem: ' + error.message);
        console.error(error);
    }
}

async function deleteTransaction(id) {
    if (!confirm('Excluir esta transação?')) return;
    state.transactions = state.transactions.filter(t => t.id !== id);
    saveState();
    refreshAll();
    showToast('Transação excluída.', 'info');
    const { error } = await sb.from('transactions').delete().eq('id', id);
    if (error) {
        alert('Erro ao excluir na nuvem: ' + error.message);
        console.error(error);
    }
}

function saveBudgets(budgets) {
    state.budgets = budgets;
    saveState();
    refreshAll();
    showToast('Orçamentos salvos!', 'success');
}

// ===== TOAST =====
function showToast(msg, type = 'info') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icons = { success: 'check-circle', error: 'alert-circle', info: 'info' };
    t.innerHTML = `<i data-lucide="${icons[type] || 'info'}"></i><span>${msg}</span>`;
    c.appendChild(t);
    lucide.createIcons({ nodes: [t] });
    setTimeout(() => { t.style.animation = 'toastOut 0.35s ease forwards'; setTimeout(() => t.remove(), 350); }, 3000);
}

// ===== RENDERING: Overview Cards =====
function renderOverviewCards() {
    const stats = getMonthStats(state.currentMonth);
    const prev = getMonthStats(prevMonth(state.currentMonth));
    const bal = getTotalBalance();
    setValue('value-balance', formatCurrency(bal));
    setValue('value-income', formatCurrency(stats.income));
    setValue('value-expenses', formatCurrency(stats.expenses));
    setValue('value-savings', formatCurrency(stats.savings));
    setBadge('badge-balance', null);
    setBadge('badge-income', percentChange(stats.income, prev.income));
    setBadge('badge-expenses', percentChange(stats.expenses, prev.expenses), true);
    setBadge('badge-savings', percentChange(stats.savings, prev.savings));

    // Render Banks Overview
    const banksOverview = document.getElementById('banks-overview-grid');
    if (banksOverview) {
        if (!state.banks.length) {
            banksOverview.innerHTML = '';
        } else {
            banksOverview.innerHTML = state.banks.map(bank => {
                const bal = bank.initialBalance + state.transactions.filter(t => t.bankId === bank.id).reduce((s, tx) => s + (tx.type === 'income' ? tx.amount : -tx.amount), 0);
                return `<div class="bank-overview-card">
                    <div class="bank-overview-icon" style="background:${bank.color}18;color:${bank.color}"><i data-lucide="${bank.icon}"></i></div>
                    <div class="bank-overview-info">
                        <span class="bank-overview-name">${bank.name}</span>
                        <span class="bank-overview-balance" style="${bal < 0 ? 'color:var(--expense)' : ''}">${formatCurrency(bal)}</span>
                    </div>
                </div>`;
            }).join('');
            lucide.createIcons({ nodes: [banksOverview] });
        }
    }
}
function setValue(id, text) {
    const el = document.getElementById(id);
    el.textContent = text;
    el.classList.remove('animate-value');
    void el.offsetWidth;
    el.classList.add('animate-value');
}
function setBadge(id, pct, invert = false) {
    const el = document.getElementById(id);
    if (pct === null || pct === undefined || isNaN(pct)) { el.textContent = ''; el.className = 'card-badge'; return; }
    const r = Math.round(pct);
    const pos = invert ? r <= 0 : r >= 0;
    el.textContent = `${r >= 0 ? '↑' : '↓'} ${Math.abs(r)}%`;
    el.className = `card-badge ${r === 0 ? 'neutral' : pos ? 'positive' : 'negative'}`;
}

// ===== RENDERING: Recent Transactions =====
function renderRecentTransactions() {
    const c = document.getElementById('recent-transactions-list');
    const txs = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 7);
    if (!txs.length) { c.innerHTML = '<div class="empty-state"><i data-lucide="inbox"></i><p>Nenhuma transação ainda</p></div>'; lucide.createIcons({ nodes: [c] }); return; }
    c.innerHTML = txs.map(tx => {
        const cat = getCategoryById(tx.category);
        const badge = tx.autoGenerated ? '<span class="recurring-badge">🔄</span>' : '';
        return `<div class="tx-item">
            <div class="tx-icon" style="background:${cat.color}18;color:${cat.color}"><i data-lucide="${cat.icon}"></i></div>
            <div class="tx-info"><div class="tx-desc">${tx.description}${badge}</div><div class="tx-meta">${cat.name} • ${formatDate(tx.date)}</div></div>
            <div class="tx-amount ${tx.type}">${tx.type === 'income' ? '+' : '-'} ${formatCurrency(tx.amount)}</div>
        </div>`;
    }).join('');
    lucide.createIcons({ nodes: [c] });
}

// ===== RENDERING: Transactions Page =====
function renderTransactionsPage() {
    renderRecurringList();
    const tbody = document.getElementById('transactions-tbody');
    const empty = document.getElementById('empty-transactions');
    const tw = document.querySelector('.transactions-table-wrapper');
    let txs = getMonthTransactions(state.currentMonth);
    if (state.filters.type !== 'all') txs = txs.filter(t => t.type === state.filters.type);
    if (state.filters.category !== 'all') txs = txs.filter(t => t.category === state.filters.category);
    if (state.filters.search) { const q = state.filters.search.toLowerCase(); txs = txs.filter(t => t.description.toLowerCase().includes(q) || getCategoryById(t.category).name.toLowerCase().includes(q)); }
    txs.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    if (!txs.length) { tw.classList.add('hidden'); empty.classList.remove('hidden'); lucide.createIcons({ nodes: [empty] }); return; }
    tw.classList.remove('hidden'); empty.classList.add('hidden');
    tbody.innerHTML = txs.map(tx => {
        const cat = getCategoryById(tx.category);
        let bank = state.banks.find(b => b.id === tx.bankId);
        if (!bank && tx.bankId) {
            const normBank = normalizeString(tx.bankId);
            bank = state.banks.find(b => normalizeString(b.name) === normBank);
        }
        const bankName = bank ? `<i data-lucide="${bank.icon}" style="width:14px;height:14px;margin-right:6px;color:${bank.color}"></i>${bank.name}` : '<span style="color:var(--text-muted)">-</span>';
        const badge = tx.autoGenerated ? ' <span class="recurring-badge">🔄</span>' : '';
        return `<tr>
            <td>${formatDate(tx.date)}</td>
            <td>${tx.description}${badge}</td>
            <td><span class="table-cat"><span class="table-cat-dot" style="background:${cat.color}"></span>${cat.name}</span></td>
            <td><span style="display:flex;align-items:center;font-size:0.85rem;color:var(--text-secondary)">${bankName}</span></td>
            <td><span class="table-amount ${tx.type}">${tx.type === 'income' ? '+' : '-'} ${formatCurrency(tx.amount)}</span></td>
            <td><div class="table-actions"><button class="table-action-btn" onclick="deleteTransaction('${tx.id}')" title="Excluir"><i data-lucide="trash-2"></i></button></div></td>
        </tr>`;
    }).join('');
    lucide.createIcons({ nodes: [tbody] });
}

// ===== RENDERING: Recurring List =====
function renderRecurringList() {
    const list = document.getElementById('recurring-list');
    if (!state.recurring.length) { list.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;padding:8px 0">Nenhuma recorrência cadastrada.</p>'; return; }
    list.innerHTML = state.recurring.map(rec => {
        const cat = getCategoryById(rec.category);
        const startD = new Date(rec.startDate + 'T12:00:00');
        const startLabel = startD.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
        const pausedClass = rec.active ? '' : ' recurring-paused';
        const pauseIcon = rec.active ? 'pause' : 'play';
        return `<div class="tx-item${pausedClass}">
            <div class="tx-icon" style="background:${cat.color}18;color:${cat.color}"><i data-lucide="${cat.icon}"></i></div>
            <div class="tx-info"><div class="tx-desc">${rec.description}</div>
            <div class="tx-meta">${cat.name} • ${FREQ_LABELS[rec.frequency]} • Desde ${startLabel}${rec.endDate ? ' até ' + formatDate(rec.endDate) : ''}${!rec.active ? ' • PAUSADA' : ''}</div></div>
            <div class="tx-amount ${rec.type}">${rec.type === 'income' ? '+' : '-'} ${formatCurrency(rec.amount)}</div>
            <div class="recurring-actions">
                <button class="pause-btn" onclick="toggleRecurring('${rec.id}')" title="${rec.active ? 'Pausar' : 'Ativar'}"><i data-lucide="${pauseIcon}"></i></button>
                <button class="delete-btn" onclick="deleteRecurring('${rec.id}')" title="Excluir"><i data-lucide="trash-2"></i></button>
            </div>
        </div>`;
    }).join('');
    lucide.createIcons({ nodes: [list] });
}

// ===== RENDERING: Budget Page =====
function renderBudgetPage() {
    const grid = document.getElementById('budget-grid');
    const catExpenses = getCategoryExpenses(state.currentMonth);
    const todayExpenses = getTodayCategoryExpenses();
    const dim = daysInMonth(state.currentMonth.getFullYear(), state.currentMonth.getMonth());
    
    grid.innerHTML = state.categories.expense.map(cat => {
        const config = state.budgets[cat.id] || { type: 'monthly', limit: 0, distribution: 'spread', fixedDay: null };
        const spent = catExpenses[cat.id] || 0;
        
        if (config.type === 'monthly') {
            const limit = config.limit || 0;
            const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
            const overPct = limit > 0 ? (spent / limit) * 100 : 0;
            let statusClass = 'ok', statusText = `${Math.round(pct)}% utilizado`, barColor = cat.color;
            if (!limit) { statusText = 'Sem orçamento definido'; barColor = 'var(--text-muted)'; }
            else if (overPct > 100) { statusClass = 'over'; statusText = `Excedido em ${formatCurrency(spent - limit)}`; barColor = 'var(--expense)'; }
            else if (overPct >= 80) { statusClass = 'warn'; statusText = `${Math.round(overPct)}% — Atenção!`; barColor = 'var(--warning)'; }

            const distLabel = config.distribution === 'fixed' ? `Dia ${config.fixedDay || 1}` : 'Distribuído';
            return `<div class="budget-card">
                <div class="budget-card-top">
                    <div class="budget-cat">
                        <div class="budget-cat-icon" style="background:${cat.color}18;color:${cat.color}"><i data-lucide="${cat.icon}"></i></div>
                        <span class="budget-cat-name">${cat.name} (Mensal)</span>
                    </div>
                    <div class="budget-values">
                        <div class="budget-spent">${formatCurrency(spent)}</div>
                        <div class="budget-limit">${limit > 0 ? 'de ' + formatCurrency(limit) + ' (' + distLabel + ')' : '—'}</div>
                    </div>
                </div>
                <div class="budget-progress-track"><div class="budget-progress-bar" style="width:${pct}%;background:${barColor}"></div></div>
                <div class="budget-status ${statusClass}">${statusText}</div>
            </div>`;
        } else {
            // Daily budget type
            const dailyLimit = config.limit || 0;
            const monthlyEquivalent = dailyLimit * dim;
            
            // Monthly overall tracking for the daily budget
            const pct = monthlyEquivalent > 0 ? Math.min((spent / monthlyEquivalent) * 100, 100) : 0;
            const overPct = monthlyEquivalent > 0 ? (spent / monthlyEquivalent) * 100 : 0;
            let statusClass = 'ok', statusText = `${Math.round(pct)}% do previsto mensal`, barColor = cat.color;
            if (!dailyLimit) { statusText = 'Sem orçamento definido'; barColor = 'var(--text-muted)'; }
            else if (overPct > 100) { statusClass = 'over'; statusText = `Excedeu a previsão do mês em ${formatCurrency(spent - monthlyEquivalent)}`; barColor = 'var(--expense)'; }
            else if (overPct >= 80) { statusClass = 'warn'; statusText = `${Math.round(overPct)}% do mês — Atenção!`; barColor = 'var(--warning)'; }

            // Today's tracking
            const todaySpent = todayExpenses[cat.id] || 0;
            const dailyPct = dailyLimit > 0 ? Math.min((todaySpent / dailyLimit) * 100, 100) : 0;
            const dailyOver = dailyLimit > 0 ? (todaySpent / dailyLimit) * 100 : 0;
            let dailyBarColor = cat.color;
            let dailyStatus = `${formatCurrency(todaySpent)} de ${formatCurrency(dailyLimit)} hoje`;
            let dailyStatusClass = 'ok';
            if (dailyOver > 100) { dailyBarColor = 'var(--expense)'; dailyStatusClass = 'over'; dailyStatus = `Excedido hoje em ${formatCurrency(todaySpent - dailyLimit)}`; }
            else if (dailyOver >= 80) { dailyBarColor = 'var(--warning)'; dailyStatusClass = 'warn'; }

            return `<div class="budget-card">
                <div class="budget-card-top">
                    <div class="budget-cat">
                        <div class="budget-cat-icon" style="background:${cat.color}18;color:${cat.color}"><i data-lucide="${cat.icon}"></i></div>
                        <span class="budget-cat-name">${cat.name} (Diário)</span>
                    </div>
                    <div class="budget-values">
                        <div class="budget-spent">${formatCurrency(spent)}</div>
                        <div class="budget-limit">${monthlyEquivalent > 0 ? 'est. mensal: ' + formatCurrency(monthlyEquivalent) : '—'}</div>
                    </div>
                </div>
                <div class="budget-progress-track"><div class="budget-progress-bar" style="width:${pct}%;background:${barColor}"></div></div>
                <div class="budget-status ${statusClass}">${statusText}</div>
                
                <div class="budget-daily-section">
                    <div class="budget-daily-label"><span>Uso de Hoje</span><span>${formatCurrency(dailyLimit)}/dia limite</span></div>
                    <div class="budget-daily-track"><div class="budget-daily-bar" style="width:${dailyPct}%;background:${dailyBarColor}"></div></div>
                    <div class="budget-daily-status budget-status ${dailyStatusClass}">${dailyStatus}</div>
                </div>
            </div>`;
        }
    }).join('');
    lucide.createIcons({ nodes: [grid] });
}

// ===== RENDERING: Categories Page =====
function renderCategoriesPage() {
    renderCategoryGrid('income', 'categories-grid-income');
    renderCategoryGrid('expense', 'categories-grid-expense');
}
function renderCategoryGrid(type, containerId) {
    const c = document.getElementById(containerId);
    const cats = state.categories[type];
    if (!cats.length) { c.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Nenhuma categoria.</p>'; return; }
    c.innerHTML = cats.map(cat => `
        <div class="category-card">
            <div class="category-card-top">
                <div class="category-card-info">
                    <div class="cat-icon" style="background:${cat.color}18;color:${cat.color}"><i data-lucide="${cat.icon}"></i></div>
                    <span class="cat-name">${cat.name}</span>
                </div>
                <button class="category-delete-btn" onclick="deleteCategory('${cat.id}')" title="Excluir"><i data-lucide="trash-2"></i></button>
            </div>
        </div>
    `).join('');
    lucide.createIcons({ nodes: [c] });
}

// ===== RENDERING: Banks Page =====
function renderBanksPage() {
    const grid = document.getElementById('banks-grid');
    if (!state.banks.length) { grid.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem">Nenhuma conta cadastrada.</p>'; return; }
    
    grid.innerHTML = state.banks.map(bank => {
        const bal = bank.initialBalance + state.transactions.filter(t => t.bankId === bank.id).reduce((s, tx) => s + (tx.type === 'income' ? tx.amount : -tx.amount), 0);
        return `<div class="category-card">
            <div class="category-card-top">
                <div class="category-card-info">
                    <div class="cat-icon" style="background:${bank.color}18;color:${bank.color}"><i data-lucide="${bank.icon}"></i></div>
                    <div>
                        <div class="cat-name">${bank.name}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted)">Saldo Inicial: ${formatCurrency(bank.initialBalance)}</div>
                    </div>
                </div>
                <button class="category-delete-btn" onclick="deleteBank('${bank.id}')" title="Excluir Conta"><i data-lucide="trash-2"></i></button>
            </div>
            <div style="margin-top:12px;font-weight:600;font-size:1.1rem;${bal < 0 ? 'color:var(--expense)' : 'color:var(--text-primary)'}">${formatCurrency(bal)}</div>
        </div>`;
    }).join('');
    lucide.createIcons({ nodes: [grid] });
}

// ===== RENDERING: Projection Page =====
function renderProjectionPage() {
    const data = calculateTimeline();
    
    // Determine balance before this month starts to calculate properly if we want the actual final balance,
    // actually `data` already has `.balance` calculated progressively.
    const startBalance = data.length ? data[0].balance - data[0].dayTotal : getTotalBalance();
    
    const tbody = document.getElementById('projection-tbody');
    const summaryEl = document.getElementById('projection-summary');

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px">Nenhum dado para o mês selecionado.</td></tr>';
        summaryEl.innerHTML = '';
        if (typeof updateAllCharts === 'function') updateAllCharts();
        return;
    }

    // Summary cards (total real/expected for this month window)
    const totalIncome = data.reduce((s, d) => s + d.income, 0);
    const totalExpense = data.reduce((s, d) => s + d.recurringExpense + d.dailySpending + d.monthlySpending, 0);
    const finalBalance = data[data.length - 1].balance;

    summaryEl.innerHTML = `
        <div class="proj-summary-card"><p class="proj-summary-label">Saldo Inicial do Mês</p><p class="proj-summary-value">${formatCurrency(startBalance)}</p></div>
        <div class="proj-summary-card ${finalBalance >= 0 ? 'positive' : 'negative'}"><p class="proj-summary-label">Saldo Final (Mês)</p><p class="proj-summary-value">${formatCurrency(finalBalance)}</p></div>
        <div class="proj-summary-card positive"><p class="proj-summary-label">Receitas Totais</p><p class="proj-summary-value">${formatCurrency(totalIncome)}</p></div>
        <div class="proj-summary-card negative"><p class="proj-summary-label">Despesas Totais</p><p class="proj-summary-value">${formatCurrency(totalExpense)}</p></div>
    `;

    // Table
    tbody.innerHTML = data.map((day, idx) => {
        let rowClass = day.isFuture ? 'timeline-row-future' : 'timeline-row-past';
        if (day.balance < 0) rowClass += ' proj-row-danger';

        // Breakdown detail for expected monthly limit
        const breakdownItems = Object.entries(day.monthlyBreakdown)
            .filter(([, v]) => v > 0)
            .map(([catId, amount]) => {
                const cat = getCategoryById(catId);
                return `<span class="detail-item"><span class="detail-dot" style="background:${cat.color}"></span>${cat.name}: ${formatCurrency(amount)}</span>`;
            }).join('');
        const hasBreakdown = breakdownItems.length > 0;

        // Incomes
        let incHtml = '—';
        if (day.incomeItems.length > 0) {
            incHtml = day.incomeItems.map(i => `<div class="proj-income-val">+${formatCurrency(i.amount)} <span style="font-size:0.75em;color:var(--text-muted)">(${i.name})</span></div>`).join('');
        }
        
        // Recurring Expenses
        let recExpHtml = '—';
        if (day.expenseItems.length > 0) {
            recExpHtml = day.expenseItems.map(i => `<div class="proj-expense-val">-${formatCurrency(i.amount)} <span style="font-size:0.75em;color:var(--text-muted)">(${i.name})</span></div>`).join('');
        }

        // Daily
        let dailyHtml = '—';
        if (day.isFuture) {
            if (day.dailySpending > 0) dailyHtml = `<span class="proj-expense-val">-${formatCurrency(day.dailySpending)}</span>`;
        } else {
            // Real vs Limit
            const isOver = day.dailySpending > day.expectedDailyLimit;
            dailyHtml = `
                <span class="timeline-real ${isOver ? 'timeline-over' : (day.dailySpending > 0 ? 'timeline-ok' : '')}">${formatCurrency(day.dailySpending)}</span>
                <span class="timeline-limit">/ ${formatCurrency(day.expectedDailyLimit)}</span>
            `;
            if (day.dailySpending > 0) {
                dailyHtml = `<button class="expand-btn" data-day="daily-${idx}" onclick="toggleProjectionDetail('daily-${idx}')">▶</button>` + dailyHtml;
            }
        }

        // Daily Breakdown Detail
        const dailyBreakdownItems = Object.entries(day.dailyBreakdown || {})
            .filter(([, v]) => v > 0)
            .map(([catId, amount]) => {
                const cat = getCategoryById(catId);
                return `<span class="detail-item"><span class="detail-dot" style="background:${cat.color}"></span>${cat.name}: ${formatCurrency(amount)}</span>`;
            }).join('');
        const hasDailyBreakdown = dailyBreakdownItems.length > 0;

        // Monthly
        let monthlyHtml = '—';
        if (day.isFuture) {
            if (day.monthlySpending > 0) {
                monthlyHtml = `<button class="expand-btn" data-day="${idx}" onclick="toggleProjectionDetail(${idx})">▶</button><span class="proj-expense-val">-${formatCurrency(day.monthlySpending)}</span>`;
            }
        } else {
            const hasExpBtn = day.expectedMonthlyLimit > 0 ? `<button class="expand-btn" data-day="${idx}" onclick="toggleProjectionDetail(${idx})">▶</button>` : '';
            monthlyHtml = `
                ${hasExpBtn}<span class="timeline-real">${formatCurrency(day.monthlySpending)}</span>
                <span class="timeline-limit">/ dist: ${formatCurrency(day.expectedMonthlyLimit)}</span>
            `;
        }

        return `<tr class="${rowClass}">
            <td class="proj-date-col">${formatDateShort(day.date)}</td>
            <td>${incHtml}</td>
            <td>${recExpHtml}</td>
            <td>${dailyHtml}</td>
            <td>${monthlyHtml}</td>
            <td style="font-weight:600;${day.dayTotal >= 0 ? 'color:var(--income)' : 'color:var(--expense)'}">${day.dayTotal >= 0 ? '+' : ''}${formatCurrency(day.dayTotal)}</td>
            <td style="font-weight:700;${day.balance >= 0 ? 'color:var(--income)' : 'color:var(--expense)'}">${formatCurrency(day.balance)}</td>
        </tr>
        ${hasBreakdown ? `<tr class="projection-detail hidden" id="detail-${idx}"><td></td><td colspan="6"><div class="detail-breakdown"><span style="font-size:0.75rem;margin-right:8px;font-weight:600;color:var(--text-muted)">Orç. Mensal:</span> ${breakdownItems}</div></td></tr>` : ''}
        ${hasDailyBreakdown ? `<tr class="projection-detail hidden" id="detail-daily-${idx}"><td></td><td colspan="6"><div class="detail-breakdown"><span style="font-size:0.75rem;margin-right:8px;font-weight:600;color:var(--text-muted)">Gastos Diários:</span> ${dailyBreakdownItems}</div></td></tr>` : ''}`;
    }).join('');

    if (typeof updateAllCharts === 'function') updateAllCharts();
}

function toggleProjectionDetail(idx) {
    const detail = document.getElementById(`detail-${idx}`);
    const btn = document.querySelector(`[data-day="${idx}"]`);
    if (detail) {
        detail.classList.toggle('hidden');
        if (btn) btn.textContent = detail.classList.contains('hidden') ? '▶' : '▼';
    }
}

// ===== POPULATE HELPERS =====
function populateCategoryFilter() {
    const sel = document.getElementById('filter-category');
    sel.innerHTML = '<option value="all">Todas as categorias</option>';
    ALL_CATEGORIES.forEach(c => { sel.innerHTML += `<option value="${c.id}">${c.name}</option>`; });
}
function populateFormCategories(type = 'expense') {
    const sel = document.getElementById('tx-category');
    sel.innerHTML = (state.categories[type] || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}
function populateFormBanks() {
    const sel = document.getElementById('tx-bank');
    sel.innerHTML = '<option value="">Sem conta específica</option>' + 
        state.banks.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
}

// ===== NAVIGATION =====
function switchSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(sectionId).classList.add('active');
    document.querySelector(`.nav-item[data-section="${sectionId.replace('section-', '')}"]`).classList.add('active');

    const titles = {
        'section-dashboard': 'Dashboard',
        'section-transactions': 'Transações',
        'section-budget': 'Orçamento',
        'section-categories': 'Categorias',
        'section-banks': 'Minhas Contas',
        'section-projection': 'Visão Mensal',
        'section-investments': 'Investimentos'
    };
    document.getElementById('page-title').textContent = titles[sectionId] || 'Dashboard';
    
    // Hide month navigator in sections that don't need it
    const monthNav = document.getElementById('month-navigator');
    if (sectionId === 'section-banks' || sectionId === 'section-categories' || sectionId === 'section-investments') {
        monthNav.style.display = 'none';
    } else {
        monthNav.style.display = 'flex';
    }

    if(window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebar-overlay').classList.remove('open');
    }
}

function navigateTo(section) {
    state.currentSection = section;
    switchSection('section-' + section);
    if (section === 'transactions') renderTransactionsPage();
    if (section === 'budget') renderBudgetPage();
    if (section === 'categories') renderCategoriesPage();
    if (section === 'projection') renderProjectionPage();
    if (section === 'banks') renderBanksPage();
    if (section === 'investments') renderInvestmentsPage();
    closeMobileSidebar();
}

function changeMonth(delta) {
    state.currentMonth.setMonth(state.currentMonth.getMonth() + delta);
    document.getElementById('month-display').textContent = formatMonthYear(state.currentMonth);
    refreshAll();
}

// ===== MODALS =====
function openModal(id) { document.getElementById(id).classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { document.getElementById(id).classList.remove('open'); document.body.style.overflow = ''; }
function openMobileSidebar() { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebar-overlay').classList.add('open'); }
function closeMobileSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebar-overlay').classList.remove('open'); }

function openBudgetModal() {
    const list = document.getElementById('budget-form-list');
    list.innerHTML = state.categories.expense.map(cat => {
        const config = state.budgets[cat.id] || { type: 'monthly', limit: 0, distribution: 'spread', fixedDay: 1 };
        const isDaily = config.type === 'daily';
        const isFixed = config.distribution === 'fixed';
        
        return `<div class="budget-form-item" data-cat-wrap="${cat.id}">
            <div class="budget-form-label"><span class="budget-form-dot" style="background:${cat.color}"></span>${cat.name}</div>
            <div class="budget-form-fields">
                <div>
                    <label>Tipo</label>
                    <select data-cat="${cat.id}" data-field="type" onchange="onBudgetTypeChange(this)">
                        <option value="monthly" ${!isDaily ? 'selected' : ''}>Mensal</option>
                        <option value="daily" ${isDaily ? 'selected' : ''}>Diário</option>
                    </select>
                </div>
                <div>
                    <label>Limite (R$)</label>
                    <input type="number" data-cat="${cat.id}" data-field="limit" value="${config.limit || ''}" placeholder="0" min="0" step="10">
                </div>
                <div class="budget-monthly-opt ${isDaily ? 'hidden-field' : ''}">
                    <label>Distribuição</label>
                    <select data-cat="${cat.id}" data-field="distribution" onchange="onDistributionChange(this)">
                        <option value="spread" ${!isFixed ? 'selected' : ''}>Ao longo do mês</option>
                        <option value="fixed" ${isFixed ? 'selected' : ''}>Dia único</option>
                    </select>
                </div>
                <div class="budget-monthly-opt ${isDaily || !isFixed ? 'hidden-field' : ''} fixed-day-field">
                    <label>Dia fixo</label>
                    <input type="number" data-cat="${cat.id}" data-field="fixedDay" value="${config.fixedDay || 1}" min="1" max="31" step="1">
                </div>
            </div>
        </div>`;
    }).join('');
    openModal('budget-modal');
}

function onBudgetTypeChange(sel) {
    const catId = sel.dataset.cat;
    const wrap = sel.closest(`[data-cat-wrap="${catId}"]`);
    const monthlyOpts = wrap.querySelectorAll('.budget-monthly-opt');
    const distSel = wrap.querySelector(`[data-field="distribution"]`);
    const fixedField = wrap.querySelector('.fixed-day-field');
    
    if (sel.value === 'daily') {
        monthlyOpts.forEach(el => el.classList.add('hidden-field'));
    } else {
        monthlyOpts.forEach(el => {
            if (!el.classList.contains('fixed-day-field')) el.classList.remove('hidden-field');
        });
        if (distSel.value === 'fixed') fixedField.classList.remove('hidden-field');
    }
}

function onDistributionChange(sel) {
    const catId = sel.dataset.cat;
    const wrap = sel.closest(`[data-cat-wrap="${catId}"]`);
    const fixedField = wrap.querySelector('.fixed-day-field');
    
    if (sel.value === 'fixed') { 
        fixedField.classList.remove('hidden-field'); 
    } else { 
        fixedField.classList.add('hidden-field'); 
    }
}

function openCategoryModal(type) {
    document.getElementById('cat-type').value = type;
    document.getElementById('cat-name').value = '';
    // Color picker
    const cp = document.getElementById('color-picker');
    cp.innerHTML = COLOR_POOL.map((c, i) => `<button type="button" class="color-option${i === 0 ? ' selected' : ''}" data-color="${c}" style="background:${c}" onclick="selectColor(this)"></button>`).join('');
    // Icon picker
    const ip = document.getElementById('icon-picker');
    ip.innerHTML = ICON_POOL.map((ic, i) => `<button type="button" class="icon-option${i === 0 ? ' selected' : ''}" data-icon="${ic}" onclick="selectIcon(this)"><i data-lucide="${ic}"></i></button>`).join('');
    lucide.createIcons({ nodes: [ip] });
    openModal('category-modal');
}

function selectColor(el) {
    el.closest('.color-picker').querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
}
function selectIcon(el) {
    el.closest('.icon-picker').querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
}

// ===== REFRESH =====
function refreshAll() {
    document.getElementById('month-display').textContent = formatMonthYear(state.currentMonth);
    renderOverviewCards();
    renderRecentTransactions();
    if (state.currentSection === 'transactions') renderTransactionsPage();
    if (state.currentSection === 'budget') renderBudgetPage();
    if (state.currentSection === 'categories') renderCategoriesPage();
    if (state.currentSection === 'projection') renderProjectionPage();
    if (typeof updateAllCharts === 'function') updateAllCharts();
}

// ===== EXPORT / IMPORT =====
function exportData() {
    const data = { transactions: state.transactions, recurring: state.recurring, categories: state.categories, budgets: state.budgets, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `financaspro_backup_${toDateStr(new Date())}.json`; a.click();
    showToast('Dados exportados!', 'success');
}
function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const d = JSON.parse(e.target.result);
            if (d.transactions) state.transactions = d.transactions;
            if (d.recurring) state.recurring = d.recurring;
            if (d.categories) state.categories = d.categories;
            if (d.budgets) state.budgets = d.budgets;
            rebuildAllCategories();
            saveState();
            refreshAll();
            showToast(`Dados importados!`, 'success');
        } catch (err) { showToast('Erro ao importar.', 'error'); }
    };
    reader.readAsText(file);
}

// ===== EVENT LISTENERS =====
function initEventListeners() {
    // Nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => { e.preventDefault(); navigateTo(item.dataset.section); });
    });
    document.getElementById('link-see-all').addEventListener('click', (e) => { e.preventDefault(); navigateTo('transactions'); });
    document.getElementById('nav-projection').addEventListener('click', () => navigateTo('projection'));
    document.getElementById('nav-investments').addEventListener('click', () => navigateTo('investments'));

    // Month nav
    document.getElementById('btn-prev-month').addEventListener('click', () => changeMonth(-1));
    document.getElementById('btn-next-month').addEventListener('click', () => changeMonth(1));

    // Add transaction
    const openTxModal = () => { resetTransactionForm(); openModal('transaction-modal'); };
    document.getElementById('btn-add-transaction').addEventListener('click', openTxModal);
    const mb = document.getElementById('btn-add-mobile');
    if (mb) mb.addEventListener('click', openTxModal);

    // Close modals
    document.getElementById('btn-close-transaction-modal').addEventListener('click', () => closeModal('transaction-modal'));
    document.getElementById('btn-close-budget-modal').addEventListener('click', () => closeModal('budget-modal'));
    document.getElementById('btn-close-category-modal').addEventListener('click', () => closeModal('category-modal'));
    document.querySelectorAll('.modal-overlay').forEach(o => {
        o.addEventListener('click', (e) => { if (e.target === o) closeModal(o.id); });
    });

    // Type toggle
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tx-type').value = btn.dataset.type;
            populateFormCategories(btn.dataset.type);
        });
    });

    // Recurring toggle
    document.getElementById('tx-recurring-toggle').addEventListener('change', (e) => {
        document.getElementById('recurring-fields').classList.toggle('hidden', !e.target.checked);
    });

    // Toggle recurring list
    document.getElementById('btn-toggle-recurring').addEventListener('click', () => {
        document.getElementById('recurring-list').classList.toggle('collapsed');
    });

    // Transaction form submit
    document.getElementById('transaction-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const data = {
            type: document.getElementById('tx-type').value,
            amount: document.getElementById('tx-amount').value,
            category: document.getElementById('tx-category').value,
            bankId: document.getElementById('tx-bank').value || null,
            date: document.getElementById('tx-date').value,
            description: document.getElementById('tx-description').value.trim()
        };
        if (!data.amount || !data.date || !data.description) return;

        const isRecurring = document.getElementById('tx-recurring-toggle').checked;
        if (isRecurring) {
            addRecurring({
                ...data,
                frequency: document.getElementById('tx-frequency').value,
                startDate: data.date,
                endDate: document.getElementById('tx-end-date').value || null
            });
        } else {
            addTransaction(data);
        }
        closeModal('transaction-modal');
    });

    // Budget
    document.getElementById('btn-set-budget').addEventListener('click', openBudgetModal);
    document.getElementById('budget-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const budgets = {};
        state.categories.expense.forEach(cat => {
            const wrap = document.querySelector(`[data-cat-wrap="${cat.id}"]`);
            if (!wrap) return;
            const type = wrap.querySelector(`[data-field="type"]`).value;
            const limit = parseFloat(wrap.querySelector(`[data-field="limit"]`).value) || 0;
            if (limit > 0) {
                if (type === 'daily') {
                    budgets[cat.id] = { type: 'daily', limit };
                } else {
                    const dist = wrap.querySelector(`[data-field="distribution"]`).value;
                    const fixedDay = parseInt(wrap.querySelector(`[data-field="fixedDay"]`).value) || 1;
                    budgets[cat.id] = { type: 'monthly', limit, distribution: dist, fixedDay: dist === 'fixed' ? fixedDay : null };
                }
            }
        });
        saveBudgets(budgets);
        closeModal('budget-modal');
    });

    // Categories
    document.getElementById('btn-add-income-cat').addEventListener('click', () => openCategoryModal('income'));
    document.getElementById('btn-add-expense-cat').addEventListener('click', () => openCategoryModal('expense'));
    document.getElementById('category-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('cat-name').value.trim();
        const color = document.querySelector('#color-picker .color-option.selected')?.dataset.color || COLOR_POOL[0];
        const icon = document.querySelector('#icon-picker .icon-option.selected')?.dataset.icon || ICON_POOL[0];
        const type = document.getElementById('cat-type').value;
        if (!name) return;
        addCategory(type, { name, color, icon });
        closeModal('category-modal');
    });

    // Banks
    document.getElementById('btn-add-bank').addEventListener('click', () => {
        document.getElementById('bank-form').reset();
        const cp = document.getElementById('bank-color-picker');
        cp.innerHTML = COLOR_POOL.map((c, i) => `<button type="button" class="color-option${i === 0 ? ' selected' : ''}" data-color="${c}" style="background:${c}" onclick="selectColor(this)"></button>`).join('');
        const ip = document.getElementById('bank-icon-picker');
        ip.innerHTML = ICON_POOL.map((ic, i) => `<button type="button" class="icon-option${i === 0 ? ' selected' : ''}" data-icon="${ic}" onclick="selectIcon(this)"><i data-lucide="${ic}"></i></button>`).join('');
        lucide.createIcons({ nodes: [ip] });
        openModal('bank-modal');
    });
    document.getElementById('bank-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('bank-name').value.trim();
        const initialBalance = document.getElementById('bank-balance').value || 0;
        const color = document.querySelector('#bank-color-picker .color-option.selected')?.dataset.color || COLOR_POOL[0];
        const icon = document.querySelector('#bank-icon-picker .icon-option.selected')?.dataset.icon || ICON_POOL[0];
        if (!name) return;
        addBank({ name, initialBalance, color, icon });
        closeModal('bank-modal');
    });

    // Filters
    document.getElementById('filter-type').addEventListener('change', (e) => { state.filters.type = e.target.value; renderTransactionsPage(); });
    document.getElementById('filter-category').addEventListener('change', (e) => { state.filters.category = e.target.value; renderTransactionsPage(); });
    document.getElementById('search-input').addEventListener('input', (e) => { state.filters.search = e.target.value; renderTransactionsPage(); });

    // Export / Import
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file-input').click());
    document.getElementById('import-file-input').addEventListener('change', (e) => { if (e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; } });

    // Mobile
    document.getElementById('menu-toggle').addEventListener('click', openMobileSidebar);
    document.getElementById('sidebar-overlay').addEventListener('click', closeMobileSidebar);

    // Escape
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id)); });

    // Inv Events
    const btnAddInv = document.getElementById('btn-add-investment');
    
    const updateInvOptions = (isFixa) => {
        const sel = document.getElementById('inv-type');
        const yieldGrp = document.getElementById('inv-yield-group');
        if (sel) {
            sel.innerHTML = isFixa 
                ? '<option value="CDB">CDB</option><option value="Tesouro Direto">Tesouro Direto</option><option value="LCI/LCA">LCI / LCA</option><option value="Debêntures">Debêntures</option><option value="Outros">Outros</option>'
                : '<option value="Ações">Ações</option><option value="FIIs">FIIs</option><option value="ETFs">ETFs</option><option value="BDRs">BDRs</option><option value="Cripto">Criptomoedas</option><option value="Outros">Outros</option>';
        }
        if (yieldGrp) yieldGrp.style.display = isFixa ? 'block' : 'none';
        if (!isFixa) document.getElementById('inv-yield').value = '';
    };

    if(btnAddInv) btnAddInv.addEventListener('click', () => {
        document.getElementById('investment-form').reset();
        document.getElementById('inv-class').value = 'Renda Fixa';
        document.getElementById('inv-class-fixa').classList.add('active');
        document.getElementById('inv-class-var').classList.remove('active');
        updateInvOptions(true);
        document.getElementById('investment-modal').classList.add('open');
    });
    
    const invForm = document.getElementById('investment-form');
    if(invForm) invForm.addEventListener('submit', addInvestment);
    
    const invTxForm = document.getElementById('inv-tx-form');
    if(invTxForm) invTxForm.addEventListener('submit', addInvestmentTx);
    
    document.getElementById('inv-class-fixa')?.addEventListener('click', (e) => {
        document.getElementById('inv-class-fixa').classList.add('active');
        document.getElementById('inv-class-var').classList.remove('active');
        document.getElementById('inv-class').value = 'Renda Fixa';
        updateInvOptions(true);
    });
    document.getElementById('inv-class-var')?.addEventListener('click', (e) => {
        document.getElementById('inv-class-var').classList.add('active');
        document.getElementById('inv-class-fixa').classList.remove('active');
        document.getElementById('inv-class').value = 'Renda Variável';
        updateInvOptions(false);
    });
}

function resetTransactionForm() {
    document.getElementById('transaction-form').reset();
    document.getElementById('tx-type').value = 'expense';
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('type-btn-expense').classList.add('active');
    populateFormCategories('expense');
    populateFormBanks();
    document.getElementById('tx-date').value = toDateStr(new Date());
    document.getElementById('recurring-fields').classList.add('hidden');
}

// ===== INIT =====
async function init() {
    await loadState();

    // First visit: use defaults
    if (!state.categories.income || !state.categories.income.length) {
        state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
        let initialCats = [...state.categories.income.map(c => ({...c, type: 'income'})), ...state.categories.expense.map(c => ({...c, type: 'expense'}))];
        await sb.from('categories').upsert(initialCats).catch(()=>{});
    }
    rebuildAllCategories();

    await generateRecurringTransactions();

    document.getElementById('month-display').textContent = formatMonthYear(state.currentMonth);
    populateCategoryFilter();
    populateFormCategories('expense');
    populateFormBanks();
    initEventListeners();
    refreshAll();
    lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', init);
