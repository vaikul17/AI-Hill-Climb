from flask import Flask, render_template, request, jsonify
import numpy as np
import traceback, json

app = Flask(__name__)

# ──────────────────────────────────────────────
# Preset 2-D test functions with known optima
# ──────────────────────────────────────────────
PRESETS = [
    {
        "id": "bowl",
        "name": "Bowl: x² + y²",
        "expr": "x**2 + y**2",
        "range_lo": -5, "range_hi": 5,
        "known_min_pos": [0.0, 0.0], "known_min_val": 0.0,
    },
    {
        "id": "rosenbrock",
        "name": "Rosenbrock: (1−x)²+100(y−x²)²",
        "expr": "(1-x)**2 + 100*(y - x**2)**2",
        "range_lo": -2, "range_hi": 3,
        "known_min_pos": [1.0, 1.0], "known_min_val": 0.0,
    },
    {
        "id": "rastrigin",
        "name": "Rastrigin (2-D)",
        "expr": "20 + x**2 - 10*np.cos(2*np.pi*x) + y**2 - 10*np.cos(2*np.pi*y)",
        "range_lo": -5.12, "range_hi": 5.12,
        "known_min_pos": [0.0, 0.0], "known_min_val": 0.0,
    },
    {
        "id": "sine_landscape",
        "name": "Sine Landscape: sin(x)·cos(y)+0.1(x²+y²)",
        "expr": "np.sin(x)*np.cos(y) + 0.1*(x**2 + y**2)",
        "range_lo": -5, "range_hi": 5,
        "known_min_pos": None, "known_min_val": None,
    },
]

# ──────────────────────────────────────────────
# Safe evaluation helpers
# ──────────────────────────────────────────────
_SAFE_NS = {
    "__builtins__": {},
    "np": np, "sin": np.sin, "cos": np.cos,
    "exp": np.exp, "sqrt": np.sqrt, "abs": np.abs,
    "log": np.log, "pi": np.pi,
}

def safe_eval(expr, x, y):
    return eval(expr, {**_SAFE_NS, "x": x, "y": y})


def _round(v, d=6):
    if isinstance(v, (float, np.floating)):
        return round(float(v), d)
    return v

# ──────────────────────────────────────────────
# Grid-search global optimum
# ──────────────────────────────────────────────
def compute_global(expr, lo, hi, minimize=True, res=200):
    xs = np.linspace(lo, hi, res)
    ys = np.linspace(lo, hi, res)
    X, Y = np.meshgrid(xs, ys)
    try:
        Z = safe_eval(expr, X, Y)
    except Exception:
        return 0.0, 0.0, 0.0
    if minimize:
        idx = np.unravel_index(np.nanargmin(Z), Z.shape)
    else:
        idx = np.unravel_index(np.nanargmax(Z), Z.shape)
    return float(X[idx]), float(Y[idx]), float(Z[idx])

# ──────────────────────────────────────────────
# 8-connected neighbour directions
# ──────────────────────────────────────────────
DIRS = [(1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)]

# ──────────────────────────────────────────────
# Algorithm 1 — Simple Hill Climbing
# ──────────────────────────────────────────────
def simple_hc(expr, sx, sy, step, max_iter, minimize):
    x, y = float(sx), float(sy)
    fval = float(safe_eval(expr, x, y))
    path = [{"step": 0, "x": _round(x), "y": _round(y), "f": _round(fval), "action": "START"}]

    for i in range(1, max_iter + 1):
        idx = int(np.random.randint(len(DIRS)))
        dx, dy = DIRS[idx]
        nx, ny = x + dx * step, y + dy * step
        nf = float(safe_eval(expr, nx, ny))

        if (minimize and nf < fval) or (not minimize and nf > fval):
            x, y, fval = nx, ny, nf
            path.append({"step": i, "x": _round(x), "y": _round(y), "f": _round(fval), "action": "MOVE (found better)"})
        else:
            path.append({"step": i, "x": _round(x), "y": _round(y), "f": _round(fval), "action": "STAY (no improvement)"})
    return path

# ──────────────────────────────────────────────
# Algorithm 2 — Steepest-Ascent Hill Climbing
# ──────────────────────────────────────────────
def steepest_hc(expr, sx, sy, step, max_iter, minimize):
    x, y = float(sx), float(sy)
    fval = float(safe_eval(expr, x, y))
    path = [{"step": 0, "x": _round(x), "y": _round(y), "f": _round(fval), "action": "START"}]

    for i in range(1, max_iter + 1):
        best_x, best_y, best_f = x, y, fval
        improved = False
        for dx, dy in DIRS:
            nx, ny = x + dx * step, y + dy * step
            nf = float(safe_eval(expr, nx, ny))
            if (minimize and nf < best_f) or (not minimize and nf > best_f):
                best_x, best_y, best_f = nx, ny, nf
                improved = True
        if not improved:
            path.append({"step": i, "x": _round(x), "y": _round(y), "f": _round(fval), "action": "CONVERGED (local optimum)"})
            break
        x, y, fval = best_x, best_y, best_f
        path.append({"step": i, "x": _round(x), "y": _round(y), "f": _round(fval), "action": "MOVE (found better)"})
    return path

