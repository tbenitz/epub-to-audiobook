import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/+esm';
import { createReader } from 'https://cdn.jsdelivr.net/npm/epubjs@0.3.89/+esm';

// Enable WebGPU (fallback to WASM if not available)
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';
ort.env.webgpu = true;

let session = null;
let book = null;
let currentAudio = null;
let currentUtterance = null;

const MODEL_URL = "https://huggingface.co/Supertone/supertonic/resolve/main/web/supertonic_webgpu.onnx";
const VOICE_PRESET_URL = "https://huggingface.co/Supertone/supertonic/resolve/main/web/presets.json";

async function loadTTS() {
  if (session) return;
  document.getElementById("status").textContent = "Loading Supertonic TTS (first time only)...";
  session = await ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ['webgpu', 'wasm']
  });
  // Load voice presets if you want multiple voices later
  document.getElementById("status").textContent = "TTS ready!";
}

async function textToSpeech(text) {
  if (!session) await loadTTS();

  const normalized = text.trim();
  if (!normalized) return null;

  const encoder = new TextEncoder();
  const input = encoder.encode(normalized);

  // Dummy input for now – Supertonic web example uses fixed tensors
  // This is a simplified version that works with the public web demo model
  const feeds = {
    input: new ort.Tensor('uint8', input, [input.length]),
    length: new ort.Tensor('int64', [input.length], [1])
  };

  const results = await session.run(feeds);
  const audioData = results.output; // int16 PCM

  // Convert to WAV blob
  const wavBlob = int16ToWav(audioData.data, 24000);
  return URL.createObjectURL(wavBlob);
}

function int16ToWav(pcmData, sampleRate) {
  const buffer = new ArrayBuffer(44 + pcmData.length * 2);
  const view = new DataView(buffer);

  // RIFF header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmData.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, pcmData.length * 2, true);

  let offset = 44;
  for (let i = 0; i < pcmData.length; i++, offset += 2)
    view.setInt16(offset, pcmData[i], true);

  return new Blob([buffer], { type: 'audio/wav' });
}

// EPUB handling
document.getElementById("epubInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  document.getElementById("status").textContent = "Loading EPUB...";
  const arrayBuffer = await file.arrayBuffer();
  book = ePub(arrayBuffer);

  await book.ready;
  document.getElementById("title").textContent = book.package.metadata.title;
  const chapterSelect = document.getElementById("chapterSelect");
  chapterSelect.innerHTML = "";

  book.spine.each((chapter) => {
    const option = document.createElement("option");
    option.value = chapter.href;
    option.textContent = chapter.id + " – " + (chapter.label || chapter.href);
    chapterSelect.appendChild(option);
  });

  document.getElementById("bookControls").classList.remove("hidden");
  document.getElementById("status").textContent = "Ready – choose a chapter";

  loadChapter(chapterSelect.value);
});

async function loadChapter(href) {
  const section = book.section(href);
  const contents = await section.render();
  const text = contents.document.body.innerText;
  await speakText(text);
}

async function speakText(text) {
  stop();
  document.getElementById("status").textContent = "Generating audio... (this may take a few seconds)";

  // Split into sentences to avoid huge tensors
  const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];
  const audioBlobs = [];

  for (let i = 0; i < sentences.length; i++) {
    const url = await textToSpeech(sentences[i]);
    if (url) audioBlobs.push(url);
    document.getElementById("progress").value = (i + 1) / sentences.length * 100;
  }

  currentAudio = new Audio();
  currentAudio.src = audioBlobs[0];
  let index = 0;

  currentAudio.onended = () => {
    index++;
    if (index < audioBlobs.length) {
      currentAudio.src = audioBlobs[index];
      currentAudio.play();
    }
  };

  currentAudio.play();
  document.getElementById("playPause").textContent = "⏸ Pause";
  document.getElementById("status").textContent = "Playing...";
}

// Controls
document.getElementById("playPause").onclick = () => {
  if (!currentAudio) return;
  if (currentAudio.paused) {
    currentAudio.play();
    document.getElementById("playPause").textContent = "⏸ Pause";
  } else {
    currentAudio.pause();
    document.getElementById("playPause").textContent = "▶️ Play";
  }
};

document.getElementById("stop").onclick = stop;
function stop() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
    document.getElementById("playPause").textContent = "▶️ Play";
    document.getElementById("status").textContent = "Stopped";
  }
}

document.getElementById("chapterSelect").onchange = (e) => loadChapter(e.target.value);
document.getElementById("rate").oninput = (e) => {
  const rate = e.target.value;
  document.getElementById("rateValue").textContent = rate + "×";
  if (currentAudio) currentAudio.playbackRate = rate;
};
