// content-notes.js
// Injects a floating, collapsible notes panel on Codeforces problem pages.
// Notes are saved per-URL in chrome.storage.local so each problem keeps its own notes.

(function () {
  const STORAGE_KEY = "notes:" + window.location.pathname;

  const panel = document.createElement("div");
  panel.id = "cfc-notes-panel";
  panel.innerHTML = `
    <div id="cfc-notes-header">
      <span>📝 My Notes</span>
      <button id="cfc-notes-toggle">–</button>
    </div>
    <div id="cfc-notes-body">
      <textarea id="cfc-notes-textarea" placeholder="Jot your approach, edge cases, complexity..."></textarea>
      <div id="cfc-notes-footer">
        <span id="cfc-notes-status"></span>
        <button id="cfc-notes-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const textarea = panel.querySelector("#cfc-notes-textarea");
  const status = panel.querySelector("#cfc-notes-status");
  const saveBtn = panel.querySelector("#cfc-notes-save");
  const toggleBtn = panel.querySelector("#cfc-notes-toggle");
  const body = panel.querySelector("#cfc-notes-body");

  // Load existing note
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    if (result[STORAGE_KEY]) {
      textarea.value = result[STORAGE_KEY];
    }
  });

  // Save note
  function saveNote() {
    const value = textarea.value;
    chrome.storage.local.set({ [STORAGE_KEY]: value }, () => {
      status.textContent = "Saved ✓";
      setTimeout(() => (status.textContent = ""), 1500);
    });
  }

  saveBtn.addEventListener("click", saveNote);

  // Autosave on pause typing (debounced)
  let debounceTimer;
  textarea.addEventListener("input", () => {
    status.textContent = "Typing...";
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(saveNote, 1000);
  });

  // Collapse/expand
  let collapsed = false;
  toggleBtn.addEventListener("click", () => {
    collapsed = !collapsed;
    body.style.display = collapsed ? "none" : "block";
    toggleBtn.textContent = collapsed ? "+" : "–";
  });
})();
