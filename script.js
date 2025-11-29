let book = null;
let sentences = [];
let currentIndex = 0;
let paused = false;

const statusEl = document.getElementById("status");
const titleEl = document.getElementById("title");
const progressEl = document.getElementById("progress");
const playBtn = document.getElementById("playPause");
const chapterSelect = document.getElementById("chapterSelect");
const rateInput = document.getElementById("rate");
const rateValue = document.getElementById("rateValue");

function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

function stop() {
  speechSynthesis.cancel();
  sentences = [];
  currentIndex = 0;
  paused = false;
  playBtn.textContent = "Play";
  progressEl.value = 0;
  setStatus("Stopped");
}

function updatePlayButton() {
  if (!playBtn) return;
  playBtn.textContent = (speechSynthesis.speaking && !speechSynthesis.paused) || (!speechSynthesis.paused && currentIndex < sentences.length)
    ? "Pause" : "Play";
}

function speakNext() {
  if (currentIndex >= sentences.length) {
    setStatus("Chapter finished");
    progressEl.value = 100;
    updatePlayButton();
    return;
  }

  while (currentIndex < sentences.length && !sentences[currentIndex].trim()) currentIndex++;

  const utterance = new SpeechSynthesisUtterance(sentences[currentIndex].trim());
  utterance.rate = parseFloat(rateInput.value) || 1;

  utterance.onend = () => {
    currentIndex++;
    progressEl.value = (currentIndex / sentences.length) * 100;
    if (!paused) speakNext();
  };

  utterance.onstart = updatePlayButton;
  utterance.onerror = (e) => console.error(e);

  speechSynthesis.speak(utterance);
  updatePlayButton();
}

async function speakText(text) {
  stop();
  if (!text.trim()) return setStatus("No text in this chapter");

  sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  currentIndex = 0;
  progressEl.value = 0;
  setStatus("Reading…");
  speakNext();
}

async function loadChapter(href) {
  setStatus("Loading chapter…");
  try {
    const section = book.section(href);
    await section.load();
    const clone = section.document.body.cloneNode(true);
    clone.querySelectorAll("script,style,noscript").forEach(el => el.remove());
    const text = clone.innerText || "";
    speakText(text);
  } catch (err) {
    console.error(err);
    setStatus("Failed to load chapter");
  }
}

async function openBook(file) {
  stop();
  setStatus("Opening EPUB…");
  try {
    book = ePub(await file.arrayBuffer());
    await book.ready;

    titleEl.textContent = book.package.metadata.title || file.name;
    chapterSelect.innerHTML = "<option value=''>– Choose chapter –</option>";
    book.spine.each(item => {
      const opt = document.createElement("option");
      opt.value = item.href;
      opt.textContent = item.label?.trim() || item.href.split("/").pop();
      chapterSelect.appendChild(opt);
    });

    document.getElementById("bookControls").classList.remove("hidden");
    setStatus("Book loaded – select a chapter");
  } catch (err) {
    console.error(err);
    setStatus("Error opening EPUB – see console");
  }
}

// ==================== EVENT LISTENERS ====================

document.getElementById("epubInput").addEventListener("change", e => {
  if (e.target.files[0]) openBook(e.target.files[0]);
});

const dropZone = document.getElementById("dropZone");
dropZone.addEventListener("click", () => document.getElementById("epubInput").click());

dropZone.addEventListener("dragover", e => {
  e.preventDefault();
  dropZone.classList.add("dragging");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", e => {
  e.preventDefault();
  dropZone.classList.remove("dragging");
  const file = [...e.dataTransfer.files].find(f => f.name.toLowerCase().endsWith(".epub"));
  if (file) openBook(file);
  else setStatus("Please drop an .epub file");
});

chapterSelect.addEventListener("change", e => {
  if (e.target.value) loadChapter(e.target.value);
});

playBtn.addEventListener("click", () => {
  if (speechSynthesis.paused) {
    speechSynthesis.resume();
    paused = false;
    speakNext();
  } else if (speechSynthesis.speaking) {
    speechSynthesis.pause();
    paused = true;
  } else if (sentences.length > currentIndex) {
    paused = false;
    speakNext();
  }
  updatePlayButton();
});

document.getElementById("stop").addEventListener("click", stop);

rateInput.addEventListener("input", () => {
  rateValue.textContent = rateInput.value + "×";
});

// init
rateValue.textContent = "1.0×";
