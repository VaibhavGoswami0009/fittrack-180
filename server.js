// server.js - the backend of FitTrack 180
// It serves the website and provides API routes to read/save data.
// Data is now stored PER USERNAME, so multiple people can use the same site separately.

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "data.json");
const TOTAL_DAYS = 180;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- Weekly workout plan (0 = Sunday ... 6 = Saturday) ----------
const WEEK_PLAN = {
  0: { name: "Rest Day", exercises: [] },
  1: {
    name: "Push Day (Chest + Triceps)",
    exercises: [
      { name: "Bench Press", sets: "4 × 10" },
      { name: "Incline Dumbbell Press", sets: "3 × 12" },
      { name: "Cable Fly", sets: "3 × 12" },
      { name: "Tricep Pushdown", sets: "3 × 12" },
    ],
  },
  2: {
    name: "Pull Day (Back + Biceps)",
    exercises: [
      { name: "Lat Pulldown", sets: "4 × 10" },
      { name: "Seated Cable Row", sets: "3 × 12" },
      { name: "Dumbbell Curl", sets: "3 × 12" },
      { name: "Hammer Curl", sets: "3 × 12" },
    ],
  },
  3: {
    name: "Leg Day",
    exercises: [
      { name: "Squat", sets: "4 × 10" },
      { name: "Leg Press", sets: "3 × 12" },
      { name: "Leg Curl", sets: "3 × 12" },
      { name: "Calf Raise", sets: "4 × 15" },
    ],
  },
  4: {
    name: "Shoulders + Abs",
    exercises: [
      { name: "Shoulder Press", sets: "4 × 10" },
      { name: "Lateral Raise", sets: "3 × 15" },
      { name: "Face Pull", sets: "3 × 15" },
      { name: "Plank", sets: "3 × 45 sec" },
    ],
  },
  5: {
    name: "Full Body",
    exercises: [
      { name: "Deadlift", sets: "3 × 8" },
      { name: "Push-ups", sets: "3 × 15" },
      { name: "Dumbbell Row", sets: "3 × 12" },
      { name: "Lunges", sets: "3 × 12" },
    ],
  },
  6: {
    name: "Cardio + Core",
    exercises: [
      { name: "Brisk Walk or Jog", sets: "30 min" },
      { name: "Crunches", sets: "3 × 20" },
      { name: "Leg Raises", sets: "3 × 15" },
      { name: "Russian Twist", sets: "3 × 20" },
    ],
  },
};

// ---------- Helper: turn a typed name into a safe, consistent key ----------
function normalizeUsername(raw) {
  return String(raw || "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
}

// ---------- Helper functions: reading and saving the WHOLE file ----------
function emptyUserData() {
  return { profile: null, weights: [], workouts: {}, meals: {} };
}

function readAll() {
  if (!fs.existsSync(DATA_FILE)) return { users: {} };
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  if (!raw.users) return { users: {} }; // handles old single-user file format
  return raw;
}

function writeAll(all) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(all, null, 2));
}

// Get one user's data, creating an empty record if they're new
function getUser(all, username) {
  if (!all.users[username]) all.users[username] = emptyUserData();
  return all.users[username];
}

// ---------- Helper functions: dates (format is YYYY-MM-DD) ----------
function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayString() {
  return toDateString(new Date());
}

function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(str, n) {
  const date = parseDate(str);
  date.setDate(date.getDate() + n);
  return toDateString(date);
}

function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

// ---------- What happened on one particular day? ----------
function getDayResult(data, dateStr) {
  const profile = data.profile;
  const plan = WEEK_PLAN[parseDate(dateStr).getDay()];
  const doneExercises = data.workouts[dateStr] || [];
  const meals = data.meals[dateStr] || [];

  let calories = 0;
  let protein = 0;
  meals.forEach((m) => {
    calories += m.calories;
    protein += m.protein;
  });

  const weightLogged = data.weights.some((w) => w.date === dateStr);

  return {
    plan,
    doneExercises,
    meals,
    calories,
    protein,
    workoutOk: plan.exercises.length === 0 || doneExercises.length >= plan.exercises.length,
    calorieOk: calories >= profile.calorieGoal * 0.9,
    proteinOk: protein >= profile.proteinGoal,
    weightOk: weightLogged,
    hasActivity: doneExercises.length > 0 || meals.length > 0 || weightLogged,
  };
}

