"use strict";

/**
 * Device category taxonomy, shared by the auto-categorization heuristic
 * below and the frontend (which mirrors these ids in
 * src/lib/device-categories.ts for labels/icons).
 */
const CATEGORIES = [
  "desktop",
  "laptop",
  "phone",
  "tablet",
  "printer",
  "router",
  "server",
  "camera",
  "tv",
  "speaker",
  "iot",
  "other",
];

const KEYWORD_RULES = [
  {
    category: "printer",
    keywords: ["printer", "hp ", "canon", "epson", "brother", "lexmark", "zebra"],
  },
  {
    category: "camera",
    keywords: [
      "hikvision",
      "dahua",
      "axis communications",
      "reolink",
      "amcrest",
      "wyze",
      "ring ",
      "nest cam",
      "-cam",
      "camera",
    ],
  },
  { category: "speaker", keywords: ["sonos", "bose", "echo-", "amazon echo", "homepod"] },
  {
    category: "tv",
    keywords: [
      "roku",
      "chromecast",
      "fire tv",
      "firetv",
      "appletv",
      "apple tv",
      "vizio",
      "lg electronics",
      "-tv",
      "smarttv",
      "smart-tv",
    ],
  },
  {
    category: "router",
    keywords: [
      "ubiquiti",
      "netgear",
      "tp-link",
      "mikrotik",
      "cisco",
      "asus",
      "gateway",
      "router",
      "access point",
      "-ap-",
      "unifi",
    ],
  },
  {
    category: "server",
    keywords: ["synology", "qnap", "nas", "supermicro", "proxmox", "server", "pi-hole", "pihole"],
  },
  {
    category: "iot",
    keywords: [
      "espressif",
      "esp8266",
      "esp32",
      "shelly",
      "tuya",
      "sonoff",
      "wemo",
      "philips hue",
      "hue-bridge",
      "xiaomi",
      "broadlink",
      "smartthings",
      "raspberry pi",
    ],
  },
  { category: "tablet", keywords: ["ipad", "tablet", "galaxy tab"] },
  { category: "phone", keywords: ["iphone", "android", "galaxy-", "pixel-", "-phone"] },
  { category: "laptop", keywords: ["macbook", "laptop", "-nb-", "notebook"] },
  { category: "desktop", keywords: ["desktop-", "imac", "workstation", "pc-"] },
];

/**
 * Best-effort guess at what kind of device this is, from whatever the scan
 * already learned (vendor OUI, hostname, open ports). Returns null rather
 * than a low-confidence guess when nothing matches - a blank "Uncategorized"
 * bucket the user can fill in beats a wrong label they have to notice and
 * correct.
 */
function guessCategory({ vendor, hostname, openPorts } = {}) {
  const haystack = `${vendor || ""} ${hostname || ""}`.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return rule.category;
    }
  }

  const ports = new Set(openPorts || []);
  if (ports.has(631) || ports.has(9100)) return "printer";
  if (ports.has(1883) || ports.has(8883)) return "iot";
  if ((ports.has(5432) || ports.has(3306) || ports.has(5000)) && ports.size >= 2) return "server";

  return null;
}

module.exports = { CATEGORIES, guessCategory };
