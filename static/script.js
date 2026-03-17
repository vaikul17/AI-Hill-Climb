/* =====================================================
   Hill Climbing Optimization — Client-Side Controller
   ===================================================== */

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const DOM = {
    preset:   $('#sel-preset'),
    customGrp:$('#custom-expr-group'),
    exprInp:  $('#inp-expr'),
    algo:     $('#sel-algo'),
    goal:     $('#sel-goal'),
    sx:       $('#inp-sx'),
    sy:       $('#inp-sy'),
    startGrp: $('#start-pos-group'),
    rngStep:  $('#rng-step'),
    lblStep:  $('#lbl-step'),
    rngIter:  $('#rng-iter'),
    lblIter:  $('#lbl-iter'),
    rngSpeed: $('#rng-speed'),
    lblSpeed: $('#lbl-speed'),
    lo:       $('#inp-lo'),
    hi:       $('#inp-hi'),
    btnRun:   $('#btn-run'),
    btnReset: $('#btn-reset'),
    cardRow:  $('#card-row'),
    analysis: $('#analysis-section'),
};

const DARK_LAYOUT = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor:  'rgba(0,0,0,0)',
    font: { color: '#e5e7eb', family: 'Inter, sans-serif', size: 12 },
    margin: { t: 30, r: 20, b: 50, l: 60 },
};

let animTimer = null;   // id for the real-time animation interval

// ─── Init ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    syncPreset();
    initEmptyChart();
});

function bindEvents() {
    DOM.preset.addEventListener('change', () => { syncPreset(); });
    DOM.algo.addEventListener('change', () => {
        DOM.startGrp.style.display = DOM.algo.value === 'random_restart' ? 'none' : '';
    });
    DOM.rngStep.addEventListener('input', () => { DOM.lblStep.textContent = parseFloat(DOM.rngStep.value).toFixed(2); });
    DOM.rngIter.addEventListener('input', () => { DOM.lblIter.textContent = DOM.rngIter.value; });
    DOM.rngSpeed.addEventListener('input', () => { DOM.lblSpeed.textContent = `${DOM.rngSpeed.value} ms`; });
    DOM.btnRun.addEventListener('click', runOptimization);
    DOM.btnReset.addEventListener('click', resetUI);

    $$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
}

function syncPreset() {
    const opt = DOM.preset.options[DOM.preset.selectedIndex];
    if (DOM.preset.value === 'custom') {
        DOM.customGrp.style.display = '';
    } else {
        DOM.customGrp.style.display = 'none';
        DOM.lo.value = opt.dataset.lo;
        DOM.hi.value = opt.dataset.hi;
    }
}

function getExpr() {
    if (DOM.preset.value === 'custom') return DOM.exprInp.value;
    return DOM.preset.options[DOM.preset.selectedIndex].dataset.expr;
}

// ─── Tabs ───────────────────────────────────────
function switchTab(id) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
    $$('.tab-content').forEach(c => c.classList.toggle('active', c.id === id));
    const plotEl = $(`#${id} .plot-box`);
    if (plotEl) Plotly.Plots.resize(plotEl);
}

// ─── Empty chart placeholder ────────────────────
function initEmptyChart() {
    Plotly.newPlot('plot-conv', [{
        x: [], y: [],
        type: 'scatter', mode: 'lines+markers',
        marker: { size: 5, color: '#3b82f6' },
        line:   { color: '#3b82f6', width: 2 },
        name: 'f(x,y)',
    }], {
        ...DARK_LAYOUT,
        xaxis: { title: 'Step', gridcolor: 'rgba(255,255,255,0.06)', zeroline: false },
        yaxis: { title: 'f(x,y)', gridcolor: 'rgba(255,255,255,0.06)', zeroline: false },
        annotations: [{
            text: 'Click "Run Optimization" to begin',
            xref: 'paper', yref: 'paper', x: 0.5, y: 0.5,
            showarrow: false,
            font: { size: 16, color: '#6b7280' }
        }],
    }, { responsive: true });
}

