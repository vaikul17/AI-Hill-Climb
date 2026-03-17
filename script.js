// UI Elements
const els = {
    preset: document.getElementById('function-preset'),
    funcInput: document.getElementById('function-input'),
    startX: document.getElementById('start-x'),
    stepSize: document.getElementById('step-size'),
    maxIter: document.getElementById('max-iter'),
    optType: document.getElementById('opt-type'),
    speed: document.getElementById('anim-speed'),
    speedLabel: document.getElementById('speed-label'),
    
    btnStart: document.getElementById('btn-start'),
    btnPause: document.getElementById('btn-pause'),
    btnReset: document.getElementById('btn-reset'),
    btnRestart: document.getElementById('btn-random-restart'),
    
    valStep: document.getElementById('val-step'),
    valX: document.getElementById('val-x'),
    valFx: document.getElementById('val-fx'),
    valDir: document.getElementById('val-dir'),
    
    statusMsg: document.getElementById('status-message'),
    
    resX: document.getElementById('res-x'),
    resFx: document.getElementById('res-fx'),
    resIter: document.getElementById('res-iter'),
    resType: document.getElementById('res-type'),
    resTypeContainer: document.getElementById('res-type-container')
};

// Application State
let state = {
    isRunning: false,
    isPaused: false,
    currentStep: 0,
    currentX: 0,
    currentFx: 0,
    pathX: [],
    pathY: [],
    timerId: null,
    
    // config params
    fn: null,
    fnString: '',
    stepSize: 0.1,
    maxIter: 100,
    isMax: false,
    delay: 200
};

// Initialize
function init() {
    setupEventListeners();
    updateFunctionAndPlot();
}

function setupEventListeners() {
    els.preset.addEventListener('change', (e) => {
        if (e.target.value !== 'custom') {
            els.funcInput.value = e.target.value;
            updateFunctionAndPlot();
        }
    });

    els.funcInput.addEventListener('change', updateFunctionAndPlot);
    els.startX.addEventListener('change', updatePlotOnly);
    els.speed.addEventListener('input', (e) => {
        state.delay = parseInt(e.target.value);
        els.speedLabel.textContent = `${state.delay} ms`;
    });

    els.btnStart.addEventListener('click', startSimulation);
    els.btnPause.addEventListener('click', togglePause);
    els.btnReset.addEventListener('click', resetSimulation);
    els.btnRestart.addEventListener('click', runRandomRestart);
}

function parseFunction() {
    state.fnString = els.funcInput.value;
    try {
        const compiled = math.compile(state.fnString);
        state.fn = (x) => compiled.evaluate({ x: x });
        
        // Test evaluation
        state.fn(0);
        return true;
    } catch (err) {
        setStatus("Error parsing function: " + err.message, "warning");
        return false;
    }
}

function updateFunctionAndPlot() {
    if (!parseFunction()) return;
    resetSimulationState();
    drawInitialPlot();
}

function updatePlotOnly() {
    if (!state.isRunning) {
        drawInitialPlot();
    }
}

function resetSimulationState() {
    stopTimer();
    state.isRunning = false;
    state.isPaused = false;
    state.currentStep = 0;
    state.pathX = [];
    state.pathY = [];
    
    els.valStep.textContent = '0';
    els.valX.textContent = '-';
    els.valFx.textContent = '-';
    els.valDir.textContent = '-';
    
    els.resX.textContent = '-';
    els.resFx.textContent = '-';
    els.resIter.textContent = '-';
    els.resType.textContent = '-';
    els.resTypeContainer.className = 'result-row';
    
    els.btnStart.disabled = false;
    els.btnPause.disabled = true;
    els.btnPause.textContent = 'Pause';
    els.funcInput.disabled = false;
    
    setStatus("Ready to start.", "active");
}

function resetSimulation() {
    resetSimulationState();
    drawInitialPlot();
}

function setStatus(msg, type = "") {
    els.statusMsg.textContent = msg;
    els.statusMsg.className = `status-box ${type}`;
}

// Plotting logic
function getPlotRange() {
    const startNum = parseFloat(els.startX.value) || 0;
    // Generate a range of [-10, 10] around the start, but extended if needed
    return {
        min: startNum - 10,
        max: startNum + 10
    };
}

