// content-similar.js
// Adds a "Find Similar Problems" panel on Codeforces problem pages.
// Uses the public problemset.problems API (cached 24h) to rank problems
// by tag overlap + rating closeness to the current problem.

(function () {
  const CACHE_KEY = "cfc_problemset_cache";
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  const RATING_WINDOW = 200; // +/- rating range to consider "similar"
  const MAX_RESULTS = 6;

  function parseCurrentProblem() {
    // Matches: /problemset/problem/{contestId}/{index}
    //          /contest/{contestId}/problem/{index}
    //          /gym/{contestId}/problem/{index}
    const path = window.location.pathname;
    let match = path.match(/\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)/);
    if (!match) match = path.match(/\/(?:contest|gym)\/(\d+)\/problem\/([A-Za-z0-9]+)/);
    if (!match) return null;
    return { contestId: parseInt(match[1], 10), index: match[2] };
  }

  function getProblemsetCached() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([CACHE_KEY], async (data) => {
        const cached = data[CACHE_KEY];
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
          resolve(cached.problems);
          return;
        }
        try {
          const res = await fetch("https://codeforces.com/api/problemset.problems");
          const json = await res.json();
          if (json.status !== "OK") {
            reject(new Error(json.comment || "API error"));
            return;
          }
          const problems = json.result.problems;
          chrome.storage.local.set({
            [CACHE_KEY]: { problems, timestamp: Date.now() },
          });
          resolve(problems);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  function findSimilar(problems, current) {
    const currentEntry = problems.find(
      (p) => p.contestId === current.contestId && p.index === current.index
    );
    if (!currentEntry) return { currentEntry: null, similar: [] };

    const currentTags = new Set(currentEntry.tags || []);
    const currentRating = currentEntry.rating;

    const scored = problems
      .filter(
        (p) => !(p.contestId === current.contestId && p.index === current.index)
      )
      .map((p) => {
        const overlap = (p.tags || []).filter((t) => currentTags.has(t)).length;
        const ratingDiff =
          currentRating && p.rating ? Math.abs(p.rating - currentRating) : Infinity;
        return { ...p, overlap, ratingDiff };
      })
      .filter((p) => p.overlap > 0)
      .filter((p) => !currentRating || p.ratingDiff <= RATING_WINDOW)
      .sort((a, b) => {
        if (b.overlap !== a.overlap) return b.overlap - a.overlap;
        return a.ratingDiff - b.ratingDiff;
      })
      .slice(0, MAX_RESULTS);

    return { currentEntry, similar: scored };
  }

  function buildPanel() {
    const panel = document.createElement("div");
    panel.id = "cfc-similar-panel";
    panel.innerHTML = `
      <div id="cfc-similar-header">
        <span>🔍 Similar Problems</span>
        <button id="cfc-similar-toggle">Find</button>
      </div>
      <div id="cfc-similar-body" class="cfc-hidden">
        <div id="cfc-similar-status">Loading...</div>
        <div id="cfc-similar-list"></div>
      </div>
    `;
    document.body.appendChild(panel);
    return panel;
  }

  const current = parseCurrentProblem();
  if (!current) return; // Not a recognizable problem page

  const panel = buildPanel();
  const toggleBtn = panel.querySelector("#cfc-similar-toggle");
  const body = panel.querySelector("#cfc-similar-body");
  const statusDiv = panel.querySelector("#cfc-similar-status");
  const listDiv = panel.querySelector("#cfc-similar-list");

  let loaded = false;

  toggleBtn.addEventListener("click", async () => {
    const isHidden = body.classList.contains("cfc-hidden");
    body.classList.toggle("cfc-hidden");
    toggleBtn.textContent = isHidden ? "Hide" : "Find";
    if (isHidden && !loaded) {
      loaded = true;
      try {
        const problems = await getProblemsetCached();
        const { currentEntry, similar } = findSimilar(problems, current);

        if (!currentEntry) {
          statusDiv.textContent = "Couldn't identify this problem in the API data.";
          return;
        }
        if (similar.length === 0) {
          statusDiv.textContent = "No close matches found.";
          return;
        }

        statusDiv.textContent = `Based on: ${(currentEntry.tags || []).join(", ")} (rating ${
          currentEntry.rating || "N/A"
        })`;

        listDiv.innerHTML = "";
        similar.forEach((p) => {
          const url = `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`;
          const item = document.createElement("a");
          item.href = url;
          item.target = "_blank";
          item.className = "cfc-similar-item";
          item.innerHTML = `
            <span class="cfc-similar-name">${escapeHtml(p.name)}</span>
            <span class="cfc-similar-meta">${p.rating || "?"} · ${p.overlap} shared tag${
            p.overlap > 1 ? "s" : ""
          }</span>
          `;
          listDiv.appendChild(item);
        });
      } catch (err) {
        statusDiv.textContent = "Failed to load problem data. Try again.";
      }
    }
  });

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
