let book = null;
let sentences = [];
let currentIndex = 0;
let paused = false;

const els = {
  status: document.getElementById("status"),
  title: document.getElementById("title"),
  progress: document.getElementById("progress"),
  playPause: document.getElementById("playPause"),
  chapterSelect: document.getElementById("chapterSelect"),
  rate: document.getElementById("rate"),
  rateValue: document.getElementById("rateValue"),
  dropZone: document.getElementById("dropZone"),
  fileInput: document.getElementById("epubInput")
};

function setStatus(msg) { els.status.textContent = msg; }

function stop() {
  speechSynthesis.cancel();
  sentences = []; currentIndex = 0; paused = false;
  els.playPause.textContent = "Play";
  els.progress.value = 0;
  setStatus("Stopped");
}

function speakNext() {
  if (currentIndex >= sentences.length) {
    setStatus("Chapter finished");
    els.playPause.textContent = "Play";
    els.progress.value = 100;
    return;
  }
  while (currentIndex < sentences.length && !sentences[currentIndex].trim()) currentIndex++;

  const u = new SpeechSynthesisUtterance(sentences[currentIndex].trim());
  u.rate = parseFloat(els.rate.value) || 1;

  u.onend = () => {
    currentIndex++;
    els.progress.value = (currentIndex / sentences.length) * 100;
    if (!paused) speakNext();
  };
  u.onstart = () => els.playPause.textContent = "Pause";

  speechSynthesis.speak(u);
}

async function speakText(text) {
  stop();
  if (!text.trim()) return setStatus("No text found in chapter");
  sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  currentIndex = 0;
  els.progress.value = 0;
  setStatus("Reading…");
  speakNext();
}

// THE FIX — use book.load() instead of section.load()
async function loadChapter(href) {
  setStatus("Loading chapter…");
  try {
    const content = await book.load(href);           // ← this line fixes everything
    let text = "";

    if (content.body) {
      const clone = content.body.cloneNode(true);
      clone.querySelectorAll("script,style,noscript,nav,header,footer").forEach(e => e.remove());
      text = clone.innerText;
    } else if (content.documentElement) {
      text = content.documentElement.innerText || content.innerText || "";
    } else {
      text = content.toString();
    }

    if (!text.trim()) return setStatus("Chapter is empty (maybe images only)");
    speakText(text);
  } catch (e) {
    console.error(e);
    setStatus("Failed to load chapter – see console");
  }
}

async function openBook(file) {
  {
  stop();
  setStatus("Opening " + file.name + "…");
  try {
    book = ePub(await file.arrayBuffer());
    await book.ready;

    els.title.textContent = book.package.metadata.title || file.name;
    els.chapterSelect.innerHTML = "<option value=''>– Select chapter –</option>";

    book.spine.each((item, i) => {
      const opt = document.createElement("option");
      opt.value = item.href;
      opt.textContent = item.label?.trim() || `Chapter ${i + 1}`;
      els.chapterSelect.appendChild(opt);
    });

    document.getElementById("bookControls").classList.remove("hidden");
    setStatus("Book loaded – choose a chapter");
  } catch (e) {
    console.error(e);
    setStatus("Cannot open EPUB");
  }
}

// Events
els.fileInput.addEventListener("change", e => e.target.files[0] && openBook(e.target.files[0]));
els.dropZone.addEventListener("click", () => els.fileInput.click());
els.dropZone.addEventListener("dragover", e => { e.preventDefault(); els.dropZone.classList.add("dragging"); });
els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("dragging"));
els.dropZone.addEventListener("drop", e => {
  e.preventDefault();
  els.dropZone.classList.remove("dragging");
  const f = [...e.dataTransfer.files].find(f => f.name.toLowerCase().endsWith(".epub"));
  f && openBook(f);
});

els.chapterSelect.addEventListener("change", e => e.target.value && loadChapter(e.target.value));

els.playPause.addEventListener("click", () => {
  if (speechSynthesis.paused) { speechSynthesis.resume(); paused = false; speakNext(); }
  else if (speechSynthesis.speaking) { speechSynthesis.pause(); paused = true; }
  else if (sentences.length > currentIndex) { paused = false; speakNext(); }
  els.playPause.textContent = speechSynthesis.paused ? "Play" : "Pause";
});

document.getElementById("stop").addEventListener("click", stop);

els.rate.addEventListener("input", () => els.rateValue.textContent = els.rate.value + "×");
els.rateValue.textContent = "1.0×";
