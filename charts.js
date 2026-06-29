/* ============================================
   FinançasPro v2 — Chart.js Configuration
   ============================================ */

let incomeExpensesChart = null;
let categoriesChart = null;
let balanceChart = null;
let projectionChart = null;

// --- Chart Defaults ---
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyleWidth = 10;
Chart.defaults.plugins.legend.labels.padding = 20;
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.95)';
Chart.defaults.plugins.tooltip.titleFont = { weight: '600' };
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.cornerRadius = 10;
Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.1)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.displayColors = true;
Chart.defaults.plugins.tooltip.boxPadding = 6;

// --- Data Functions ---
function getMonthlyChartData() {
    const months = [];
    const now = new Date(state.currentMonth);
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
        const txs = getMonthTransactions(d);
        const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        months.push({ label, income, expenses, savings: income - expenses });
    }
    return months;
}

function getBalanceChartData() {
    const months = [];
    const now = new Date(state.currentMonth);
    let runningBalance = 0;
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    state.transactions
        .filter(tx => new Date(tx.date + 'T12:00:00') < sixMonthsAgo)
        .forEach(tx => { runningBalance += tx.type === 'income' ? tx.amount : -tx.amount; });
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
        const txs = getMonthTransactions(d);
        txs.forEach(tx => { runningBalance += tx.type === 'income' ? tx.amount : -tx.amount; });
        months.push({ label, balance: runningBalance });
    }
    return months;
}

function getCategoryChartData() {
    const catExpenses = getCategoryExpenses(state.currentMonth);
    const entries = Object.entries(catExpenses)
        .map(([id, amount]) => ({ ...getCategoryById(id), amount }))
        .sort((a, b) => b.amount - a.amount);
    return {
        labels: entries.map(e => e.name),
        amounts: entries.map(e => e.amount),
        colors: entries.map(e => e.color)
    };
}

function getProjectionChartData() {
    const projection = calculateTimeline();
    return {
        labels: projection.map(d => formatDateShort(d.date)),
        balances: projection.map(d => d.balance)
    };
}

// --- Gradient Helper ---
function createGradient(ctx, color1, color2, height) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    return gradient;
}

