const $ = (selector) => document.querySelector(selector);
const screens = [$("#setupScreen"), $("#practiceScreen"), $("#emptyScreen")];

const state = {
  category: "numbers",
  questions: [],
  index: 0,
  source: "built-in",
  reviewMode: false,
  speed: Number(localStorage.getItem("numo-speed")) || 0.85,
  saved: JSON.parse(localStorage.getItem("numo-saved") || "[]"),
  startX: 0,
  deltaX: 0,
  playCount: 0,
  playSerial: 0,
};

const small = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ordinals = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth", "twenty-first", "twenty-second", "twenty-third", "twenty-fourth", "twenty-fifth", "twenty-sixth", "twenty-seventh", "twenty-eighth", "twenty-ninth", "thirtieth", "thirty-first"];

function wordsUnder1000(n) {
  const parts = [];
  if (n >= 100) { parts.push(`${small[Math.floor(n / 100)]} hundred`); n %= 100; }
  if (n >= 20) { parts.push(tens[Math.floor(n / 10)] + (n % 10 ? `-${small[n % 10]}` : "")); }
  else if (n > 0 || parts.length === 0) parts.push(small[n]);
  return parts.join(" ");
}

function numberToWords(value) {
  if (value === 0) return "zero";
  const groups = [[1_000_000_000_000, "trillion"], [1_000_000_000, "billion"], [1_000_000, "million"], [1_000, "thousand"]];
  let n = value;
  const parts = [];
  for (const [size, label] of groups) {
    if (n >= size) { const amount = Math.floor(n / size); parts.push(`${wordsUnder1000(amount)} ${label}`); n %= size; }
  }
  if (n) parts.push(wordsUnder1000(n));
  return parts.join(" ");
}

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function builtInNumbers(count) {
  const questions = [];
  const seen = new Set();
  while (questions.length < count) {
    const roll = Math.random();
    let value;
    if (roll < .7) value = randomInt(100, 100_000_000);
    else if (roll < .83) value = randomInt(0, 99);
    else if (roll < .95) value = randomInt(100_000_001, 1_000_000_000);
    else value = randomInt(2, 1000) * 1_000_000_000;
    if (seen.has(value)) continue;
    seen.add(value);
    questions.push({ kind: "number", spoken: numberToWords(value), answer: value.toLocaleString("en-US"), note: "" });
  }
  return questions;
}

function sayYear(year) {
  if (year >= 2000 && year <= 2009) return `two thousand${year % 2000 ? ` ${numberToWords(year % 2000)}` : ""}`;
  if (year >= 2010 && year <= 2099) return `twenty ${year % 100 < 10 ? `oh ${small[year % 10]}` : numberToWords(year % 100)}`;
  const first = Math.floor(year / 100), last = year % 100;
  return `${numberToWords(first)} ${last === 0 ? "hundred" : last < 10 ? `oh ${small[last]}` : numberToWords(last)}`;
}

function builtInDates(count) {
  return Array.from({ length: count }, (_, i) => {
    if (i % 2 === 0) {
      const month = randomInt(0, 11);
      const maxDay = [3, 5, 8, 10].includes(month) ? 30 : month === 1 ? 28 : 31;
      const day = randomInt(1, maxDay);
      return { kind: "date", spoken: `${months[month]} ${ordinals[day]}`, answer: `${months[month]} ${day}`, note: "" };
    }
    const year = randomInt(1900, 2099);
    return { kind: "year", spoken: sayYear(year), answer: String(year), note: year < 2010 && year % 100 < 10 ? "oh の音に注目" : "" };
  }).sort(() => Math.random() - .5);
}

function addIds(questions) {
  return questions.map((q) => ({ ...q, id: `${q.kind}:${q.answer}:${q.spoken}` }));
}

