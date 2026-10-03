// app.js - the frontend brain of FitTrack 180
// Now supports multiple users: each browser remembers its own username.

let state = null;
let username = localStorage.getItem("fittrack_username") || null;

function $(selector) { return document.querySelector(selector); }
function $all(selector) { return document.querySelectorAll(selector); }

function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function barHTML(percent, extraClass = "") {
  return `<div class="bar"><div class="fill ${extraClass}" style="width:${Math.min(100, percent)}%"></div></div>`;
}

// ---------- Talking to the backend ----------
// Every API call (except /api/login) needs to say WHICH user it's for.
async function api(url, method = "GET", body) {
  const sep = url.includes("?") ? "&" : "?";
  const fullUrl = url === "/api/login" ? url : `${url}${sep}user=${encodeURIComponent(username)}`;
  const options = { method, headers: { "Content-Type": "application/json" } };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(fullUrl, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

async function send(url, method, body, successText) {
  try {
    state = await api(url, method, body);
    renderAll();
    if (successText) showMessage(successText);
    return true;
  } catch (err) {
    showMessage(err.message, true);
    renderAll();
    return false;
  }
}

async function loadState() {
  try {
    state = await api("/api/state");
    renderAll();
  } catch (err) {
    showMessage("Cannot reach the server: " + err.message, true);
  }
}

// ---------- Login flow ----------
function showLogin() {
  $("#loginScreen").classList.remove("hidden");
  $(".layout").classList.add("hidden-layout");
}

function hideLogin() {
  $("#loginScreen").classList.add("hidden");
  $(".layout").classList.remove("hidden-layout");
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#loginName").value.trim();
  if (!name) return;
  try {
    const result = await api("/api/login", "POST", { username: name });
    username = result.username;
    localStorage.setItem("fittrack_username", username);
    state = result.state;
    hideLogin();
    renderAll();
    showPage("dashboard");
  } catch (err) {
    showMessage(err.message, true);
  }
});

$("#logoutBtn").addEventListener("click", () => {
  if (!confirm("Switch to a different user? You can log back in with the same name anytime.")) return;
  localStorage.removeItem("fittrack_username");
  username = null;
  state = null;
  showLogin();
});

async function start() {
  if (!username) {
    showLogin();
    return;
  }
  hideLogin();
  await loadState();
  showPage("dashboard");
}

// ---------- Messages ----------
let messageTimer;
function showMessage(text, isError = false) {
  const box = $("#message");
  box.textContent = text;
  box.className = "message" + (isError ? " error" : "");
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => box.classList.add("hidden"), 3500);
}

// ---------- Pages ----------
function showPage(name) {
  if ((!state || !state.profile) && name !== "goal") {
    showMessage("Please set your goal first.", true);
    name = "goal";
  }
  $all(".page").forEach((p) => p.classList.add("hidden"));
  $("#page-" + name).classList.remove("hidden");
  $all(".nav-btn[data-page]").forEach((b) => b.classList.toggle("active", b.dataset.page === name));
  if (name === "goal") fillGoalForm();
  window.scrollTo(0, 0);
}

function fillGoalForm() {
  if (!state || !state.profile) return;
  const p = state.profile;
  $("#gName").value = p.name;
  $("#gType").value = p.goalType;
  $("#gStart").value = p.startWeight;
  $("#gTarget").value = p.targetWeight;
  $("#gCalories").value = p.calorieGoal;
  $("#gProtein").value = p.proteinGoal;
}

// ---------- Drawing pieces of the page ----------
function renderAll() {
  $("#todayDate").textContent = new Date().toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });

  if (!state || !state.profile) {
    $("#userName").textContent = username ? "👤 " + username : "👤 Guest";
    $all(".js-summary").forEach((el) => (el.innerHTML = '<p class="muted">Save your goal to see your summary.</p>'));
    return;
  }

  $("#userName").textContent = "👤 " + state.profile.name;
  renderHero();
  renderCards();
  renderMission();
  $all(".js-weight").forEach((el) => (el.innerHTML = weightHTML()));
  $all(".js-journey").forEach((el) => (el.innerHTML = journeyHTML()));
  $all(".js-workout").forEach((el) => (el.innerHTML = workoutHTML()));
  $all(".js-meals").forEach((el) => (el.innerHTML = mealsHTML()));
  $all(".js-summary").forEach((el) => (el.innerHTML = summaryHTML()));
  $("#workoutHistory").innerHTML = historyHTML();
}

function renderHero() {
  $("#heroDay").textContent = `DAY ${state.dayNumber} / ${state.totalDays}`;
  $("#heroGoal").textContent = `${state.profile.name}'s goal: ${state.profile.goalType}`;
  $("#heroFill").style.width = state.overallPercent + "%";
  $("#heroText").textContent =
    `${state.overallPercent}% of the journey • ${state.daysCompleted} days completed • ${state.daysRemaining} days remaining`;
}