// ─── Run Optimization ───────────────────────────
async function runOptimization() {
    stopAnimation();

    const expr = getExpr();
    const payload = {
        expr,
        algorithm: DOM.algo.value,
        step_size: parseFloat(DOM.rngStep.value),
        max_iter:  parseInt(DOM.rngIter.value),
        minimize:  DOM.goal.value === 'minimize',
        start_x:   parseFloat(DOM.sx.value),
        start_y:   parseFloat(DOM.sy.value),
        range_lo:  parseFloat(DOM.lo.value),
        range_hi:  parseFloat(DOM.hi.value),
    };

    DOM.btnRun.disabled = true;
    DOM.btnRun.textContent = '⏳ Running…';

    try {
        const res = await fetch('/api/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.error) { alert('Error: ' + data.error); return; }
        renderResults(data, expr);
    } catch (e) {
        alert('Request failed: ' + e);
    } finally {
        DOM.btnRun.disabled = false;
        DOM.btnRun.textContent = '▶ Run Optimization';
    }
}

// ─── Render Results ─────────────────────────────
function renderResults(data, expr) {
    // 1. Result cards (populated immediately)
    DOM.cardRow.style.display = '';
    $('#card-algo-name').textContent = data.algorithm;
    $('#card-algo-steps').textContent = `${data.steps} Steps`;
    $('#card-found-val').textContent = fmt(data.found.f);
    $('#card-found-pos').textContent = `at [${fmt(data.found.x)}, ${fmt(data.found.y)}]`;
    $('#card-global-val').textContent = fmt(data.global.f);
    $('#card-global-pos').textContent = `at [${fmt(data.global.x)}, ${fmt(data.global.y)}]`;

    const badge = $('#badge-verdict');
    if (data.is_global) {
        badge.textContent = 'GLOBAL OPTIMUM';
        badge.className = 'badge global';
    } else {
        badge.textContent = 'LOCAL OPTIMUM';
        badge.className = 'badge local';
    }
    $('#card-verdict-dist').textContent = `Distance: ${fmt(data.distance_to_global, 4)}`;

    // 2. Analysis section
    DOM.analysis.style.display = '';
    const foundCard = $('#ana-found');
    const foundBadge = $('#ana-found-badge');
    if (data.is_global) {
        foundBadge.textContent = 'GLOBAL OPTIMUM'; foundBadge.className = 'badge badge-green';
        foundCard.className = 'analysis-card glass is-global';
    } else {
        foundBadge.textContent = 'LOCAL OPTIMUM'; foundBadge.className = 'badge local';
        foundCard.className = 'analysis-card glass is-local';
    }
    $('#ana-found-pos').textContent = `Position: (${fmt(data.found.x, 4)}, ${fmt(data.found.y, 4)})`;
    $('#ana-found-val').textContent = `Value: f = ${fmt(data.found.f)}`;
    $('#ana-found-info').textContent = `${data.steps} steps using ${data.algorithm}`;

    $('#ana-global').className = 'analysis-card glass is-global';
    $('#ana-global-pos').textContent = `Position: (${fmt(data.global.x, 4)}, ${fmt(data.global.y, 4)})`;
    $('#ana-global-val').textContent = `Value: f = ${fmt(data.global.f)}`;
    $('#ana-global-info').textContent = `f(x, y) = ${expr}`;

    // 3. Build path(s) then animate
    if (data.all_runs) {
        animateConvergenceMulti(data);
    } else {
        animateConvergenceSingle(data.path, data.global);
    }

    // 4. Trace table
    renderTrace(data.path);
}

// ─── Real-Time Convergence Animation (single run) ─
function animateConvergenceSingle(path, global) {
    stopAnimation();
    const delay = parseInt(DOM.rngSpeed.value) || 30;

    // Prepare empty plot with global optimum reference line
    const traceMain = {
        x: [], y: [],
        type: 'scatter', mode: 'lines+markers',
        marker: { size: 5, color: '#3b82f6' },
        line:   { color: '#3b82f6', width: 2 },
        name: 'f(x,y)',
    };
    const traceGlobal = {
        x: [0, path.length - 1],
        y: [global.f, global.f],
        type: 'scatter', mode: 'lines',
        line: { color: '#22c55e', width: 2, dash: 'dash' },
        name: 'Global Optimum',
    };

    const layout = {
        ...DARK_LAYOUT,
        xaxis: { title: 'Step', gridcolor: 'rgba(255,255,255,0.06)', zeroline: false },
        yaxis: { title: 'f(x,y)', gridcolor: 'rgba(255,255,255,0.06)', zeroline: false },
        showlegend: true,
        legend: { font: { color: '#9ca3af' } },
    };

    Plotly.newPlot('plot-conv', [traceMain, traceGlobal], layout, { responsive: true });

    let idx = 0;
    animTimer = setInterval(() => {
        if (idx >= path.length) {
            stopAnimation();
            // Highlight final point
            Plotly.extendTraces('plot-conv', {
                x: [[path[path.length-1].step]],
                y: [[path[path.length-1].f]],
            }, [0]);
            return;
        }
        const p = path[idx];
        Plotly.extendTraces('plot-conv', { x: [[p.step]], y: [[p.f]] }, [0]);
        idx++;
    }, delay);
}

// ─── Real-Time Convergence Animation (random-restart) ─
function animateConvergenceMulti(data) {
    stopAnimation();
    const delay = parseInt(DOM.rngSpeed.value) || 30;
    const colors = ['#ef4444','#a855f7','#f59e0b','#3b82f6','#06b6d4','#ec4899'];

    // Pre-build all traces (one per restart), all starting empty
    const traces = data.all_runs.map((run, i) => ({
        x: [], y: [],
        type: 'scatter', mode: 'lines+markers',
        marker: { size: 4, color: colors[i % colors.length] },
        line:   { color: colors[i % colors.length], width: 2 },
        name: `Restart ${run.restart}`,
    }));
    // Add global reference line
    const totalSteps = data.all_runs.reduce((s, r) => s + r.path.length, 0);
    traces.push({
        x: [0, totalSteps],
        y: [data.global.f, data.global.f],
        type: 'scatter', mode: 'lines',
        line: { color: '#22c55e', width: 2, dash: 'dash' },
        name: 'Global Optimum',
    });

    const layout = {
        ...DARK_LAYOUT,
        xaxis: { title: 'Step (cumulative)', gridcolor: 'rgba(255,255,255,0.06)', zeroline: false },
        yaxis: { title: 'f(x,y)', gridcolor: 'rgba(255,255,255,0.06)', zeroline: false },
        showlegend: true,
        legend: { font: { color: '#9ca3af' } },
    };

    Plotly.newPlot('plot-conv', traces, layout, { responsive: true });

    // Flatten all runs into a sequential queue with (traceIndex, step, f)
    const queue = [];
    let cumStep = 0;
    data.all_runs.forEach((run, ri) => {
        run.path.forEach(p => {
            queue.push({ ti: ri, x: cumStep, y: p.f });
            cumStep++;
        });
    });

    let idx = 0;
    animTimer = setInterval(() => {
        if (idx >= queue.length) { stopAnimation(); return; }
        const q = queue[idx];
        Plotly.extendTraces('plot-conv', { x: [[q.x]], y: [[q.y]] }, [q.ti]);
        idx++;
    }, delay);
}

function stopAnimation() {
    if (animTimer) { clearInterval(animTimer); animTimer = null; }
}

// ─── Trace Table ────────────────────────────────
function renderTrace(path) {
    const ct = $('#trace-container');
    ct.innerHTML = '';
    const hdr = document.createElement('h3');
    hdr.className = 'section-title';
    hdr.textContent = 'Step-by-Step Trace';
    hdr.style.marginBottom = '12px';
    ct.appendChild(hdr);

    path.forEach(p => {
        const row = document.createElement('div');
        row.className = 'trace-row';

        const stepBadge = document.createElement('span');
        stepBadge.className = 'trace-step';
        stepBadge.textContent = `Step ${p.step}`;

        const coords = document.createElement('span');
        coords.textContent = `x=${fmt(p.x, 4)}, y=${fmt(p.y, 4)}`;

        const fval = document.createElement('span');
        fval.className = 'trace-f';
        fval.textContent = `f=${fmt(p.f)}`;

        const action = document.createElement('span');
        action.className = 'trace-action' + (p.action.includes('CONVERGED') ? ' converged' : '');
        action.textContent = p.action;

        row.append(stepBadge, sep(), coords, sep(), fval, sep(), action);
        ct.appendChild(row);
    });
}

// ─── Reset ──────────────────────────────────────
function resetUI() {
    stopAnimation();
    DOM.cardRow.style.display = 'none';
    DOM.analysis.style.display = 'none';
    $('#trace-container').innerHTML = '<p class="muted">Run an optimization to see the step-by-step trace.</p>';
    initEmptyChart();
}

// ─── Helpers ────────────────────────────────────
function fmt(v, d = 6) {
    if (typeof v === 'number') return v.toFixed(d);
    return String(v);
}
function sep() {
    const s = document.createElement('span');
    s.textContent = ' | ';
    s.style.color = 'rgba(255,255,255,0.15)';
    return s;
}
