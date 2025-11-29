// Supertonic TTS Integration (unchanged from previous — see below for full if needed)
import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.0/dist/ort.min.js';

let session = null;
let presets = null;
const MODEL_URL = 'https://huggingface.co/Supertone/supertonic/resolve/main/supertonic.onnx';
const PRESETS_URL = 'https://huggingface.co/Supertone/supertonic/resolve/main/presets.json';
const SAMPLE_RATE = 24000;

// Simple BPE tokenizer mock
const BPE_VOCAB = new Map();
function tokenize(text) {
  const encoder = new TextEncoder();
  return encoder.encode(text);
}

// Load presets
async function loadPresets() {
  if (presets) return presets;
  const res = await fetch(PRESETS_URL);
  presets = await res.json();
  return presets;
}

// Load model
async function loadTTS() {
  if (session) return;
  document.getElementById("status").textContent = "Loading Supertonic model (~130MB, one-time)...";
  
  ort.env.logLevel = 'error';
  ort.env.webgpu = { deviceId: 0 };
  
  try {
    session = await ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['webgpu', 'wasm', 'cpu']
    });
    await loadPresets();
    document.getElementById("status").textContent = "Supertonic ready! (WebGPU enabled)";
  } catch (err) {
    console.error("Supertonic load error:", err);
    document.getElementById("status").textContent = "Fallback to browser TTS (WebGPU unavailable)";
  }
}

// Generate speech from text
async function textToSpeech(text, voiceId = 'en-US-female') {
  if (!session) await loadTTS();
  
  if (!presets) {
    return speakWithWebSpeech(text);
  }

  const normalizedText = text.trim();
  if (!normalizedText) return null;

  const inputIds = new ort.Tensor('int32', tokenize(normalizedText), [1, normalizedText.length]);
  const attentionMask = new ort.Tensor('int32', new Array(normalizedText.length).fill(1), [1, normalizedText.length]);
  
  const steps = new ort.Tensor('int32', [2], [1]);
  const voicePreset = presets[voiceId];
  const speakerId = new ort.Tensor('float32', new Float32Array([voicePreset.speaker_id]), [1]);

  const feeds = {
    input_ids: inputIds,
    attention_mask: attentionMask,
    num_inference_steps: steps,
    speaker_ids: speakerId
  };

  const results = await session.run(feeds);
  const audioLatents = results.audio_latents.data;

  const pcmData = decodeLatents(audioLatents, voicePreset);
  const wavBlob = pcmToWav(pcmData, SAMPLE_RATE);
  return URL.createObjectURL(wavBlob);
}

// Simplified latent decoder (placeholder — replace with real VQ-VAE if available)
function decodeLatents(latents, preset) {
  const T = latents.length / 512;
  const pcm = new Int16Array(T * SAMPLE_RATE / 100);
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = (Math.sin(i / 1000) * 32767 * preset.volume) | 0;  // Temp sine; integrate real decoder
  }
  return pcm;
}

// PCM to WAV
function pcmToWav(pcmData, sampleRate) {
  const buffer = new ArrayBuffer(44 + pcmData.length * 2);
  const view = new DataView(buffer);
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
  for (let i = 0; i < pcmData.length; i++, offset += 2) {
    view.setInt16(offset, pcmData[i], true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

// Web Speech fallback
function speakWithWebSpeech(text, rate = 1) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  speechSynthesis.speak(utterance);
  return new Promise((resolve) => { utterance.onend = resolve; });
}

// Updated speakText
let currentAudio = null;
async function speakText(text, rate = 1) {
  stop();
  document.getElementById("status").textContent = "Generating speech with Supertonic...";

  const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];
  const audioUrls = [];
  for (let i = 0; i < sentences.length; i++) {
    const url = await textToSpeech(sentences[i]);
    if (url) audioUrls.push(url);
    document.getElementById("progress").value = ((i + 1) / sentences.length) * 100;
  }

  if (audioUrls.length === 0) return;

  currentAudio = new Audio(audioUrls[0]);
  currentAudio.playbackRate = rate;
  let index = 0;
  currentAudio.onended = () => {
    index++;
    if (index < audioUrls.length) {
      currentAudio.src = audioUrls[index];
      currentAudio.play();
    } else {
      document.getElementById("status").textContent = "Done!";
    }
  };
  currentAudio.play();
  document.getElementById("playPause").textContent = "⏸ Pause";
}

// Stop
function stop() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  speechSynthesis.cancel();
  document.getElementById("playPause").textContent = "▶️ Play";
  document.getElementById("status").textContent = "Stopped";
}

// FIXED EPUB handling — uses window.ePub directly
let book = null;
document.getElementById("epubInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    if (!window.ePub) {
      throw new Error('ePub library not loaded. Refresh the page.');
    }

    document.getElementById("status").textContent = "Loading EPUB...";
    const arrayBuffer = await file.arrayBuffer();

    // FIXED: Use ePub constructor directly with ArrayBuffer
    book = new window.ePub(arrayBuffer, {
      replacements: 'blobUrl'  // Handles local assets
    });

    await book.ready;  // Wait for parsing

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

// Controls (unchanged)
document.getElementById("playPause").onclick = () => {
  if (currentAudio) {
    if (currentAudio.paused) {
      currentAudio.play();
      document.getElementById("playPause").textContent = "⏸ Pause";
    } else {
      currentAudio.pause();
      document.getElementById("playPause").textContent = "▶️ Play";
    }
  } else if (speechSynthesis.speaking) {
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
      document.getElementById("playPause").textContent = "⏸ Pause";
    } else {
      speechSynthesis.pause();
      document.getElementById("playPause").textContent = "▶️ Play";
    }
  }
};

document.getElementById("stop").onclick = stop;

document.getElementById("chapterSelect").onchange = (e) => loadChapter(e.target.value);

document.getElementById("rate").oninput = (e) => {
  const rate = parseFloat(e.target.value);
  document.getElementById("rateValue").textContent = rate.toFixed(1) + "×";
  if (currentAudio) currentAudio.playbackRate = rate;
};