function renderCards() {
  const w = state.workout;
  const n = state.nutrition;
  const m = state.mission;

  const workoutText = w.total === 0 ? "Rest day" : `${w.doneCount} / ${w.total}`;
  const workoutPct = w.total === 0 ? 100 : Math.round((w.doneCount / w.total) * 100);
  const workoutNote = w.total === 0 ? "😴 Rest and recover" : workoutPct === 100 ? "✅ Completed" : `${workoutPct}% done`;
  const calPct = Math.round((n.calories / n.calorieGoal) * 100);
  const streakNote = state.streak > 0 ? "Keep it up!" : "Finish today's mission to start a streak";

  $("#cards").innerHTML = `
    <div class="card">
      <div class="stat-label">🏋️ Workout</div>
      <div class="stat-value">${workoutText}</div>
      ${barHTML(workoutPct, "green")}
      <div class="stat-note">${workoutNote}</div>
    </div>
    <div class="card">
      <div class="stat-label">🍽️ Nutrition</div>
      <div class="stat-value">${n.calories} / ${n.calorieGoal} kcal</div>
      ${barHTML(calPct)}
      <div class="stat-note">${calPct}%</div>
    </div>
    <div class="card">
      <div class="stat-label">🎯 Daily Goal</div>
      <div class="stat-value">${m.tasksDone} / ${m.totalTasks}</div>
      ${barHTML(m.percent)}
      <div class="stat-note">${m.percent}%</div>
    </div>
    <div class="card">
      <div class="stat-label">🔥 Streak</div>
      <div class="stat-value">${state.streak} Days</div>
      <div class="stat-note">${streakNote}</div>
    </div>`;
}

function renderMission() {
  $("#missionList").innerHTML = state.mission.tasks
    .map((t) => `<li class="${t.done ? "done" : ""}"><span>${t.done ? "✅" : "⬜"}</span>${esc(t.label)}</li>`)
    .join("");
  $("#missionSummary").innerHTML =
    barHTML(state.mission.percent) +
    `<p class="muted" style="margin-top:8px">Daily completion: ${state.mission.percent}% (${state.mission.tasksDone}/${state.mission.totalTasks})</p>`;
}

function weightHTML() {
  const w = state.weight;
  const change = Math.round((w.current - w.start) * 10) / 10;
  const changeText = change === 0 ? "No change yet" : `${change > 0 ? "+" : ""}${change} kg since start`;
  return `
    <div class="stats3">
      <div><span>Starting</span><b>${w.start} kg</b></div>
      <div><span>Current</span><b>${w.current} kg</b></div>
      <div><span>Target</span><b>${w.target} kg</b></div>
    </div>
    <p class="muted center">${changeText}</p>
    ${graphHTML(w)}`;
}

function graphHTML(w) {
  const values = w.history.map((h) => h.weight);
  if (values.length === 0) return "";

  const all = values.concat([w.target]);
  const min = Math.floor(Math.min(...all)) - 1;
  const max = Math.ceil(Math.max(...all)) + 1;
  const W = 320, H = 170, L = 38, R = 12, T = 12, B = 26;

  const x = (i) => (values.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (values.length - 1));
  const y = (v) => T + ((max - v) * (H - T - B)) / (max - min);

  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const dots = values.map((v, i) => `<circle class="g-dot" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4"/>`).join("");
  const first = w.history[0].date.slice(5);
  const last = w.history[w.history.length - 1].date.slice(5);
  const dateLabels = values.length > 1
    ? `<text class="g-text" x="${L}" y="${H - 8}">${first}</text><text class="g-text" x="${W - R}" y="${H - 8}" text-anchor="end">${last}</text>`
    : `<text class="g-text" x="${L}" y="${H - 8}">${first}</text>`;

  return `
    <svg class="graph-svg" viewBox="0 0 ${W} ${H}">
      <line class="g-axis" x1="${L}" y1="${T}" x2="${L}" y2="${H - B}"/>
      <line class="g-axis" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/>
      <line class="g-target" x1="${L}" y1="${y(w.target)}" x2="${W - R}" y2="${y(w.target)}"/>
      <text class="g-text" x="${L - 4}" y="${T + 4}" text-anchor="end">${max}</text>
      <text class="g-text" x="${L - 4}" y="${H - B}" text-anchor="end">${min}</text>
      <text class="g-text" x="${W - R}" y="${y(w.target) - 4}" text-anchor="end">Target ${w.target}</text>
      <polyline class="g-line" points="${points}"/>
      ${dots}
      ${dateLabels}
    </svg>`;
}