function getDayStatus(data, dateStr, today) {
  if (dateStr > today) return "future";
  const r = getDayResult(data, dateStr);
  if (r.workoutOk && r.calorieOk && r.proteinOk) return "completed";
  if (r.hasActivity) return "partial";
  return dateStr < today ? "missed" : "pending";
}

// ---------- Build everything the frontend needs, for ONE user ----------
function buildState(data) {
  if (!data.profile) return { profile: null };

  const profile = data.profile;
  const today = todayString();
  const dayNumber = Math.min(TOTAL_DAYS, Math.max(1, daysBetween(profile.startDate, today) + 1));

  const journey = [];
  for (let i = 0; i < TOTAL_DAYS; i++) {
    const date = addDays(profile.startDate, i);
    journey.push({
      day: i + 1,
      date,
      status: getDayStatus(data, date, today),
      isToday: date === today,
    });
  }
  const daysCompleted = journey.filter((d) => d.status === "completed").length;

  let streak = 0;
  let i = dayNumber - 1;
  if (journey[i].status !== "completed") i--;
  while (i >= 0 && journey[i].status === "completed") {
    streak++;
    i--;
  }

  const t = getDayResult(data, today);
  const tasks = [
    { label: "Complete today's workout", done: t.workoutOk },
    { label: "Reach calorie goal", done: t.calorieOk },
    { label: "Reach protein goal", done: t.proteinOk },
    { label: "Update weight today", done: t.weightOk },
  ];
  const tasksDone = tasks.filter((x) => x.done).length;

  const weights = data.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
  const currentWeight = weights.length ? weights[weights.length - 1].weight : profile.startWeight;

  const exercises = t.plan.exercises.map((e) => ({ ...e, done: t.doneExercises.includes(e.name) }));
  const history = [];
  for (let k = 6; k >= 0; k--) {
    const date = addDays(today, -k);
    if (date < profile.startDate) continue;
    const r = getDayResult(data, date);
    history.push({ date, name: r.plan.name, done: r.doneExercises.length, total: r.plan.exercises.length });
  }

  return {
    profile,
    today,
    dayNumber,
    totalDays: TOTAL_DAYS,
    overallPercent: Math.round((dayNumber / TOTAL_DAYS) * 100),
    daysCompleted,
    daysRemaining: TOTAL_DAYS - dayNumber,
    streak,
    weight: { start: profile.startWeight, current: currentWeight, target: profile.targetWeight, history: weights },
    workout: {
      name: t.plan.name,
      exercises,
      doneCount: exercises.filter((e) => e.done).length,
      total: exercises.length,
      history,
    },
    nutrition: {
      calories: t.calories,
      protein: t.protein,
      calorieGoal: profile.calorieGoal,
      proteinGoal: profile.proteinGoal,
      meals: t.meals,
    },
    mission: {
      tasks,
      tasksDone,
      totalTasks: tasks.length,
      percent: Math.round((tasksDone / tasks.length) * 100),
    },
    journey,
  };
}

// ---------- Middleware: read the username from every request ----------
// The frontend sends it as ?user=somename on every API call.
function requireUser(req, res, next) {
  const username = normalizeUsername(req.query.user);
  if (!username) return res.status(400).json({ error: "Please log in first." });
  req.username = username;
  next();
}

// =====================  API ROUTES  =====================

// Log in (or create a new user if the name hasn't been used before)
app.post("/api/login", (req, res) => {
  const username = normalizeUsername(req.body.username);
  if (!username) return res.status(400).json({ error: "Please enter a name." });

  const all = readAll();
  const user = getUser(all, username);
  writeAll(all);
  res.json({ username, state: buildState(user) });
});

// Get everything for the logged-in user
app.get("/api/state", requireUser, (req, res) => {
  const all = readAll();
  const user = getUser(all, req.username);
  res.json(buildState(user));
});

