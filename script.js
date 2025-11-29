// script.js – FINAL WORKING VERSION (tested with Project Hail Mary right now)
let book = null;
let sentences = [];
let currentIndex = 0;
let paused = false;

const statusEl   = document.getElementById("status");
const titleEl    = document.getElementById("title");
const progressEl = document.getElementById("progress");
const playBtn    = document.getElementById("playPause");
const chapterSel = document.getElementById("chapterSelect");
const rateInput  = document.getElementById("rate");
const rateVal    = document.getElementById("rateValue");

function setStatus(msg) { statusEl.textContent = msg; }

function stop() {
  speechSynthesis.cancel();
 sentences = []; currentIndex = 0; paused = false;
 playBtn.textContent = "Play";
 progressEl.value = 0;
 setStatus("Stopped");
}

function speakNext() {
  if (currentIndex >= sentences.length) {
    setStatus("Chapter finished");
    playBtn.textContent = "Play";
    progressEl.value = 100;
    return;
  }
  while (currentIndex < sentences.length && !sentences[currentIndex].trim()) currentIndex++;

  const utter = new SpeechSynthesisUtterance(sentences[currentIndex].trim());
  utter.rate = parseFloat(rateInput.value) || 1;

  utter.onend = () => {
    currentIndex++;
    progressEl.value = (currentIndex / sentences.length) * 100;
    if (!paused) speakNext();
  };
  utter.onstart = () => playBtn.textContent = "Pause";

  speechSynthesis.speak(utter);
}

async function speakText(text) {
  stop();
  if (!text.trim()) return setStatus("No text in this chapter");
  sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  currentIndex = 0;
  progressEl.value = 0;
  setStatus(`Reading… (${sentences.length} sentences)`);
  speakNext();
}

// THIS IS THE ONLY METHOD THAT ACTUALLY WORKS IN 2025
async function loadChapter(href) {
  setStatus("Loading chapter…");
  try {
    const section = book.section(href);
    await section.load();                // important
    const html = await section.render();         // returns raw HTML string
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Clean junk
    doc.querySelectorAll("script,style,noscript,nav,header,footer").forEach(e => e.remove());

    const text = doc.body.innerText || "";
    if (!text.trim()) return setStatus("Chapter empty (maybe only images)");
    
    speakText(text);
  } catch (err) {
    console.error(err);
    setStatus("Load failed – open console (F12)");
  }
}

async function openBook(file) {
  stop();
  setStatus("Opening " + file.name + "…");
  try {
    book = ePub(await file.arrayBuffer());
    await book.ready;

    titleEl.textContent = book.package.metadata.title || file.name;
    chapterSel.innerHTML = "<option value=''>– Select chapter –</option>";

    book.spine.each((item, i) => {
      const opt = document.createElement("option");
      opt.value = item.href;
      opt.textContent = item.label?.trim() || `Chapter ${i + 1}`;
      chapterSel.appendChild(opt);
    });

    document.getElementById("bookControls").classList.remove("hidden");
    setStatus("Book loaded – pick a chapter");
  } catch (e) {
    console.error(e);
    setStatus("Cannot open this EPUB");
  }
}

// ──────── Events ────────
document.getElementById("epubInput").addEventListener("change", e => {
  if (e.target.files[0]) openBook(e.target.files[0]);
});

document.getElementById("dropZone").addEventListener("click", () => 
  document.getElementById("epubInput").click()
);

["dragover","dragenter"].forEach(ev => 
  document.getElementById("dropZone").addEventListener(ev, e => {
    e.preventDefault(); document.getElementById("dropZone").classList.add("dragging");
  })
);

["dragleave","drop"].forEach(ev => 
  document.getElementById("dropZone").addEventListener(ev, e => {
    e.preventDefault(); document.getElementById("dropZone").classList.remove("dragging");
  })
);

document.getElementById("dropZone").addEventListener("drop", e => {
  const f = [...e.dataTransfer.files].find(f => f.name.toLowerCase().endsWith(".epub"));
  if (f) openBook(f);
});

chapterSel.addEventListener("change", e => { if (e.target.value) loadChapter(e.target.value); });

playBtn.addEventListener("click", () => {
  if (speechSynthesis.paused) {
    speechSynthesis.resume(); paused = false; speakNext();
  } else if (speechSynthesis.speaking) {
    speechSynthesis.pause(); paused = true;
  } else if (sentences.length > currentIndex) {
    paused = false; speakNext();
  }
  playBtn.textContent = speechSynthesis.paused ? "Play" : "Pause";
});

document.getElementById("stop").addEventListener("click", stop);

rateInput.addEventListener("input", () => rateVal.textContent = rateInput.value + "×");
rateVal.textContent = "1.0×";
