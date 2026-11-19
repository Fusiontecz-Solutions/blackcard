const statusEl = document.getElementById("status");
const openTabBtn = document.getElementById("openTabBtn");

function setStatus(className, text) {
  statusEl.className = `status ${className}`;
  statusEl.textContent = text;
}

async function initPopup() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = String(tab?.url || "");
    const onOpenCorporates = /https:\/\/([^/]+\.)?opencorporates\.com\//i.test(url);
    const isCaptcha =
      url.includes("haproxy") ||
      (tab?.title || "").includes("HAProxy Challenge");

    if (onOpenCorporates && !isCaptcha) {
      setStatus(
        "ok",
        "You are on OpenCorporates. Look for the purple Send to CRM button at the bottom-right of the page.",
      );
      return;
    }

    if (onOpenCorporates && isCaptcha) {
      setStatus(
        "warn",
        "Complete the captcha on this tab first. Then the Send to CRM button will appear.",
      );
      return;
    }

    setStatus(
      "idle",
      "Start from Black Card: Background Check → OpenCorporates → Search OpenCorporates. That opens this site in a new tab.",
    );
    openTabBtn.hidden = false;
    openTabBtn.addEventListener("click", () => {
      void chrome.tabs.create({ url: "https://opencorporates.com/companies" });
      window.close();
    });
  } catch {
    setStatus(
      "idle",
      "Open Black Card, go to Background Check, and click Search OpenCorporates.",
    );
  }
}

void initPopup();