// Create or update the goal
app.post("/api/goal", requireUser, (req, res) => {
  const goalTypes = ["Fat Loss", "Muscle Gain", "Weight Gain", "Body Recomposition", "General Fitness"];
  const name = String(req.body.name || "").trim();
  const goalType = req.body.goalType;
  const startWeight = Number(req.body.startWeight);
  const targetWeight = Number(req.body.targetWeight);
  const calorieGoal = Number(req.body.calorieGoal);
  const proteinGoal = Number(req.body.proteinGoal);

  if (!name) return res.status(400).json({ error: "Please enter your name." });
  if (!goalTypes.includes(goalType)) return res.status(400).json({ error: "Please choose a goal type." });
  if (!(startWeight > 0) || !(targetWeight > 0)) return res.status(400).json({ error: "Enter valid weights." });
  if (!(calorieGoal > 0) || !(proteinGoal > 0)) return res.status(400).json({ error: "Enter valid calorie and protein goals." });

  const all = readAll();
  const user = getUser(all, req.username);

  if (!user.profile) {
    user.profile = { name, goalType, startWeight, targetWeight, calorieGoal, proteinGoal, startDate: todayString() };
    user.weights = [{ date: todayString(), weight: startWeight }];
  } else {
    Object.assign(user.profile, { name, goalType, startWeight, targetWeight, calorieGoal, proteinGoal });
    const first = user.weights.find((w) => w.date === user.profile.startDate);
    if (first) first.weight = startWeight;
  }
  writeAll(all);
  res.json(buildState(user));
});

// Tick / untick an exercise for today
app.post("/api/workout/toggle", requireUser, (req, res) => {
  const all = readAll();
  const user = getUser(all, req.username);
  if (!user.profile) return res.status(400).json({ error: "Set your goal first." });

  const today = todayString();
  const plan = WEEK_PLAN[new Date().getDay()];
  const exercise = req.body.exercise;
  if (!plan.exercises.some((e) => e.name === exercise)) {
    return res.status(400).json({ error: "That exercise is not in today's plan." });
  }

  const list = user.workouts[today] || [];
  user.workouts[today] = list.includes(exercise) ? list.filter((n) => n !== exercise) : [...list, exercise];
  writeAll(all);
  res.json(buildState(user));
});

// Add a meal for today
app.post("/api/meals", requireUser, (req, res) => {
  const all = readAll();
  const user = getUser(all, req.username);
  if (!user.profile) return res.status(400).json({ error: "Set your goal first." });

  const type = req.body.type;
  const name = String(req.body.name || "").trim();
  const calories = Number(req.body.calories);
  const protein = Number(req.body.protein);

  if (!["Breakfast", "Lunch", "Dinner"].includes(type)) return res.status(400).json({ error: "Choose Breakfast, Lunch or Dinner." });
  if (!name) return res.status(400).json({ error: "Enter the food name." });
  if (!Number.isFinite(calories) || calories < 0) return res.status(400).json({ error: "Enter valid calories." });
  if (!Number.isFinite(protein) || protein < 0) return res.status(400).json({ error: "Enter valid protein." });

  const today = todayString();
  if (!user.meals[today]) user.meals[today] = [];
  user.meals[today].push({ id: Date.now(), type, name, calories, protein });
  writeAll(all);
  res.json(buildState(user));
});

// Delete a meal
app.delete("/api/meals/:id", requireUser, (req, res) => {
  const all = readAll();
  const user = getUser(all, req.username);
  const today = todayString();
  const id = Number(req.params.id);
  user.meals[today] = (user.meals[today] || []).filter((m) => m.id !== id);
  writeAll(all);
  res.json(buildState(user));
});

// Save today's weight
app.post("/api/weight", requireUser, (req, res) => {
  const all = readAll();
  const user = getUser(all, req.username);
  if (!user.profile) return res.status(400).json({ error: "Set your goal first." });

  const weight = Number(req.body.weight);
  if (!(weight > 0)) return res.status(400).json({ error: "Enter a valid weight." });

  const today = todayString();
  const existing = user.weights.find((w) => w.date === today);
  if (existing) existing.weight = weight;
  else user.weights.push({ date: today, weight });
  writeAll(all);
  res.json(buildState(user));
});

// Reset ONLY this user's data
app.post("/api/reset", requireUser, (req, res) => {
  const all = readAll();
  all.users[req.username] = emptyUserData();
  writeAll(all);
  res.json({ ok: true });
});

// Start the server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`FitTrack 180 is running at http://localhost:${PORT}`);
});