async function loadQuestions() {
  const fallback = () => state.category === "numbers" ? builtInNumbers(12) : builtInDates(12);
  try {
    const response = await fetch("/api/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: state.category, count: 12 }) });
    if (!response.ok) throw new Error("fallback");
    const data = await response.json();
    state.questions = addIds(data.questions);
    state.source = "openai";
  } catch {
    state.questions = addIds(fallback());
    state.source = "built-in";
  }
}

function showScreen(screen) {
  screens.forEach((item) => item.classList.toggle("active", item === screen));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function current() { return state.questions[state.index]; }
function isSaved(question = current()) { return state.saved.some((item) => item.id === question?.id); }

function persistSaved() {
  localStorage.setItem("numo-saved", JSON.stringify(state.saved));
  $("#savedCount").textContent = state.saved.length;
}

function updateCard(autoplay = true) {
  const q = current();
  if (!q) return;
  if (window.speechSynthesis) speechSynthesis.cancel();
  state.playSerial += 1;
  state.playCount = 0;
  $("#playCount").textContent = "まだ再生していません";
  $("#replayLabel").textContent = "タップで何度でも再生";
  $("#answerPanel").classList.remove("visible");
  $("#answerText").textContent = q.answer;
  $("#spokenText").textContent = q.spoken;
  $("#answerNote").textContent = q.note || "";
  $("#kindChip").textContent = q.kind === "number" ? "NUMBER" : q.kind === "date" ? "DATE" : "YEAR";
  $("#sourceChip").textContent = state.source === "openai" ? "AI" : "LOCAL";
  $("#currentNumber").textContent = String(state.index + 1).padStart(2, "0");
  $("#totalNumber").textContent = String(state.questions.length).padStart(2, "0");
  $("#progressFill").style.width = `${((state.index + 1) / state.questions.length) * 100}%`;
  $("#reviewToggle").setAttribute("aria-pressed", String(isSaved(q)));
  $("#listenCard").className = "listen-card";
  if (autoplay) setTimeout(speak, 320);
}

function preferredVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang === "en-US" && /Samantha|Google|Microsoft|Premium/i.test(v.name))
    || voices.find((v) => v.lang === "en-US")
    || voices.find((v) => v.lang.startsWith("en"));
}

function speak() {
  const q = current();
  if (!q || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
    return toast("このブラウザは音声再生に対応していません");
  }
  const serial = ++state.playSerial;
  state.playCount += 1;
  $("#replayLabel").textContent = "もう一度聞く";
  $("#playCount").textContent = `${state.playCount}回再生・何回でも聞けます`;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(q.spoken);
  utterance.lang = "en-US";
  utterance.rate = state.speed;
  utterance.pitch = 1;
  const voice = preferredVoice();
  if (voice) utterance.voice = voice;
  utterance.onstart = () => {
    if (serial !== state.playSerial) return;
    $("#soundButton").classList.add("speaking");
  };
  utterance.onend = utterance.onerror = () => {
    if (serial === state.playSerial) $("#soundButton").classList.remove("speaking");
  };
  // 再生中の連打でも確実に先頭から聞き直せるよう、cancel後に短く間を置く。
  setTimeout(() => {
    if (serial === state.playSerial) speechSynthesis.speak(utterance);
  }, 60);
}

function move(direction) {
  if (state.questions.length < 2) return;
  const next = state.index + direction;
  if (next < 0) return toast("最初の問題です");
  if (next >= state.questions.length) {
    state.index = 0;
    toast("1周しました。もう一度！");
    updateCard();
    return;
  }
  const card = $("#listenCard");
  card.classList.add(direction > 0 ? "slide-left" : "slide-right");
  setTimeout(() => { state.index = next; updateCard(); }, 210);
}

let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

async function startSession() {
  const button = $("#startButton");
  button.classList.add("loading");
  button.disabled = true;
  button.querySelector("span").textContent = "問題をつくっています";
  state.reviewMode = false;
  await loadQuestions();
  state.index = 0;
  $("#sessionLabel").textContent = state.category === "numbers" ? "NUMBERS" : "DATES & YEARS";
  button.classList.remove("loading");
  button.disabled = false;
  button.querySelector("span").textContent = "はじめる";
  showScreen($("#practiceScreen"));
  updateCard();
}

