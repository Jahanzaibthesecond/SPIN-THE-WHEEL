/* =====================================================================
   Football Tournament Spin Wheel
   Plain JavaScript, no build tools, no external libraries.
   Everything is in this one file so it stays easy to read and edit.
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. DATA / STATE
   Wheel names + titles are saved to localStorage so they survive
   a page refresh. The "forced winner" (admin pick) is deliberately
   NOT saved anywhere persistent -- it lives only in memory and is
   used exactly once, then cleared.
   ------------------------------------------------------------------- */

const STORAGE_KEY = "ftw_spin_wheel_data_v1";

const DEFAULT_NAMES_A = ["Arsenal", "Chelsea", "Liverpool", "Man City", "Man United", "Spurs"];
const DEFAULT_NAMES_B = ["Real Madrid", "Barcelona", "Bayern Munich", "PSG", "Juventus", "AC Milan"];

const SLICE_COLORS = [
  "#1c5c37", "#2e7d4f", "#0f4c2e", "#3c8a5c",
  "#155a3a", "#276b45", "#0d3d27", "#347a51"
];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.A && parsed.B) return parsed;
    }
  } catch (e) {
    /* ignore corrupted storage, fall back to defaults */
  }
  return {
    A: { title: "Wheel A", names: DEFAULT_NAMES_A.slice() },
    B: { title: "Wheel B", names: DEFAULT_NAMES_B.slice() }
  };
}

const state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* Rotation (in degrees) currently applied to each wheel, and whether
   it is mid-spin. Forced winner name is set by the admin panel. */
const wheelRuntime = {
  A: { rotation: 0, spinning: false, forcedWinner: null },
  B: { rotation: 0, spinning: false, forcedWinner: null }
};

/* ---------------------------------------------------------------------
   2. SMALL HELPERS
   ------------------------------------------------------------------- */

function getInitials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function elFor(wheelKey, id) {
  return document.getElementById(id + wheelKey);
}

/* ---------------------------------------------------------------------
   3. RENDERING THE WHEEL
   The wheel is a circular <div> whose background is a CSS conic
   gradient (equal-sized slices), with one label element per slice
   rotated into place around the center.
   ------------------------------------------------------------------- */

function renderWheel(key) {
  const data = state[key];
  const wheelEl = document.getElementById("wheel" + key);
  const names = data.names;
  const n = names.length;

  wheelEl.innerHTML = "";

  if (n === 0) {
    wheelEl.style.background = "#123522";
    return;
  }

  const sliceAngle = 360 / n;

  // Build the conic-gradient stops so every slice is exactly equal.
  const stops = [];
  for (let i = 0; i < n; i++) {
    const color = SLICE_COLORS[i % SLICE_COLORS.length];
    const start = i * sliceAngle;
    const end = (i + 1) * sliceAngle;
    stops.push(`${color} ${start}deg ${end}deg`);
  }
  wheelEl.style.background = `conic-gradient(${stops.join(", ")})`;

  // Thin dividing lines between slices for a cleaner look.
  const dividerStops = [];
  for (let i = 0; i < n; i++) {
    const angle = i * sliceAngle;
    dividerStops.push(`transparent ${angle}deg ${angle + 0.4}deg`);
  }

  for (let i = 0; i < n; i++) {
    const center = i * sliceAngle + sliceAngle / 2;

    const labelWrap = document.createElement("div");
    labelWrap.className = "slice-label";
    labelWrap.style.transform = `rotate(${center}deg)`;

    const inner = document.createElement("div");
    inner.className = "slice-label-inner";

    const badge = document.createElement("span");
    badge.className = "slice-badge";
    badge.textContent = getInitials(names[i]);

    const text = document.createElement("span");
    text.className = "slice-text";
    text.textContent = names[i];

    inner.appendChild(badge);
    inner.appendChild(text);
    labelWrap.appendChild(inner);
    wheelEl.appendChild(labelWrap);
  }
}

/* ---------------------------------------------------------------------
   4. RENDERING THE NAME EDITOR LIST
   ------------------------------------------------------------------- */

