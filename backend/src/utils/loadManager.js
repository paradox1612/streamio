const ADDON_BUSY_THRESHOLD = parseInt(process.env.ADDON_BUSY_THRESHOLD || '2', 10);
const BACKGROUND_BACKOFF_MS = parseInt(process.env.BACKGROUND_BACKOFF_MS || '150', 10);

let activeAddonRequests = 0;

function beginAddonRequest() {
  activeAddonRequests += 1;
}

function endAddonRequest() {
  activeAddonRequests = Math.max(0, activeAddonRequests - 1);
}

function getActiveAddonRequests() {
  return activeAddonRequests;
}

async function waitForAddonCapacity() {
  while (activeAddonRequests >= ADDON_BUSY_THRESHOLD) {
    await new Promise(resolve => setTimeout(resolve, BACKGROUND_BACKOFF_MS));
  }
}

module.exports = {
  beginAddonRequest,
  endAddonRequest,
  getActiveAddonRequests,
  waitForAddonCapacity,
};