function journeyHTML() {
  return state.journey
    .map((d) => `<div class="day ${d.status}${d.isToday ? " today" : ""}" title="Day ${d.day} (${d.date}) - ${d.status}">${d.day}</div>`)
    .join("");
}

function workoutHTML() {
  const w = state.workout;
  if (w.total === 0) {
    return `<h4>${esc(w.name)}</h4><p class="muted">😴 No exercises today. Rest and recover!</p>`;
  }
  const pct = Math.round((w.doneCount / w.total) * 100);
  const rows = w.exercises
    .map((e) => `
      <li>
        <label><input type="checkbox" data-exercise="${esc(e.name)}" ${e.done ? "checked" : ""}><span>${esc(e.name)}</span></label>
        <b>${esc(e.sets)}</b>
      </li>`)
    .join("");
  return `
    <h4>${esc(w.name)}</h4>
    <p class="muted">${w.doneCount} / ${w.total} completed — ${pct}%</p>
    ${barHTML(pct, "green")}
    <ul class="checklist">${rows}</ul>`;
}

function historyHTML() {
  return state.workout.history
    .slice()
    .reverse()
    .map((h) => {
      const result = h.total === 0 ? "Rest day" : `${h.done}/${h.total} done`;
      return `<li><span>${h.date}</span><span>${esc(h.name)}</span><b>${result}</b></li>`;
    })
    .join("");
}

function mealsHTML() {
  const n = state.nutrition;
  const calPct = Math.round((n.calories / n.calorieGoal) * 100);
  const proPct = Math.round((n.protein / n.proteinGoal) * 100);
  const list = n.meals.length
    ? n.meals
        .map((m) => `
          <div class="meal-row">
            <span class="badge">${m.type}</span>
            <span class="name">${esc(m.name)}</span>
            <span>${m.calories} kcal · ${m.protein} g</span>
            <button class="del" data-delete="${m.id}" title="Delete">✕</button>
          </div>`)
        .join("")
    : '<p class="muted">No meals added today.</p>';
  return `
    <div class="nut-row">
      <div class="top"><span>Calories</span><b>${n.calories} / ${n.calorieGoal} kcal</b></div>
      ${barHTML(calPct)}
    </div>
    <div class="nut-row">
      <div class="top"><span>Protein</span><b>${n.protein} / ${n.proteinGoal} g</b></div>
      ${barHTML(proPct, "sky")}
    </div>
    ${list}`;
}

function summaryHTML() {
  const p = state.profile;
  const w = state.weight;
  const rows = [
    ["Goal type", p.goalType],
    ["Starting weight", w.start + " kg"],
    ["Current weight", w.current + " kg"],
    ["Target weight", w.target + " kg"],
    ["Days completed", state.daysCompleted],
    ["Days remaining", state.daysRemaining],
    ["Overall progress", state.overallPercent + "%"],
  ];
  return rows.map((r) => `<div class="sum-row"><span>${r[0]}</span><b>${esc(r[1])}</b></div>`).join("") + barHTML(state.overallPercent);
}

// ---------- Listening for clicks and form submits ----------
$all(".nav-btn[data-page]").forEach((btn) => {
  btn.addEventListener("click", () => showPage(btn.dataset.page));
});

document.addEventListener("change", (e) => {
  if (e.target.dataset.exercise) {
    send("/api/workout/toggle", "POST", { exercise: e.target.dataset.exercise });
  }
});

document.addEventListener("click", (e) => {
  const id = e.target.dataset.delete;
  if (id) send("/api/meals/" + id, "DELETE");
});

$("#goalForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ok = await send("/api/goal", "POST", {
    name: $("#gName").value,
    goalType: $("#gType").value,
    startWeight: $("#gStart").value,
    targetWeight: $("#gTarget").value,
    calorieGoal: $("#gCalories").value,
    proteinGoal: $("#gProtein").value,
  }, "Goal saved!");
  if (ok) showPage("dashboard");
});

$("#mealForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ok = await send("/api/meals", "POST", {
    type: $("#mealType").value,
    name: $("#mealName").value,
    calories: $("#mealCalories").value,
    protein: $("#mealProtein").value,
  }, "Meal added!");
  if (ok) e.target.reset();
});

$("#weightForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ok = await send("/api/weight", "POST", { weight: $("#weightInput").value }, "Weight saved!");
  if (ok) e.target.reset();
});

$("#resetBtn").addEventListener("click", async () => {
  if (!confirm("This will delete YOUR data and start fresh. Continue?")) return;
  try {
    await api("/api/reset", "POST");
    $("#goalForm").reset();
    await loadState();
    showMessage("Your data has been reset.");
    showPage("goal");
  } catch (err) {
    showMessage(err.message, true);
  }
});

// ---------- Start ----------
start();