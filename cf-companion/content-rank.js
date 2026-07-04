// content-rank.js
// Shows your live rank/points/penalty for the current contest, right on the
// problem page. Uses contest.standings with the "handles" filter so we only
// ever fetch YOUR row, not the entire scoreboard (much cheaper and faster).

(function () {
  const REFRESH_MS = 30 * 1000; // poll every 30s while the tab stays open
  const HANDLE_STORAGE_KEY = "cfc_rank_handle";

  function parseContest() {
    // Matches /contest/{id}/problem/{index} or /gym/{id}/problem/{index}
    const match = window.location.pathname.match(/\/(contest|gym)\/(\d+)\/problem\//);
    if (!match) return null;
    return { type: match[1], contestId: parseInt(match[2], 10) };
  }

  const contest = parseContest();
  if (!contest) return; // Not on a contest problem page

  const panel = document.createElement("div");
  panel.id = "cfc-rank-panel";
  panel.innerHTML = `
    <div id="cfc-rank-header">
      <span>🏆 Live Rank</span>
      <button id="cfc-rank-refresh" title="Refresh now">⟳</button>
    </div>
    <div id="cfc-rank-body">
      <div id="cfc-rank-setup" class="cfc-hidden">
        <input id="cfc-rank-handle-input" type="text" placeholder="Your CF handle" />
        <button id="cfc-rank-save-handle">Save</button>
      </div>
      <div id="cfc-rank-display" class="cfc-hidden">
        <div class="cfc-rank-stat">
          <span class="cfc-rank-label">Rank</span>
          <span class="cfc-rank-value" id="cfc-rank-value">–</span>
        </div>
        <div class="cfc-rank-stat">
          <span class="cfc-rank-label">Points</span>
          <span class="cfc-rank-value" id="cfc-points-value">–</span>
        </div>
        <div class="cfc-rank-stat">
          <span class="cfc-rank-label">Penalty</span>
          <span class="cfc-rank-value" id="cfc-penalty-value">–</span>
        </div>
        <div id="cfc-rank-updated"></div>
      </div>
      <div id="cfc-rank-status"></div>
    </div>
  `;
  document.body.appendChild(panel);

  const setupDiv = panel.querySelector("#cfc-rank-setup");
  const displayDiv = panel.querySelector("#cfc-rank-display");
  const statusDiv = panel.querySelector("#cfc-rank-status");
  const handleInput = panel.querySelector("#cfc-rank-handle-input");
  const saveHandleBtn = panel.querySelector("#cfc-rank-save-handle");
  const refreshBtn = panel.querySelector("#cfc-rank-refresh");

  let pollTimer = null;

  // ---------- Setup: figure out which handle to track ----------
  chrome.storage.local.get([HANDLE_STORAGE_KEY], (data) => {
    if (data[HANDLE_STORAGE_KEY]) {
      startPolling(data[HANDLE_STORAGE_KEY]);
    } else {
      setupDiv.classList.remove("cfc-hidden");
    }
  });

  saveHandleBtn.addEventListener("click", () => {
    const handle = handleInput.value.trim();
    if (!handle) return;
    chrome.storage.local.set({ [HANDLE_STORAGE_KEY]: handle }, () => {
      setupDiv.classList.add("cfc-hidden");
      startPolling(handle);
    });
  });

  refreshBtn.addEventListener("click", () => {
    chrome.storage.local.get([HANDLE_STORAGE_KEY], (data) => {
      if (data[HANDLE_STORAGE_KEY]) fetchRank(data[HANDLE_STORAGE_KEY]);
    });
  });

  function startPolling(handle) {
    displayDiv.classList.remove("cfc-hidden");
    fetchRank(handle); // fetch immediately, then on an interval
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => fetchRank(handle), REFRESH_MS);
  }

  // Stop polling if the tab is hidden/closed, so we don't keep hitting the
  // API from a tab nobody is looking at.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    } else if (!document.hidden && !pollTimer) {
      chrome.storage.local.get([HANDLE_STORAGE_KEY], (data) => {
        if (data[HANDLE_STORAGE_KEY]) startPolling(data[HANDLE_STORAGE_KEY]);
      });
    }
  });

  async function fetchRank(handle) {
    statusDiv.textContent = "";
    try {
      const url = `https://codeforces.com/api/contest.standings?contestId=${contest.contestId}&handles=${encodeURIComponent(
        handle
      )}&showUnofficial=true`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.status !== "OK") {
        statusDiv.textContent = json.comment || "Standings not available yet.";
        return;
      }

      const row = json.result.rows[0];
      if (!row) {
        statusDiv.textContent = "No standings row found for this handle.";
        return;
      }

      document.getElementById("cfc-rank-value").textContent = row.rank;
      document.getElementById("cfc-points-value").textContent = row.points;
      document.getElementById("cfc-penalty-value").textContent = row.penalty;
      document.getElementById("cfc-rank-updated").textContent =
        "Updated " + new Date().toLocaleTimeString();
    } catch (err) {
      statusDiv.textContent = "Network error fetching standings.";
    }
  }
})();
