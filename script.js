let book = null;
let currentAudio = null;
let currentUtterance = null;

function stop() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  speechSynthesis.cancel();
  document.getElementById("playPause").textContent = "Play";
  document.getElementById("status").textContent = "Stopped";
}

async function speakText(text, rate = 1) {
  stop();
  document.getElementById("status").textContent = "Speaking...";

  const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];
  let i = 0;

  function speakNext() {
    if (i >= sentences.length) {
      document.getElementById("status").textContent = "Finished";
      return;
    }
    const utterance = new SpeechSynthesisUtterance(sentences[i].trim());
    utterance.rate = rate;
    utterance.onend = () => {
      i++;
      document.getElementById("progress").value = (i / sentences.length) * 100;
      speakNext();
    };
    utterance.onerror = (e) => console.error(e);
    speechSynthesis.speak(utterance);
    currentUtterance = utterance;
  }
  speakNext();
}

// ——— EPUB LOADING (this is the fixed part) ———
document.getElementById("epubInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!window.ePub) {
    document.getElementById("status").textContent = "EPUB.js failed to load – try refreshing";
    return;
  }

  try {
    document.getElementById("status").textContent = "Opening EPUB...";
    const arrayBuffer = await file.arrayBuffer();

    // This line is the correct one
    book = ePub(arrayBuffer);

    await book.ready;

    document.getElementById("title").textContent =
      book.package.metadata.title || "Unknown Title";

    const select = document.getElementById("chapterSelect");
    select.innerHTML = "";

    book.spine.each((item) => {
      const opt = document.createElement("option");
      opt.value = item.href;
      opt.textContent = item.label?.trim() || item.href;
      select.appendChild(opt);
    });

    document.getElementById("bookControls").classList.remove("hidden");
    document.getElementById("status").textContent = "Loaded! Choose a chapter.";

    // Auto-play first chapter
    select.value = select.options[0].value;
    loadChapter(select.options[0].value);

  } catch (err) {
    console.error(err);
    document.getElementById("status").textContent = "Failed to load EPUB – check console";
  }
});

async function loadChapter(href) {
  if (!book) return;
  document.getElementById("status").textContent = "Loading chapter...";
  const section = book.section(href);
  await section.load();
  const text = section.document.body.innerText || "";
  speakText(text, parseFloat(document.getElementById("rate").value));
}

// Controls
document.getElementById("chapterSelect").addEventListener("change", (e) => {
  loadChapter(e.target.value);
});

document.getElementById("playPause").addEventListener("click", () => {
  if (speechSynthesis.paused) {
    speechSynthesis.resume();
    document.getElementById("playPause").textContent = "Pause";
  } else if (speechSynthesis.speaking) {
    speechSynthesis.pause();
    document.getElementById("playPause").textContent = "Play";
  }
});

document.getElementById("stop").addEventListener("click", stop);

document.getElementById("rate").addEventListener("input", (e) => {
  const r = parseFloat(e.target.value).toFixed(1);
  document.getElementById("rateValue").textContent = r + "×";
});