# ──────────────────────────────────────────────
# Algorithm 3 — Random-Restart Hill Climbing
# ──────────────────────────────────────────────
def random_restart_hc(expr, lo, hi, step, max_iter, minimize, num_restarts=5):
    all_runs = []
    best_idx = 0
    best_f = float('inf') if minimize else float('-inf')

    for r in range(num_restarts):
        sx = float(np.random.uniform(lo, hi))
        sy = float(np.random.uniform(lo, hi))
        path = steepest_hc(expr, sx, sy, step, max_iter, minimize)
        final = path[-1]
        run = {
            "restart": r + 1,
            "start": [_round(sx), _round(sy)],
            "path": path,
            "final_f": _round(final["f"]),
            "final_pos": [_round(final["x"]), _round(final["y"])],
        }
        all_runs.append(run)
        if (minimize and final["f"] < best_f) or (not minimize and final["f"] > best_f):
            best_f = final["f"]
            best_idx = r
    return all_runs, best_idx

# ──────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html", presets=PRESETS)


@app.route("/api/surface", methods=["POST"])
def api_surface():
    try:
        data = request.json
        expr = data["expr"]
        lo = float(data.get("range_lo", -5))
        hi = float(data.get("range_hi", 5))
        res = int(data.get("resolution", 80))

        xs = np.linspace(lo, hi, res)
        ys = np.linspace(lo, hi, res)
        X, Y = np.meshgrid(xs, ys)
        Z = safe_eval(expr, X, Y)
        # Replace non-finite with None for JSON
        Z = np.where(np.isfinite(Z), Z, np.nan)
        return jsonify({"x": xs.tolist(), "y": ys.tolist(), "z": np.nan_to_num(Z, nan=0).tolist()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/optimize", methods=["POST"])
def api_optimize():
    try:
        data = request.json
        expr = data["expr"]
        algo = data["algorithm"]
        step = float(data["step_size"])
        max_iter = int(data["max_iter"])
        minimize = data.get("minimize", True)
        lo = float(data.get("range_lo", -5))
        hi = float(data.get("range_hi", 5))

        # Grid-search global optimum
        gx, gy, gf = compute_global(expr, lo, hi, minimize)

        if algo == "simple":
            sx = float(data.get("start_x", 0))
            sy = float(data.get("start_y", 0))
            path = simple_hc(expr, sx, sy, step, max_iter, minimize)
            final = path[-1]
            result = {
                "algorithm": "Simple Hill Climbing",
                "path": path,
                "found": {"x": _round(final["x"]), "y": _round(final["y"]), "f": _round(final["f"])},
                "global": {"x": _round(gx), "y": _round(gy), "f": _round(gf)},
                "steps": len(path) - 1,
            }

        elif algo == "steepest":
            sx = float(data.get("start_x", 0))
            sy = float(data.get("start_y", 0))
            path = steepest_hc(expr, sx, sy, step, max_iter, minimize)
            final = path[-1]
            result = {
                "algorithm": "Steepest Ascent Hill Climbing",
                "path": path,
                "found": {"x": _round(final["x"]), "y": _round(final["y"]), "f": _round(final["f"])},
                "global": {"x": _round(gx), "y": _round(gy), "f": _round(gf)},
                "steps": len(path) - 1,
            }

        elif algo == "random_restart":
            all_runs, best_idx = random_restart_hc(expr, lo, hi, step, max_iter, minimize)
            best = all_runs[best_idx]
            result = {
                "algorithm": "Random-Restart Hill Climbing",
                "all_runs": all_runs,
                "best_run": best_idx,
                "path": best["path"],
                "found": {"x": best["final_pos"][0], "y": best["final_pos"][1], "f": best["final_f"]},
                "global": {"x": _round(gx), "y": _round(gy), "f": _round(gf)},
                "steps": sum(len(r["path"]) for r in all_runs),
            }
        else:
            return jsonify({"error": "Unknown algorithm"}), 400

        # Distance metric
        dist = float(np.sqrt((result["found"]["x"] - gx)**2 + (result["found"]["y"] - gy)**2))
        f_dist = abs(result["found"]["f"] - gf)
        result["distance_to_global"] = _round(dist)
        result["is_global"] = f_dist < 0.05  # value-based heuristic
        result["expr"] = expr
        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
