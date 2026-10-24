// Grab all the page elements first
const hintsDiv = document.getElementById("hints");
const attemptsP = document.getElementById("attempts");
const guessInput = document.getElementById("guess-input");
const guessButton = document.getElementById("guess-button");
const messageP = document.getElementById("message");
const statsDiv = document.getElementById("stats");
const shareButton = document.getElementById("share-button");

// Game state (filled in after the puzzle loads)
let movie;
let currentHint = 0;
let attemptsLeft = 0;
let status = "playing"; // "playing", "won" or "lost"
let results = []; // one emoji per guess: 🟥 wrong, 🟩 correct

// The day your game "starts". Months start at 0, so 9 = October.
const LAUNCH_DATE = Date.UTC(2026, 9, 24);

// Your game's web address (added to the share text)
const SITE_URL = "https://manyasuresh7.github.io/kannada-guess/";

// Names we save our data under in the browser
const STORAGE_KEY = "kannadaGuessState";
const STATS_KEY = "kannadaGuessStats";

// How many whole days have passed since launch
function getDaysSinceLaunch() {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((today - LAUNCH_DATE) / msPerDay);
}

// Returns which puzzle to show today
function getPuzzleIndex(totalPuzzles) {
  const days = getDaysSinceLaunch();
  // This form also works if the number is negative
  return ((days % totalPuzzles) + totalPuzzles) % totalPuzzles;
}

// Puzzle number for sharing: launch day is #1
function getPuzzleNumber() {
  return getDaysSinceLaunch() + 1;
}

// Turns a date into text, like "2026-10-24"
function makeDateKey(date) {
  return date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
}

// Today's date as text
function getTodayKey() {
  return makeDateKey(new Date());
}

// Yesterday's date as text
function getYesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return makeDateKey(d);
}

// ---------- Comparing guesses ----------

// Lowercase, and keep only letters and numbers (works for Kannada script too)
function normalize(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

// True if the guess matches the answer or any alias
function isCorrect(guess) {
  const g = normalize(guess);
  if (g === "") return false;

  const accepted = [movie.answer].concat(movie.aliases || []);

  for (const name of accepted) {
    if (normalize(name) === g) return true;
  }
  return false;
}

// ---------- Saving today's game ----------

function saveState() {
  try {
    const state = {
      date: getTodayKey(),
      currentHint: currentHint,
      attemptsLeft: attemptsLeft,
      status: status,
      results: results
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Could not save:", error);
  }
}

function loadSavedState() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return null;

    const state = JSON.parse(text);
    if (state.date !== getTodayKey()) return null; // old save from another day
    return state;
  } catch (error) {
    return null;
  }
}

// ---------- Stats and streaks ----------

// Get saved stats, or a fresh set if there are none
function loadStats() {
  const fresh = {
    played: 0,
    won: 0,
    streak: 0,
    maxStreak: 0,
    lastPlayed: "",
    lastWon: ""
  };

  try {
    const text = localStorage.getItem(STATS_KEY);
    if (!text) return fresh;
    return Object.assign(fresh, JSON.parse(text));
  } catch (error) {
    return fresh;
  }
}

function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (error) {
    console.error("Could not save stats:", error);
  }
}

// Called once when a game ends (won is true or false)
function recordResult(won) {
  const stats = loadStats();

  // Safety: never count the same day twice
  if (stats.lastPlayed === getTodayKey()) return;

  stats.played++;
  stats.lastPlayed = getTodayKey();

  if (won) {
    stats.won++;

    if (stats.lastWon === getYesterdayKey()) {
      stats.streak++; // won yesterday too, so the streak continues
    } else {
      stats.streak = 1; // streak starts again
    }

    stats.lastWon = getTodayKey();

    if (stats.streak > stats.maxStreak) {
      stats.maxStreak = stats.streak;
    }
  } else {
    stats.streak = 0;
  }

  saveStats(stats);
}

