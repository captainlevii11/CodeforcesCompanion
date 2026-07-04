// content-autoopen.js
// Adds a floating button on contest pages that opens every problem in new tabs.

(function () {
  function findProblemLinks() {
    // Codeforces problem links look like /contest/1234/problem/A or /problemset/problem/1234/A
    const anchors = Array.from(document.querySelectorAll('a[href*="/problem/"]'));
    const urls = new Set();
    anchors.forEach((a) => {
      // Filter to short "letter" links inside the problems table, avoid duplicate/status links
      const href = a.getAttribute("href");
      if (href && /\/problem\/[A-Za-z0-9]+$/.test(href)) {
        urls.add(new URL(href, window.location.origin).href);
      }
    });
    return Array.from(urls);
  }

  function createButton() {
    const btn = document.createElement("button");
    btn.id = "cfc-autoopen-btn";
    btn.textContent = "🚀 Open All Problems";
    btn.addEventListener("click", () => {
      const urls = findProblemLinks();
      if (urls.length === 0) {
        btn.textContent = "No problems found";
        setTimeout(() => (btn.textContent = "🚀 Open All Problems"), 1500);
        return;
      }
      chrome.runtime.sendMessage({ type: "OPEN_TABS", urls }, (response) => {
        btn.textContent = `Opened ${response?.opened ?? urls.length} tabs ✓`;
        setTimeout(() => (btn.textContent = "🚀 Open All Problems"), 2000);
      });
    });
    document.body.appendChild(btn);
  }

  // Only show the button if there's at least one problem link on the page
  if (findProblemLinks().length > 0) {
    createButton();
  }
})();