function drawInitialPlot() {
    if (!state.fn) return;
    
    const range = getPlotRange();
    const xValues = [];
    const yValues = [];
    const points = 300;
    const step = (range.max - range.min) / points;
    
    let minY = Infinity;
    let maxY = -Infinity;

    for (let x = range.min; x <= range.max; x += step) {
        try {
            const y = state.fn(x);
            if (isFinite(y)) {
                xValues.push(x);
                yValues.push(y);
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        } catch(e) {}
    }

    const margin = (maxY - minY) * 0.1;
    if (margin === 0) { minY -= 1; maxY += 1; }

    const startXVal = parseFloat(els.startX.value) || 0;
    let startYVal = 0;
    try { startYVal = state.fn(startXVal); } catch(e){}

    const traceFn = {
        x: xValues,
        y: yValues,
        type: 'scatter',
        mode: 'lines',
        name: 'f(x)',
        line: { color: '#8b949e', width: 2 }
    };
    
    const traceStart = {
        x: [startXVal],
        y: [startYVal],
        type: 'scatter',
        mode: 'markers',
        name: 'Start',
        marker: { color: '#f85149', size: 10, symbol: 'circle' }
    };
    
    const tracePath = {
        x: [],
        y: [],
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Path',
        line: { color: '#58a6ff', width: 2, dash: 'dot' },
        marker: { color: '#58a6ff', size: 8 }
    };

    const traceCurrent = {
        x: [],
        y: [],
        type: 'scatter',
        mode: 'markers',
        name: 'Current',
        marker: { color: '#2ea043', size: 12, symbol: 'star' }
    };

    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#e6edf3', family: 'Inter' },
        margin: { t: 30, r: 20, b: 40, l: 50 },
        xaxis: { gridcolor: 'rgba(48,54,61,0.5)', zerolinecolor: 'rgba(139,148,158,0.5)' },
        yaxis: { 
            gridcolor: 'rgba(48,54,61,0.5)', 
            zerolinecolor: 'rgba(139,148,158,0.5)',
            range: [minY - margin, maxY + margin]
        },
        showlegend: false,
        hovermode: 'closest'
    };

    Plotly.newPlot('plot-container', [traceFn, traceStart, tracePath, traceCurrent], layout, {responsive: true});
}

// Simulation logic
function startSimulation() {
    if (!parseFunction()) return;
    
    state.currentX = parseFloat(els.startX.value) || 0;
    state.stepSize = parseFloat(els.stepSize.value) || 0.1;
    state.maxIter = parseInt(els.maxIter.value) || 100;
    state.isMax = els.optType.value === 'maximize';
    
    try {
        state.currentFx = state.fn(state.currentX);
    } catch(e) {
        setStatus("Error evaluating start point.", "warning");
        return;
    }
    
    // UI Updates
    els.btnStart.disabled = true;
    els.btnPause.disabled = false;
    els.funcInput.disabled = true;
    state.isRunning = true;
    state.isPaused = false;
    state.currentStep = 0;
    
    state.pathX = [state.currentX];
    state.pathY = [state.currentFx];
    
    updateUIMetrics("Start");
    setStatus("Optimization started...", "active");
    
    // Clear old path, set current
    Plotly.update('plot-container', {
        x: [[], [state.currentX]],
        y: [[], [state.currentFx]]
    }, {}, [2, 3]);

    scheduleNextStep();
}

function togglePause() {
    if (!state.isRunning) return;
    
    state.isPaused = !state.isPaused;
    if (state.isPaused) {
        stopTimer();
        els.btnPause.textContent = 'Resume';
        setStatus("Simulation paused.", "warning");
    } else {
        els.btnPause.textContent = 'Pause';
        setStatus("Simulation running...", "active");
        scheduleNextStep();
    }
}

function stopTimer() {
    if (state.timerId) {
        clearTimeout(state.timerId);
        state.timerId = null;
    }
}

function scheduleNextStep() {
    stopTimer();
    state.timerId = setTimeout(performStep, state.delay);
}

function performStep() {
    if (!state.isRunning || state.isPaused) return;
    
    if (state.currentStep >= state.maxIter) {
        finishSimulation("Max iterations reached.");
        return;
    }
    
    state.currentStep++;
    
    const leftX = state.currentX - state.stepSize;
    const rightX = state.currentX + state.stepSize;
    
    let leftY, rightY;
    try {
        leftY = state.fn(leftX);
        rightY = state.fn(rightX);
    } catch(e) {
        finishSimulation("Math error during evaluation.");
        return;
    }
    
    // Hill Climbing core logic
    let bestX = state.currentX;
    let bestY = state.currentFx;
    let dir = "None";
    
    if (state.isMax) {
        if (leftY > bestY) { bestX = leftX; bestY = leftY; dir = "Left"; }
        if (rightY > bestY) { bestX = rightX; bestY = rightY; dir = "Right"; }
    } else {
        if (leftY < bestY) { bestX = leftX; bestY = leftY; dir = "Left"; }
        if (rightY < bestY) { bestX = rightX; bestY = rightY; dir = "Right"; }
    }
    
    // Check if we improved
    if (bestX === state.currentX) {
        // Local optimum reached
        finishSimulation("Local/Global Optimum found!");
        return;
    }
    
    // Update state
    state.currentX = bestX;
    state.currentFx = bestY;
    state.pathX.push(state.currentX);
    state.pathY.push(state.currentFx);
    
    updateUIMetrics(dir);
    updatePlotFrame();
    
    scheduleNextStep();
}