// Show the stats on the page
function showStats() {
  const stats = loadStats();

  // If the last win was before yesterday, the streak is already broken
  let streak = stats.streak;
  if (stats.lastWon !== getTodayKey() && stats.lastWon !== getYesterdayKey()) {
    streak = 0;
  }

  statsDiv.innerHTML =
    "<strong>Your stats</strong><br>" +
    "Played: " + stats.played + " | Won: " + stats.won + "<br>" +
    "Current streak: " + streak + " | Best streak: " + stats.maxStreak;
}

// ---------- Sharing ----------

// Builds the text that gets copied, like:
// Kannada Guess #1 3/5
// 🟥🟥🟩⬜⬜
// https://your-site-link
function buildShareText() {
  const total = movie.hints.length;

  let grid = results.join("");
  for (let i = results.length; i < total; i++) {
    grid += "⬜";
  }

  const score = status === "won" ? results.length + "/" + total : "X/" + total;

  return "Kannada Guess #" + getPuzzleNumber() + " " + score + "\n" + grid + "\n" + SITE_URL;
}

async function handleShare() {
  const text = buildShareText();

  try {
    await navigator.clipboard.writeText(text);
    shareButton.textContent = "Copied! ✅";
    setTimeout(function () {
      shareButton.textContent = "Share result";
    }, 2000);
  } catch (error) {
    // Clipboard blocked: show the text so the player can copy it by hand
    window.prompt("Copy your result:", text);
  }
}

shareButton.addEventListener("click", handleShare);

// ---------- The game ----------

async function loadGame() {
  showStats();

  try {
    const response = await fetch("data/movies.json");
    const movies = await response.json();

    const index = getPuzzleIndex(movies.length);
    console.log("Today's puzzle index:", index);
    movie = movies[index];
    attemptsLeft = movie.hints.length;

    // Restore today's progress if there is any
    const saved = loadSavedState();
    if (saved && saved.currentHint < movie.hints.length) {
      currentHint = saved.currentHint;
      attemptsLeft = saved.attemptsLeft;
      status = saved.status;
      results = Array.isArray(saved.results) ? saved.results : [];
    }

    showHints();
    updateAttempts();

    // If the game already ended today, show the result and lock it
    if (status === "won") {
      messageP.textContent = "Correct! The movie is " + movie.answer + " 🎉";
      endGame();
    } else if (status === "lost") {
      messageP.textContent = "Game over! The movie was " + movie.answer + ".";
      endGame();
    }
  } catch (error) {
    messageP.textContent = "Could not load the puzzle.";
    console.error(error);
  }
}

function updateAttempts() {
  attemptsP.textContent = "Attempts left: " + attemptsLeft;
}

// Show all hints revealed so far
function showHints() {
  hintsDiv.innerHTML = "";

  for (let i = 0; i <= currentHint; i++) {
    const p = document.createElement("p");
    p.textContent = "Hint " + (i + 1) + ": " + movie.hints[i];
    hintsDiv.appendChild(p);
  }
}

// Locks the game after it ends and shows the share button
function endGame() {
  guessInput.disabled = true;
  guessButton.disabled = true;
  shareButton.hidden = false;
}

// Runs every time the Guess button is clicked
function handleGuess() {
  if (!movie) return; // puzzle not loaded yet
  if (status !== "playing") return; // game already over

  const guess = guessInput.value.trim();

  if (guess === "") {
    messageP.textContent = "Please type something first.";
    return;
  }

  if (isCorrect(guess)) {
    results.push("🟩");
    status = "won";
    messageP.textContent = "Correct! The movie is " + movie.answer + " 🎉";
    endGame();
    recordResult(true);
    showStats();
  } else {
    results.push("🟥");
    attemptsLeft--;
    updateAttempts();
    guessInput.value = "";

    if (attemptsLeft === 0) {
      status = "lost";
      messageP.textContent = "Game over! The movie was " + movie.answer + ".";
      endGame();
      recordResult(false);
      showStats();
    } else {
      currentHint++;
      showHints();
      messageP.textContent = "Wrong! Here's another hint.";
    }
  }

  saveState(); // save after every valid guess
}

guessButton.addEventListener("click", handleGuess);

guessInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    handleGuess();
  }
});

loadGame();