// --- Create Charts ---
function initCharts() {
    const monthlyData = getMonthlyChartData();
    const balanceData = getBalanceChartData();
    const catData = getCategoryChartData();
    const projData = getProjectionChartData();

    // 1. Income vs Expenses Bar Chart
    const ctx1 = document.getElementById('chart-income-expenses')?.getContext('2d');
    if (ctx1) {
        incomeExpensesChart = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: monthlyData.map(m => m.label),
                datasets: [
                    { label: 'Receitas', data: monthlyData.map(m => m.income), backgroundColor: createGradient(ctx1, '#10b981', '#059669', 280), borderRadius: 6, borderSkipped: false, barPercentage: 0.7, categoryPercentage: 0.6 },
                    { label: 'Despesas', data: monthlyData.map(m => m.expenses), backgroundColor: createGradient(ctx1, '#ef4444', '#dc2626', 280), borderRadius: 6, borderSkipped: false, barPercentage: 0.7, categoryPercentage: 0.6 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: { legend: { position: 'top', align: 'end' }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}` } } },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { weight: '500' } } },
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { callback: (v) => `R$ ${(v / 1000).toFixed(0)}k`, maxTicksLimit: 5 } }
                }
            }
        });
    }

    // 2. Categories Doughnut Chart
    const ctx2 = document.getElementById('chart-categories')?.getContext('2d');
    if (ctx2) {
        categoriesChart = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: catData.labels,
                datasets: [{ data: catData.amounts, backgroundColor: catData.colors, borderWidth: 0, hoverBorderWidth: 3, hoverBorderColor: 'rgba(255,255,255,0.3)' }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '68%',
                plugins: {
                    legend: {
                        position: 'right', labels: {
                            usePointStyle: true, boxWidth: 10, boxHeight: 10, padding: 20,
                            color: '#475569',
                            font: { size: 11 },
                            generateLabels: (chart) => {
                                const data = chart.data, total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                                return data.labels.map((label, i) => ({ text: `${label} (${total > 0 ? Math.round(data.datasets[0].data[i] / total * 100) : 0}%)`, fillStyle: data.datasets[0].backgroundColor[i], strokeStyle: 'transparent', hidden: false, index: i, fontColor: '#475569', pointStyle: 'circle' }));
                            }
                        }
                    },
                    tooltip: { callbacks: { label: (ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); return `${ctx.label}: ${formatCurrency(ctx.parsed)} (${total > 0 ? Math.round(ctx.parsed / total * 100) : 0}%)`; } } }
                }
            }
        });
    }

    // 3. Balance Line Chart
    const ctx3 = document.getElementById('chart-balance')?.getContext('2d');
    if (ctx3) {
        const grad3 = ctx3.createLinearGradient(0, 0, 0, 280);
        grad3.addColorStop(0, 'rgba(139, 92, 246, 0.25)');
        grad3.addColorStop(1, 'rgba(139, 92, 246, 0)');
        balanceChart = new Chart(ctx3, {
            type: 'line',
            data: {
                labels: balanceData.map(m => m.label),
                datasets: [{ label: 'Saldo', data: balanceData.map(m => m.balance), borderColor: '#8b5cf6', borderWidth: 3, backgroundColor: grad3, fill: true, tension: 0.4, pointRadius: 5, pointHoverRadius: 8, pointBackgroundColor: '#8b5cf6', pointBorderColor: '#0f172a', pointBorderWidth: 3, pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `Saldo: ${formatCurrency(ctx.parsed.y)}` } } },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { weight: '500' } } },
                    y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { callback: (v) => `R$ ${(v / 1000).toFixed(0)}k`, maxTicksLimit: 5 } }
                }
            }
        });
    }

    // 4. Projection Line Chart
    const ctx4 = document.getElementById('chart-projection')?.getContext('2d');
    if (ctx4) {
        const grad4 = ctx4.createLinearGradient(0, 0, 0, 280);
        grad4.addColorStop(0, 'rgba(6, 182, 212, 0.2)');
        grad4.addColorStop(1, 'rgba(6, 182, 212, 0)');
        projectionChart = new Chart(ctx4, {
            type: 'line',
            data: {
                labels: projData.labels,
                datasets: [{ label: 'Saldo Projetado', data: projData.balances, borderColor: '#06b6d4', borderWidth: 2.5, backgroundColor: grad4, fill: true, tension: 0.3, pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: '#06b6d4', pointBorderColor: '#0f172a', pointBorderWidth: 2, borderDash: [6, 3] }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `Saldo: ${formatCurrency(ctx.parsed.y)}` } } },
                scales: {
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { weight: '500' } } },
                    y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { callback: (v) => `R$ ${(v / 1000).toFixed(0)}k`, maxTicksLimit: 5 } }
                }
            }
        });
    }
}

// --- Update Charts ---
function updateAllCharts() {
    const monthlyData = getMonthlyChartData();
    const balanceData = getBalanceChartData();
    const catData = getCategoryChartData();
    const projData = getProjectionChartData();

    if (incomeExpensesChart) {
        incomeExpensesChart.data.labels = monthlyData.map(m => m.label);
        incomeExpensesChart.data.datasets[0].data = monthlyData.map(m => m.income);
        incomeExpensesChart.data.datasets[1].data = monthlyData.map(m => m.expenses);
        incomeExpensesChart.update('none');
    }
    if (categoriesChart) {
        categoriesChart.data.labels = catData.labels;
        categoriesChart.data.datasets[0].data = catData.amounts;
        categoriesChart.data.datasets[0].backgroundColor = catData.colors;
        categoriesChart.update('none');
    }
    if (balanceChart) {
        balanceChart.data.labels = balanceData.map(m => m.label);
        balanceChart.data.datasets[0].data = balanceData.map(m => m.balance);
        balanceChart.update('none');
    }
    if (projectionChart) {
        projectionChart.data.labels = projData.labels;
        projectionChart.data.datasets[0].data = projData.balances;
        projectionChart.update('none');
    }
}

// --- Initialize after DOM ready ---
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initCharts, 100);
});