function renderList(key) {
  const data = state[key];
  const listEl = document.getElementById("list" + key);
  listEl.innerHTML = "";

  if (data.names.length === 0) {
    const hint = document.createElement("li");
    hint.className = "empty-hint";
    hint.textContent = "No names yet. Add at least two below.";
    listEl.appendChild(hint);
    return;
  }

  data.names.forEach((name, index) => {
    const li = document.createElement("li");
    li.className = "name-item";

    const badge = document.createElement("span");
    badge.className = "slice-badge";
    badge.textContent = getInitials(name);

    const input = document.createElement("input");
    input.type = "text";
    input.value = name;
    input.maxLength = 24;
    input.addEventListener("change", () => {
      const value = input.value.trim();
      if (value) {
        state[key].names[index] = value;
      } else {
        input.value = state[key].names[index];
      }
      saveState();
      renderWheel(key);
      renderList(key);
      refreshAdminOptions();
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-remove";
    removeBtn.title = "Remove";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      state[key].names.splice(index, 1);
      saveState();
      renderWheel(key);
      renderList(key);
      refreshAdminOptions();
    });

    li.appendChild(badge);
    li.appendChild(input);
    li.appendChild(removeBtn);
    listEl.appendChild(li);
  });
}

function renderAll() {
  ["A", "B"].forEach((key) => {
    document.getElementById("title" + key).value = state[key].title;
    renderWheel(key);
    renderList(key);
  });
  refreshAdminOptions();
}

/* ---------------------------------------------------------------------
   5. SPIN LOGIC
   This is the important part: the wheel always lands exactly on the
   chosen slice (random, or secretly forced by the admin panel), but
   every spin uses a randomized number of extra rotations, a
   randomized landing position within the slice, and a randomized
   duration -- so there is nothing mechanically different-looking
   about a "forced" spin versus a genuinely random one.
   ------------------------------------------------------------------- */

function pickTargetIndex(key) {
  const names = state[key].names;
  const n = names.length;
  const forced = wheelRuntime[key].forcedWinner;

  if (forced) {
    const idx = names.indexOf(forced);
    if (idx !== -1) return idx;
  }
  return Math.floor(Math.random() * n);
}

function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

function spinWheel(key, onDone) {
  const runtime = wheelRuntime[key];
  const names = state[key].names;

  if (runtime.spinning) return;
  if (names.length < 2) {
    alert("Add at least two names to " + state[key].title + " before spinning.");
    return;
  }

  const n = names.length;
  const sliceAngle = 360 / n;
  const targetIndex = pickTargetIndex(key);

  // Consume the forced pick -- it only applies to this one spin.
  runtime.forcedWinner = null;
  refreshAdminOptions();

  const sliceCenter = targetIndex * sliceAngle + sliceAngle / 2;

  // Land somewhere natural-looking inside the slice, never dead-center
  // and never right on an edge.
  const maxJitter = sliceAngle * 0.32;
  const jitter = (Math.random() * 2 - 1) * maxJitter;
  const desiredAngle = sliceCenter + jitter;

  // Randomized number of full rotations so spins don't feel identical.
  const extraSpins = 5 + Math.floor(Math.random() * 4); // 5-8 full turns

  const current = runtime.rotation;
  const currentMod = ((current % 360) + 360) % 360;
  const neededMod = ((360 - desiredAngle) % 360 + 360) % 360;

  let delta = neededMod - currentMod;
  if (delta < 0) delta += 360;
  delta += extraSpins * 360;

  const startRotation = current;
  const endRotation = current + delta;
  const duration = 4200 + Math.random() * 1800; // 4.2s - 6s

  runtime.spinning = true;
  updateSpinButtons();

  const wheelEl = document.getElementById("wheel" + key);
  const resultEl = document.getElementById("result" + key);
  resultEl.textContent = "";
  resultEl.classList.remove("show");

  const startTime = performance.now();

  function frame(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    const eased = easeOutQuart(t);
    const rotation = startRotation + (endRotation - startRotation) * eased;
    wheelEl.style.transform = `rotate(${rotation}deg)`;

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      runtime.rotation = endRotation;
      runtime.spinning = false;
      updateSpinButtons();
      const winnerName = names[targetIndex];
      resultEl.textContent = "🏆 " + winnerName + " wins!";
      resultEl.classList.add("show");
      if (typeof onDone === "function") onDone(winnerName);
    }
  }

  requestAnimationFrame(frame);
}

