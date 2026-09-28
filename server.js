// server.js - the backend of FitTrack 180
// It serves the website and provides API routes to read/save data.

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "data.json");
const TOTAL_DAYS = 180;

// Middleware = small helpers that run on every request
app.use(express.json()); // lets us read JSON sent by the browser
app.use(express.static(path.join(__dirname, "public"))); // serves index.html, style.css, app.js

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

// ---------- Helper functions: reading and saving the JSON file ----------
function emptyData() {
  return { profile: null, weights: [], workouts: {}, meals: {} };
}

function readData() {
  if (!fs.existsSync(DATA_FILE)) return emptyData();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
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
    // Rest day counts as a finished workout
    workoutOk: plan.exercises.length === 0 || doneExercises.length >= plan.exercises.length,
    calorieOk: calories >= profile.calorieGoal * 0.9, // at least 90% of the calorie goal
    proteinOk: protein >= profile.proteinGoal,
    weightOk: weightLogged,
    hasActivity: doneExercises.length > 0 || meals.length > 0 || weightLogged,
  };
}

// completed = workout + calories + protein all done
// partial   = something was done
// missed    = past day with nothing done
function getDayStatus(data, dateStr, today) {
  if (dateStr > today) return "future";
  const r = getDayResult(data, dateStr);
  if (r.workoutOk && r.calorieOk && r.proteinOk) return "completed";
  if (r.hasActivity) return "partial";
  return dateStr < today ? "missed" : "pending";
}

// ---------- Build everything the frontend needs in one object ----------
function buildState(data) {
  if (!data.profile) return { profile: null };

  const profile = data.profile;
  const today = todayString();
  const dayNumber = Math.min(TOTAL_DAYS, Math.max(1, daysBetween(profile.startDate, today) + 1));

  // 180-day journey
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

  // Streak = completed days in a row (today counts only if it is completed)
  let streak = 0;
  let i = dayNumber - 1;
  if (journey[i].status !== "completed") i--;
  while (i >= 0 && journey[i].status === "completed") {
    streak++;
    i--;
  }

  // Today
  const t = getDayResult(data, today);
  const tasks = [
    { label: "Complete today's workout", done: t.workoutOk },
    { label: "Reach calorie goal", done: t.calorieOk },
    { label: "Reach protein goal", done: t.proteinOk },
    { label: "Update weight today", done: t.weightOk },
  ];
  const tasksDone = tasks.filter((x) => x.done).length;

  // Weights
  const weights = data.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
  const currentWeight = weights.length ? weights[weights.length - 1].weight : profile.startWeight;

  // Workout for today + last 7 days history
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

// =====================  API ROUTES  =====================

// Get everything (used to draw the whole dashboard)
app.get("/api/state", (req, res) => {
  res.json(buildState(readData()));
});

// Create or update the goal
app.post("/api/goal", (req, res) => {
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

  const data = readData();
  if (!data.profile) {
    // First time: start the 180 days today
    data.profile = { name, goalType, startWeight, targetWeight, calorieGoal, proteinGoal, startDate: todayString() };
    data.weights = [{ date: todayString(), weight: startWeight }];
  } else {
    // Editing: keep the start date and history
    Object.assign(data.profile, { name, goalType, startWeight, targetWeight, calorieGoal, proteinGoal });
    const first = data.weights.find((w) => w.date === data.profile.startDate);
    if (first) first.weight = startWeight;
  }
  writeData(data);
  res.json(buildState(data));
});

// Tick / untick an exercise for today
app.post("/api/workout/toggle", (req, res) => {
  const data = readData();
  if (!data.profile) return res.status(400).json({ error: "Set your goal first." });

  const today = todayString();
  const plan = WEEK_PLAN[new Date().getDay()];
  const exercise = req.body.exercise;
  if (!plan.exercises.some((e) => e.name === exercise)) {
    return res.status(400).json({ error: "That exercise is not in today's plan." });
  }

  const list = data.workouts[today] || [];
  data.workouts[today] = list.includes(exercise) ? list.filter((n) => n !== exercise) : [...list, exercise];
  writeData(data);
  res.json(buildState(data));
});

// Add a meal for today
app.post("/api/meals", (req, res) => {
  const data = readData();
  if (!data.profile) return res.status(400).json({ error: "Set your goal first." });

  const type = req.body.type;
  const name = String(req.body.name || "").trim();
  const calories = Number(req.body.calories);
  const protein = Number(req.body.protein);

  if (!["Breakfast", "Lunch", "Dinner"].includes(type)) return res.status(400).json({ error: "Choose Breakfast, Lunch or Dinner." });
  if (!name) return res.status(400).json({ error: "Enter the food name." });
  if (!Number.isFinite(calories) || calories < 0) return res.status(400).json({ error: "Enter valid calories." });
  if (!Number.isFinite(protein) || protein < 0) return res.status(400).json({ error: "Enter valid protein." });

  const today = todayString();
  if (!data.meals[today]) data.meals[today] = [];
  data.meals[today].push({ id: Date.now(), type, name, calories, protein });
  writeData(data);
  res.json(buildState(data));
});

// Delete a meal
app.delete("/api/meals/:id", (req, res) => {
  const data = readData();
  const today = todayString();
  const id = Number(req.params.id);
  data.meals[today] = (data.meals[today] || []).filter((m) => m.id !== id);
  writeData(data);
  res.json(buildState(data));
});

// Save today's weight
app.post("/api/weight", (req, res) => {
  const data = readData();
  if (!data.profile) return res.status(400).json({ error: "Set your goal first." });

  const weight = Number(req.body.weight);
  if (!(weight > 0)) return res.status(400).json({ error: "Enter a valid weight." });

  const today = todayString();
  const existing = data.weights.find((w) => w.date === today);
  if (existing) existing.weight = weight;
  else data.weights.push({ date: today, weight });
  writeData(data);
  res.json(buildState(data));
});

// Reset all demo data
app.post("/api/reset", (req, res) => {
  writeData(emptyData());
  res.json({ ok: true });
});

// Start the server
app.listen(PORT, () => {
  console.log(`FitTrack 180 is running at http://localhost:${PORT}`);
});