function updateUIMetrics(dir) {
    els.valStep.textContent = state.currentStep;
    els.valX.textContent = state.currentX.toFixed(4);
    els.valFx.textContent = state.currentFx.toFixed(4);
    els.valDir.textContent = dir;
}

function updatePlotFrame() {
    Plotly.update('plot-container', {
        x: [state.pathX, [state.currentX]],
        y: [state.pathY, [state.currentFx]]
    }, {}, [2, 3]);
}

function finishSimulation(reason) {
    state.isRunning = false;
    els.btnPause.disabled = true;
    els.btnStart.disabled = false;
    els.funcInput.disabled = false;
    
    setStatus(reason, "success");
    
    els.resX.textContent = state.currentX.toFixed(4);
    els.resFx.textContent = state.currentFx.toFixed(4);
    els.resIter.textContent = state.currentStep;
    
    els.resTypeContainer.className = 'result-row highlight';
    // Small heuristic for local vs global: without global info, we just state Local Optimum
    els.resType.textContent = 'Likely Local Optimum';
}

// Random restart feature
function runRandomRestart() {
    if (!parseFunction()) return;
    if (state.isRunning) resetSimulation();
    
    const isMax = els.optType.value === 'maximize';
    const stepSize = parseFloat(els.stepSize.value) || 0.1;
    const maxIter = parseInt(els.maxIter.value) || 100;
    
    const tries = 5;
    const range = getPlotRange();
    
    let bestGlobalX = null;
    let bestGlobalY = isMax ? -Infinity : Infinity;
    
    let allPathsX = [];
    let allPathsY = [];
    
    for (let i = 0; i < tries; i++) {
        // Random start point within the observed range
        let x = range.min + Math.random() * (range.max - range.min);
        let y = state.fn(x);
        
        let pathX = [x];
        let pathY = [y];
        
        for (let j = 0; j < maxIter; j++) {
            let leftX = x - stepSize;
            let rightX = x + stepSize;
            let leftY = state.fn(leftX);
            let rightY = state.fn(rightX);
            
            let bestX = x;
            let bestY = y;
            
            if (isMax) {
                if (leftY > bestY) { bestX = leftX; bestY = leftY; }
                if (rightY > bestY) { bestX = rightX; bestY = rightY; }
            } else {
                if (leftY < bestY) { bestX = leftX; bestY = leftY; }
                if (rightY < bestY) { bestX = rightX; bestY = rightY; }
            }
            
            if (bestX === x) break;
            
            x = bestX;
            y = bestY;
            pathX.push(x);
            pathY.push(y);
        }
        
        allPathsX.push(pathX);
        allPathsY.push(pathY);
        
        if (isMax) {
            if (y > bestGlobalY) { bestGlobalX = x; bestGlobalY = y; }
        } else {
            if (y < bestGlobalY) { bestGlobalX = x; bestGlobalY = y; }
        }
    }
    
    // Draw all paths as separate traces, temporarily removing existing traces except fn
    const traceFn = document.getElementById('plot-container').data[0];
    const newTraces = [traceFn];
    
    const colors = ['#f85149', '#a371f7', '#d29922', '#58a6ff', '#2ea043'];
    
    for (let i = 0; i < tries; i++) {
        newTraces.push({
            x: allPathsX[i],
            y: allPathsY[i],
            type: 'scatter',
            mode: 'lines',
            opacity: 0.6,
            line: { color: colors[i % colors.length], width: 2 },
            name: `Try ${i+1}`
        });
        // End point
        newTraces.push({
            x: [allPathsX[i][allPathsX[i].length - 1]],
            y: [allPathsY[i][allPathsY[i].length - 1]],
            type: 'scatter',
            mode: 'markers',
            marker: { color: colors[i % colors.length], size: 8, symbol: 'square' },
            showlegend: false
        });
    }
    
    // Highlight the global best out of the restarts
    newTraces.push({
        x: [bestGlobalX],
        y: [bestGlobalY],
        type: 'scatter',
        mode: 'markers',
        name: 'Best Found',
        marker: { color: '#ffffff', size: 14, symbol: 'star', line: {color: '#d29922', width: 2} }
    });
    
    Plotly.react('plot-container', newTraces, document.getElementById('plot-container').layout);
    
    setStatus(`Ran ${tries} random restarts. Best found: x=${bestGlobalX.toFixed(4)}, f(x)=${bestGlobalY.toFixed(4)}`, "success");
    
    // Update results
    els.resX.textContent = bestGlobalX.toFixed(4);
    els.resFx.textContent = bestGlobalY.toFixed(4);
    els.resIter.textContent = "Multiple";
    els.resType.textContent = "Best over restarts";
}

// Bootstrap
window.onload = init;
