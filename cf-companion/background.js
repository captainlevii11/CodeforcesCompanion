// background.js
// The background service worker is the only place that can use chrome.tabs,
// chrome.alarms, and chrome.notifications. Content scripts and the popup ask
// this script to do things on their behalf via chrome.runtime messages.

const ALARM_NAME = "cfc-verdict-check";
const ICON_URL = chrome.runtime.getURL("icons/icon128.png");

// ---------- Message handling ----------
// Content scripts / popup send messages here; we respond and/or act on them.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "OPEN_TABS") {
    const urls = message.urls || [];
    urls.forEach((url) => {
      chrome.tabs.create({ url, active: false });
    });
    sendResponse({ opened: urls.length });
    return true; // keep the message channel open for the async sendResponse
  }

  if (message.type === "START_TRACKING") {
    startTracking(message.handle);
    sendResponse({ tracking: true });
    return true;
  }

  if (message.type === "STOP_TRACKING") {
    stopTracking();
    sendResponse({ tracking: false });
    return true;
  }
});

// ---------- Verdict tracking ----------
function startTracking(handle) {
  chrome.storage.local.set({
    cfc_tracking_handle: handle,
    cfc_last_submission: null, // reset so the first tick doesn't skip your latest submission
  });
  // chrome.alarms enforces a minimum period of 1 minute once the extension
  // is packed/published. While loaded unpacked for development, Chrome allows
  // shorter periods, which is useful for testing.
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
}

function stopTracking() {
  chrome.storage.local.remove(["cfc_tracking_handle", "cfc_last_submission"]);
  chrome.alarms.clear(ALARM_NAME);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkLatestSubmission();
  }
});

async function checkLatestSubmission() {
  const data = await chrome.storage.local.get(["cfc_tracking_handle", "cfc_last_submission"]);
  const handle = data.cfc_tracking_handle;
  if (!handle) return; // tracking was turned off

  try {
    const res = await fetch(
      `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&count=1`
    );
    const json = await res.json();
    if (json.status !== "OK" || !json.result || json.result.length === 0) return;

    const latest = json.result[0];
    const previous = data.cfc_last_submission;

    const isNewSubmission = !previous || previous.id !== latest.id;
    const verdictChanged = previous && previous.id === latest.id && previous.verdict !== latest.verdict;
    const isFinalVerdict = latest.verdict && latest.verdict !== "TESTING";

    if ((isNewSubmission || verdictChanged) && isFinalVerdict) {
      notifyVerdict(latest);
    }

    // Always store the latest snapshot so we can detect the next change.
    chrome.storage.local.set({
      cfc_last_submission: { id: latest.id, verdict: latest.verdict },
    });
  } catch (err) {
    // Network hiccup — just try again on the next alarm tick.
    console.error("CF Companion: failed to check submission status", err);
  }
}

function notifyVerdict(submission) {
  const problemName = submission.problem
    ? `${submission.problem.index}. ${submission.problem.name}`
    : "Unknown problem";
  const verdict = submission.verdict || "UNKNOWN";

  chrome.notifications.create({
    type: "basic",
    iconUrl: ICON_URL,
    title: verdict === "OK" ? "✅ Accepted!" : `❌ ${verdict}`,
    message: problemName,
    priority: 1,
  });
}
