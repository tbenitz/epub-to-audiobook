// script.js – MAXIMUM DEBUG VERSION (works with Project Hail Mary)
let book = null;
let sentences = [];
let currentIndex = 0;
let paused = false;

console.log("script.js loaded");

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
  console.log("Status →", msg);
}

// ——— TTS ———
function speakNext() {
  if (currentIndex >= sentences.length) {
    setStatus("Chapter finished");
    document.getElementById("playPause").textContent = "Play";
    return;
  }
  while (currentIndex < sentences.length && !sentences[currentIndex].trim()) currentIndex++;

  const utter = new SpeechSynthesisUtterance(sentences[currentIndex].trim());
  utter.rate = parseFloat(document.getElementById("rate").value) || 1;

  utter.onend = () => {
    currentIndex++;
    document.getElementById("progress").value = (currentIndex / sentences.length) * 100;
    if (!paused) speakNext();
  };
  utter.onstart = () => document.getElementById("playPause").textContent = "Pause";

  console.log("Speaking sentence", currentIndex + 1, "/", sentences.length);
  speechSynthesis.speak(utter);
}

// ——— CHAPTER LOADING (THE ONLY METHOD THAT WORKS IN 2025) ———
async function loadChapter(href) {
  console.log("→ loadChapter called with href:", href);
  setStatus("Loading chapter…");

  try {
    const section = book.section(href);
    console.log("section created:", section);

    // This is the correct for epub.js 0.3
    const rendition = book.renderTo(document.createElement("div"), { width: 0, height: 0 });
    await rendition.display(href);                     // forces loading of the spine item
    console.log("rendition.display() finished");

    const iframe = rendition.getContents()[0];
    if (!iframe || !iframe.contentDocument) {
      throw new Error("No iframe/contentDocument");
    }

    const doc = iframe.contentDocument;
    console.log("Got iframe document");

    // Remove garbage
    doc.querySelectorAll("script,style,noscript,nav,header,footer").forEach(e => e.remove());

    const text = doc.body.innerText || doc.documentElement.innerText || "";
    console.log("Extracted text length:", text.length, "characters");

    if (!text.trim()) {
      setStatus("Chapter empty (maybe only images)");
      return;
    }

    // Start reading
    sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
    currentIndex = 0;
    document.getElementById("progress").value = 0;
    setStatus(`Reading… (${sentences.length} sentences)`);
    speakNext();

  } catch (err) {
    console.error("loadChapter FAILED:", err);
    setStatus("Failed to load chapter – check console (F12)");
  }
}

// ——— OPEN BOOK ———
async function openBook(file) {
  console.clear();
  console.log("Opening file:", file.name, file.size, "bytes");
  setStatus("Opening EPUB…");

  try {
    const buffer = await file.arrayBuffer();
    book = ePub(buffer);
    console.log("ePub instance created");

    await book.ready;
    console.log("book.ready resolved");

    document.getElementById("title].textContent = book.package.metadata.title || file.name;

    const select = document.getElementById("chapterSelect");
    select.innerHTML = "<option value=''>– Select chapter –</option>";

    book.spine.each((item, i) => {
      const opt = document.createElement("option");
      opt.value = item.href;
      opt.textContent = item.label?.trim() || `Chapter ${i + 1}`;
      select.appendChild(opt);
    });

    document.getElementById("bookControls").classList.remove("hidden");
    setStatus(`Loaded ${select.options.length - 1} chapters – choose one`);
    console.log("Book fully loaded");
  } catch (e) {
    console.error("openBook failed:", e);
    setStatus("Cannot open EPUB");
  }
}

// ——— EVENTS ———
document.getElementById("epubInput").addEventListener("change", e => {
  if (e.target.files0]) openBook(e.target.files0]);
});

document.getElementById("dropZone").addEventListener("click", () => 
  document.getElementById("epubInput").click()
);

document.getElementById("dropZone").addEventListener("dragover", e => e.preventDefault());
document.getElementById("dropZone").addEventListener("drop", e => {
  e.preventDefault();
  const f = [...e.dataTransfer.files].find(f => f.name.toLowerCase().endsWith(".epub"));
  if (f) openBook(f);
});

document.getElementById("chapterSelect").addEventListener("change", e => {
  if (e.target.value) loadChapter(e.target.value);
});

document.getElementById("playPause").addEventListener("click", () => {
  if (speechSynthesis.paused) {
    speechSynthesis.resume(); paused = false; speakNext();
  } else if (speechSynthesis.speaking) {
    speechSynthesis.pause(); paused = true;
  } else if (sentences.length > currentIndex) {
    paused = false; speakNext();
  }
  document.getElementById("playPause").textContent = speechSynthesis.paused ? "Play" : "Pause";
});

document.getElementById("stop").addEventListener("click", () => {
  speechSynthesis.cancel();
  sentences = []; currentIndex = 0;
  document.getElementById("playPause").textContent = "Play";
  setStatus("Stopped");
});

document.getElementById("rate").addEventListener("input", e => {
  document.getElementById("rateValue").textContent = e.target.value + "×";
});