document.querySelectorAll(".category-card").forEach((button) => button.addEventListener("click", () => {
  state.category = button.dataset.category;
  document.querySelectorAll(".category-card").forEach((item) => {
    const selected = item === button;
    item.classList.toggle("selected", selected);
    item.setAttribute("aria-checked", String(selected));
  });
  const numbers = state.category === "numbers";
  $("#distributionNote").innerHTML = numbers
    ? '<span class="bar"><i></i></span><p><strong>よく使う範囲を多めに</strong><br>100〜1億の問題が約70%</p>'
    : '<span class="bar"><i></i></span><p><strong>月日と年をバランスよく</strong><br>聞き分けにくい西暦も練習</p>';
}));

$("#startButton").addEventListener("click", startSession);
$("#soundButton").addEventListener("click", speak);
$("#revealButton").addEventListener("click", () => $("#answerPanel").classList.add("visible"));
$("#reviewToggle").addEventListener("click", () => {
  const q = current();
  if (!q) return;
  if (isSaved(q)) {
    state.saved = state.saved.filter((item) => item.id !== q.id);
    toast("復習リストから外しました");
  } else {
    state.saved.push(q);
    toast("復習リストに残しました");
  }
  persistSaved();
  $("#reviewToggle").setAttribute("aria-pressed", String(isSaved(q)));
});

$("#speedRange").value = String(state.speed);
$("#speedOutput").value = `${state.speed.toFixed(2)}×`;
$("#speedRange").addEventListener("input", (event) => {
  state.speed = Number(event.target.value);
  localStorage.setItem("numo-speed", String(state.speed));
  $("#speedOutput").value = `${state.speed.toFixed(2)}×`;
  const pct = ((state.speed - .6) / .6) * 100;
  event.target.style.background = `linear-gradient(90deg, var(--green) 0 ${pct}%, rgba(29,77,62,.15) ${pct}%)`;
});
$("#speedRange").dispatchEvent(new Event("input"));

function goHome() { if (window.speechSynthesis) speechSynthesis.cancel(); showScreen($("#setupScreen")); }
$("#homeButton").addEventListener("click", goHome);
$("#closeButton").addEventListener("click", goHome);
$("#emptyBackButton").addEventListener("click", goHome);
$("#savedButton").addEventListener("click", () => {
  if (!state.saved.length) return showScreen($("#emptyScreen"));
  state.questions = [...state.saved];
  state.index = 0;
  state.source = "saved";
  state.reviewMode = true;
  $("#sessionLabel").textContent = "REVIEW LIST";
  showScreen($("#practiceScreen"));
  updateCard();
});

const stage = $("#cardStage");
stage.addEventListener("pointerdown", (event) => { state.startX = event.clientX; state.deltaX = 0; stage.setPointerCapture(event.pointerId); });
stage.addEventListener("pointermove", (event) => {
  if (!stage.hasPointerCapture(event.pointerId)) return;
  state.deltaX = event.clientX - state.startX;
  $("#listenCard").style.transform = `translateX(${state.deltaX * .42}px) rotate(${state.deltaX * .012}deg)`;
});
stage.addEventListener("pointerup", (event) => {
  $("#listenCard").style.transform = "";
  if (Math.abs(state.deltaX) > 60) move(state.deltaX < 0 ? 1 : -1);
  state.deltaX = 0;
  try { stage.releasePointerCapture(event.pointerId); } catch {}
});

document.addEventListener("keydown", (event) => {
  if (!$("#practiceScreen").classList.contains("active")) return;
  if (event.key === "ArrowRight") move(1);
  if (event.key === "ArrowLeft") move(-1);
  if (event.code === "Space") { event.preventDefault(); speak(); }
  if (event.key === "Enter") $("#answerPanel").classList.add("visible");
});

persistSaved();
fetch("/api/status").then((res) => res.json()).then((data) => {
  $("#apiStatus").textContent = data.apiReady ? `ChatGPT APIで出題（${data.model}）` : "内蔵問題でお試しできます";
  $("#apiDot").classList.toggle("online", data.apiReady);
}).catch(() => { $("#apiStatus").textContent = "内蔵問題でお試しできます"; });
