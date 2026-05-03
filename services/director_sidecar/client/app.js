const apiKey = document.querySelector("#apiKey");
const rememberKey = document.querySelector("#rememberKey");
const clearKey = document.querySelector("#clearKey");
const story = document.querySelector("#story");
const genre = document.querySelector("#genre");
const style = document.querySelector("#style");
const ratio = document.querySelector("#ratio");
const shotCount = document.querySelector("#shotCount");
const duration = document.querySelector("#duration");
const refineBtn = document.querySelector("#refineBtn");
const runBtn = document.querySelector("#runBtn");
const form = document.querySelector("#directorForm");
const runState = document.querySelector("#runState");
const refinedPrompt = document.querySelector("#refinedPrompt");
const directorOutput = document.querySelector("#directorOutput");

const remembered = localStorage.getItem("nextapi.director.key") || "";
if (remembered) {
  apiKey.value = remembered;
  rememberKey.checked = true;
}

rememberKey.addEventListener("change", () => {
  if (rememberKey.checked && apiKey.value.trim()) {
    localStorage.setItem("nextapi.director.key", apiKey.value.trim());
  } else {
    localStorage.removeItem("nextapi.director.key");
  }
});

apiKey.addEventListener("input", () => {
  if (rememberKey.checked) {
    localStorage.setItem("nextapi.director.key", apiKey.value.trim());
  }
});

clearKey.addEventListener("click", () => {
  apiKey.value = "";
  rememberKey.checked = false;
  localStorage.removeItem("nextapi.director.key");
});

refineBtn.addEventListener("click", async () => {
  const prompt = story.value.trim();
  if (!prompt) {
    setState("need prompt", true);
    return;
  }

  setBusy(refineBtn, true, "精修中");
  setState("refining");
  try {
    const response = await postJson("/client/api/prompt/refine", {
      prompt,
      mode: genre.value,
      style: style.value,
      ratio: ratio.value,
      duration: numberValue(duration, 5),
      references: [],
    });
    story.value = response.refined_prompt;
    refinedPrompt.textContent = JSON.stringify(
      {
        refined_prompt: response.refined_prompt,
        negative_prompt: response.negative_prompt,
        checklist: response.checklist,
      },
      null,
      2,
    );
    setState("refined");
  } catch (error) {
    showError(refinedPrompt, error);
    setState("failed", true);
  } finally {
    setBusy(refineBtn, false, "精修");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = apiKey.value.trim();
  const currentStory = story.value.trim();
  if (!key) {
    setState("missing key", true);
    return;
  }
  if (!currentStory) {
    setState("need prompt", true);
    return;
  }

  setBusy(runBtn, true, "运行中");
  setState("running");
  directorOutput.textContent = "{}";
  try {
    const response = await postJson("/client/api/director/run", {
      api_key: key,
      story: currentStory,
      engine: "advanced",
      genre: genre.value,
      style: style.value,
      scene: "",
      shot_count: numberValue(shotCount, 3),
      duration_per_shot: numberValue(duration, 5),
      ratio: ratio.value,
      resolution: "720p",
      model: "seedance-2.0-pro",
      generate_audio: true,
      run_workflow: false,
      generate_images: false,
      merge: true,
      references: [],
    });
    directorOutput.textContent = JSON.stringify(response, null, 2);
    setState(response.engine_used || response.status || "ready");
  } catch (error) {
    showError(directorOutput, error);
    setState("failed", true);
  } finally {
    setBusy(runBtn, false, "运行");
  }
});

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { detail: text };
    }
  }
  if (!response.ok) {
    throw new Error(readError(body, response.status));
  }
  return body;
}

function readError(body, status) {
  if (typeof body.detail === "string") return body.detail;
  if (body.detail?.message) return body.detail.message;
  if (body.error?.message) return body.error.message;
  if (body.message) return body.message;
  return `HTTP ${status}`;
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = label;
}

function setState(value, isError = false) {
  runState.textContent = value;
  runState.classList.toggle("error", isError);
}

function showError(target, error) {
  target.textContent = JSON.stringify({ error: error.message || String(error) }, null, 2);
}

function numberValue(input, fallback) {
  const value = Number.parseInt(input.value, 10);
  return Number.isFinite(value) ? value : fallback;
}