function updateSpinButtons() {
  const spinningAny = wheelRuntime.A.spinning || wheelRuntime.B.spinning;
  document.getElementById("spinA").disabled = wheelRuntime.A.spinning;
  document.getElementById("spinB").disabled = wheelRuntime.B.spinning;
  document.getElementById("spinBothBtn").disabled = spinningAny;
}

/* ---------------------------------------------------------------------
   6. HIDDEN ADMIN PANEL
   Opened only by:
     - tapping/clicking the small football emoji in the footer 5
       times within 2.5 seconds, or
     - the keyboard shortcut Ctrl+Shift+A (desktop).
   There is no visible button, label, or hint anywhere else in the
   public interface.
   ------------------------------------------------------------------- */

let secretTapCount = 0;
let secretTapTimer = null;

function registerSecretTap() {
  secretTapCount++;
  if (secretTapTimer) clearTimeout(secretTapTimer);
  secretTapTimer = setTimeout(() => {
    secretTapCount = 0;
  }, 2500);

  if (secretTapCount >= 5) {
    secretTapCount = 0;
    openAdmin();
  }
}

function openAdmin() {
  refreshAdminOptions();
  document.getElementById("adminOverlay").classList.remove("hidden");
}

function closeAdmin() {
  document.getElementById("adminOverlay").classList.add("hidden");
}

function refreshAdminOptions() {
  ["A", "B"].forEach((key) => {
    const select = document.getElementById("adminSelect" + key);
    if (!select) return;
    const currentValue = wheelRuntime[key].forcedWinner || "__random__";

    select.innerHTML = "";
    const randomOpt = document.createElement("option");
    randomOpt.value = "__random__";
    randomOpt.textContent = "Random (fair)";
    select.appendChild(randomOpt);

    state[key].names.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });

    select.value = currentValue;
    document.getElementById("adminTitle" + key).textContent = state[key].title;
  });
}

function wireAdminPanel() {
  document.getElementById("adminSelectA").addEventListener("change", (e) => {
    wheelRuntime.A.forcedWinner = e.target.value === "__random__" ? null : e.target.value;
  });
  document.getElementById("adminSelectB").addEventListener("change", (e) => {
    wheelRuntime.B.forcedWinner = e.target.value === "__random__" ? null : e.target.value;
  });
  document.getElementById("adminClearAll").addEventListener("click", () => {
    wheelRuntime.A.forcedWinner = null;
    wheelRuntime.B.forcedWinner = null;
    refreshAdminOptions();
  });
  document.getElementById("adminClose").addEventListener("click", closeAdmin);
  document.getElementById("adminOverlay").addEventListener("click", (e) => {
    if (e.target.id === "adminOverlay") closeAdmin();
  });
  document.getElementById("secretTap").addEventListener("click", registerSecretTap);

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) {
      e.preventDefault();
      const overlay = document.getElementById("adminOverlay");
      overlay.classList.contains("hidden") ? openAdmin() : closeAdmin();
    }
    if (e.key === "Escape") closeAdmin();
  });
}

/* ---------------------------------------------------------------------
   7. WIRING UP THE REST OF THE PUBLIC UI
   ------------------------------------------------------------------- */

function wireWheelColumn(key) {
  document.getElementById("title" + key).addEventListener("change", (e) => {
    const value = e.target.value.trim() || ("Wheel " + key);
    state[key].title = value;
    e.target.value = value;
    saveState();
    refreshAdminOptions();
  });

  document.getElementById("addForm" + key).addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("input" + key);
    const value = input.value.trim();
    if (!value) return;
    state[key].names.push(value);
    input.value = "";
    saveState();
    renderWheel(key);
    renderList(key);
    refreshAdminOptions();
  });

  document.getElementById("spin" + key).addEventListener("click", () => {
    spinWheel(key);
  });

  document.getElementById("reset" + key).addEventListener("click", () => {
    const defaults = key === "A" ? DEFAULT_NAMES_A : DEFAULT_NAMES_B;
    if (!confirm("Reset " + state[key].title + " to the default team list?")) return;
    state[key].names = defaults.slice();
    saveState();
    renderWheel(key);
    renderList(key);
    refreshAdminOptions();
  });
}

document.getElementById("spinBothBtn").addEventListener("click", () => {
  spinWheel("A");
  spinWheel("B");
});

wireWheelColumn("A");
wireWheelColumn("B");
wireAdminPanel();
renderAll();
updateSpinButtons();
