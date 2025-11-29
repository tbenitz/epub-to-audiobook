// Fallback TTS using Web Speech API (for immediate testing)
let currentUtterance = null;
let book = null;

async function speakText(text, rate = 1) {
  stop(); // Clear previous
  if (!text.trim()) return;

  document.getElementById("status").textContent = "Speaking...";

  // Split into sentences for natural pauses
  const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];
  let sentenceIndex = 0;

  function speakNext() {
    if (sentenceIndex >= sentences.length) {
      document.getElementById("status").textContent = "Done!";
      return;
    }

    const utterance = new SpeechSynthesisUtterance(sentences[sentenceIndex].trim());
    utterance.rate = rate;
    utterance.onend = () => {
      sentenceIndex++;
      speakNext();
      document.getElementById("progress").value = (sentenceIndex / sentences.length) * 100;
    };
    utterance.onerror = (e) => {
      console.error("Speech error:", e);
      document.getElementById("status").textContent = "Speech error—check console.";
    };

    speechSynthesis.speak(utterance);
    currentUtterance = utterance;
  }

  speakNext();
}

function stop() {
  speechSynthesis.cancel();
  currentUtterance = null;
  document.getElementById("playPause").textContent = "▶️ Play";
  document.getElementById("status").textContent = "Stopped";
}

// EPUB handling with better error handling
document.getElementById("epubInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    document.getElementById("status").textContent = "Loading EPUB...";
    const arrayBuffer = await file.arrayBuffer();

    // Use imported createReader
    book = await createReader(arrayBuffer, { 
      manager: 'default',
      renderer: 'default' 
    });

    await book.ready;

    const metadata = book.packaging.metadata;
    document.getElementById("title").textContent = metadata.title || 'Unknown Title';

    const chapterSelect = document.getElementById("chapterSelect");
    chapterSelect.innerHTML = "";

    book.spine.each((section) => {
      const option = document.createElement("option");
      option.value = section.href;
      option.textContent = section.title || section.idref || `Chapter ${chapterSelect.options.length + 1}`;
      chapterSelect.appendChild(option);
    });

    if (chapterSelect.options.length === 0) {
      throw new Error("No chapters found in EPUB.");
    }

    document.getElementById("bookControls").classList.remove("hidden");
    document.getElementById("status").textContent = `Loaded: ${chapterSelect.options.length} chapters. Select one to play.`;

    // Auto-load first chapter
    chapterSelect.value = chapterSelect.options[0].value;
    loadChapter(chapterSelect.value);
  } catch (error) {
    console.error("EPUB load error:", error);
    document.getElementById("status").textContent = `Error loading EPUB: ${error.message}. Check console for details.`;
  }
});

async function loadChapter(href) {
  if (!book) return;
  try {
    document.getElementById("status").textContent = "Loading chapter...";
    const contents = await book.load(href);
    const text = contents ? contents.document.body.innerText : "";
    if (!text.trim()) {
      throw new Error("No text found in chapter.");
    }
    await speakText(text);
  } catch (error) {
    console.error("Chapter load error:", error);
    document.getElementById("status").textContent = `Error loading chapter: ${error.message}`;
  }
}

// Controls
document.getElementById("playPause").onclick = () => {
  if (currentUtterance && !speechSynthesis.paused) {
    speechSynthesis.pause();
    document.getElementById("playPause").textContent = "▶️ Play";
  } else {
    speechSynthesis.resume();
    document.getElementById("playPause").textContent = "⏸ Pause";
  }
};

document.getElementById("stop").onclick = stop;

document.getElementById("chapterSelect").onchange = (e) => loadChapter(e.target.value);

document.getElementById("rate").oninput = (e) => {
  const rate = parseFloat(e.target.value);
  document.getElementById("rateValue").textContent = rate.toFixed(1) + "×";
  if (currentUtterance) {
    currentUtterance.rate = rate;
  }
};
