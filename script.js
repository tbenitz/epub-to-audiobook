let book = null;
let currentAudio = null;
let currentUtterance = null;

// ---------- Helpers ----------

function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
}

function stop() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  speechSynthesis.cancel();
  const pp = document.getElementById("playPause");
  if (pp) pp.textContent = "Play";
  setStatus("Stopped");
}

// ---------- Text-to-Speech ----------

async function speakText(text, rate = 1) {
  stop();

  if (!text || !text.trim()) {
    setStatus("No text to read.");
    return;
  }

  setStatus("Speaking...");

  const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];
  let i = 0;
  const progressEl = document.getElementById("progress");
  const playPauseBtn = document.getElementById("playPause");

  function speakNext() {
    if (i >= sentences.length) {
      setStatus("Finished");
      if (playPauseBtn) playPauseBtn.textContent = "Play";
      if (progressEl) progressEl.value = 100;
      return;
    }

    const utterance = new SpeechSynthesisUtterance(sentences[i].trim());
    utterance.rate = rate;

    utterance.onend = () => {
      i++;
      if (progressEl) {
        progressEl.value = (i / sentences.length) * 100;
      }
      speakNext();
    };

    utterance.onerror = (e) => {
      console.error("TTS error:", e);
      setStatus("Speech error – see console.");
    };

    speechSynthesis.speak(utterance);
    currentUtterance = utterance;
    if (playPauseBtn) playPauseBtn.textContent = "Pause";
  }

  speakNext();
}

// ---------- EPUB loading ----------

async function handleEpubFile(file) {
  if (!file) return;

  if (!window.ePub) {
    setStatus("EPUB.js failed to load – check script tags.");
    return;
  }

  try {
    setStatus("Opening EPUB...");

    const arrayBuffer = await file.arrayBuffer();
    book = ePub(arrayBuffer);

    await book.ready;

    // Title
    const titleEl = document.getElementById("title");
    const metaTitle = book.package?.metadata?.title || "Unknown Title";
    if (titleEl) titleEl.textContent = metaTitle;

    // Chapters
    const select = document.getElementById("chapterSelect");
    if (select) {
      select.innerHTML = "";
      book.spine.each((item) => {
        const opt = document.createElement("option");
        opt.value = item.href;
        opt.textContent = (item.label && item.label.trim()) || item.href;
        select.appendChild(opt);
      });
    }

    const controls = document.getElementById("bookControls");
    if (controls) controls.classList.remove("hidden");

    setStatus("Loaded! Choose a chapter.");

    // Auto-play first chapter if available
    if (select && select.options.length > 0) {
      select.value = select.options[0].value;
      loadChapter(select.options[0].value);
    }
  } catch (err) {
    console.error("Error loading EPUB:", err);
    setStatus("Failed to load EPUB – check console.");
  }
}

async function loadChapter(href) {
  if (!book || !href) return;

  setStatus("Loading chapter...");

  try {
    const section = book.section(href);
    if (!section) {
      setStatus("Could not find that chapter.");
      return;
    }

    await section.load();

    const doc = section.document;
    const text = (doc && doc.body && doc.body.innerText) ? doc.body.innerText : "";

    const rateInput = document.getElementById("rate");
    const rate = rateInput ? parseFloat(rateInput.value) || 1 : 1;

    speakText(text, rate);
  } catch (err) {
    console.error("Error loading chapter:", err);
    setStatus("Failed to load chapter – see console.");
  }
}

// ---------- DOM wiring ----------

const fileInput = document.getElementById("epubInput");
if (fileInput) {
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    handleEpubFile(file);
  });
}

// Drag & drop (no createReader anywhere!)
const dropZone = document.getElementById("dropZone");
if (dropZone) {
  dropZone.addEventListener("click", () => {
    if (fileInput) fileInput.click();
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragging");
  });

  dropZone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragging");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragging");

    const file = [...e.dataTransfer.files].find(f =>
      f.name.toLowerCase().endsWith(".epub")
    );
    if (file) {
      handleEpubFile(file);
    } else {
      setStatus("Please drop an .epub file.");
    }
  });
}

// Chapter select
const chapterSelect = document.getElementById("chapterSelect");
if (chapterSelect) {
  chapterSelect.addEventListener("change", (e) => {
    loadChapter(e.target.value);
  });
}

// Play / pause
const playPauseBtn = document.getElementById("playPause");
if (playPauseBtn) {
  playPauseBtn.addEventListener("click", () => {
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
      playPauseBtn.textContent = "Pause";
    } else if (speechSynthesis.speaking) {
      speechSynthesis.pause();
      playPauseBtn.textContent = "Play";
    }
  });
}

// Stop
const stopBtn = document.getElementById("stop");
if (stopBtn) {
  stopBtn.addEventListener("click", stop);
}

// Rate slider
const rateInput = document.getElementById("rate");
const rateValue = document.getElementById("rateValue");
if (rateInput) {
  rateInput.addEventListener("input", (e) => {
    const r = parseFloat(e.target.value) || 1;
    if (rateValue) rateValue.textContent = r.toFixed(1) + "×";
  });
}
