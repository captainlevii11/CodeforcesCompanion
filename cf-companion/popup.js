// popup.js
// Fetches a user's Codeforces submission history and computes per-tag solve rates
// to surface the "weakest" topics (lowest distinct-solved / distinct-attempted ratio).

const handleInput = document.getElementById("handle-input");
const analyzeBtn = document.getElementById("analyze-btn");
const statusMsg = document.getElementById("status-msg");
const resultsDiv = document.getElementById("results");
const tagListDiv = document.getElementById("tag-list");

const MIN_ATTEMPTS_TO_COUNT = 3; // ignore tags with too few attempts (noisy signal)

// Restore last-used handle and cached results on popup open
chrome.storage.local.get(["cfc_last_handle", "cfc_last_results"], (data) => {
  if (data.cfc_last_handle) {
    handleInput.value = data.cfc_last_handle;
  }
  if (data.cfc_last_results) {
    renderResults(data.cfc_last_results);
  }
});

analyzeBtn.addEventListener("click", analyze);
handleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") analyze();
});

async function analyze() {
  const handle = handleInput.value.trim();
  if (!handle) {
    setStatus("Enter a handle first.", true);
    return;
  }

  setStatus("Fetching submissions...");
  analyzeBtn.disabled = true;
  resultsDiv.classList.add("hidden");

  try {
    const res = await fetch(
      `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}`
    );
    const data = await res.json();

    if (data.status !== "OK") {
      setStatus(data.comment || "Could not fetch submissions.", true);
      analyzeBtn.disabled = false;
      return;
    }

    const tagStats = computeTagStats(data.result);
    chrome.storage.local.set({
      cfc_last_handle: handle,
      cfc_last_results: tagStats,
    });

    renderResults(tagStats);
    setStatus(`Analyzed ${data.result.length} submissions.`);
  } catch (err) {
    setStatus("Network error — try again.", true);
  } finally {
    analyzeBtn.disabled = false;
  }
}

function computeTagStats(submissions) {
  // For each tag: track distinct attempted problems and distinct solved problems.
  const tagData = {}; // tag -> { attempted: Set, solved: Set }

  submissions.forEach((sub) => {
    const problem = sub.problem;
    if (!problem || !problem.tags || problem.tags.length === 0) return;
    const problemId = `${problem.contestId || ""}-${problem.index}`;

    problem.tags.forEach((tag) => {
      if (!tagData[tag]) {
        tagData[tag] = { attempted: new Set(), solved: new Set() };
      }
      tagData[tag].attempted.add(problemId);
      if (sub.verdict === "OK") {
        tagData[tag].solved.add(problemId);
      }
    });
  });

  const stats = Object.entries(tagData)
    .map(([tag, { attempted, solved }]) => ({
      tag,
      attempted: attempted.size,
      solved: solved.size,
      rate: solved.size / attempted.size,
    }))
    .filter((s) => s.attempted >= MIN_ATTEMPTS_TO_COUNT)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 8);

  return stats;
}

function renderResults(stats) {
  if (!stats || stats.length === 0) {
    resultsDiv.classList.add("hidden");
    return;
  }

  tagListDiv.innerHTML = "";
  stats.forEach((s) => {
    const pct = Math.round(s.rate * 100);
    const row = document.createElement("div");
    row.className = "tag-row";
    row.innerHTML = `
      <div class="tag-row-top">
        <span class="tag-name">${escapeHtml(s.tag)}</span>
        <span class="tag-stats">${s.solved}/${s.attempted} (${pct}%)</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pct}%"></div>
      </div>
      <a class="tag-link" href="https://codeforces.com/problemset?tags=${encodeURIComponent(
        s.tag
      )}" target="_blank">Practice ${escapeHtml(s.tag)} problems →</a>
    `;
    tagListDiv.appendChild(row);
  });

  resultsDiv.classList.remove("hidden");
}

function setStatus(msg, isError = false) {
  statusMsg.textContent = msg;
  statusMsg.style.color = isError ? "#fc8181" : "#f6ad55";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Verdict tracking toggle ----------
const trackingBtn = document.getElementById("tracking-toggle-btn");
const trackingStatus = document.getElementById("tracking-status");

// Reflect current tracking state when popup opens
chrome.storage.local.get(["cfc_tracking_handle"], (data) => {
  updateTrackingUI(!!data.cfc_tracking_handle, data.cfc_tracking_handle);
});

trackingBtn.addEventListener("click", () => {
  chrome.storage.local.get(["cfc_tracking_handle"], (data) => {
    if (data.cfc_tracking_handle) {
      // Currently tracking -> stop
      chrome.runtime.sendMessage({ type: "STOP_TRACKING" }, () => {
        updateTrackingUI(false);
      });
    } else {
      // Not tracking -> start, using whatever handle is in the input box
      const handle = handleInput.value.trim();
      if (!handle) {
        trackingStatus.textContent = "Enter a handle above first.";
        trackingStatus.style.color = "#fc8181";
        return;
      }
      chrome.runtime.sendMessage({ type: "START_TRACKING", handle }, () => {
        updateTrackingUI(true, handle);
      });
    }
  });
});

function updateTrackingUI(isTracking, handle) {
  if (isTracking) {
    trackingBtn.textContent = "Stop Tracking";
    trackingBtn.classList.add("active");
    trackingStatus.textContent = `Watching submissions for "${handle}"...`;
    trackingStatus.style.color = "#9ae6b4";
  } else {
    trackingBtn.textContent = "Start Tracking";
    trackingBtn.classList.remove("active");
    trackingStatus.textContent = "";
  }
}
