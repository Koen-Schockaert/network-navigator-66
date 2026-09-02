"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Minimal OUI (MAC vendor prefix) lookup table.
 * Keys are the first 3 bytes of the MAC address: uppercase hex, no separators.
 * Covers common consumer / networking vendors. Always available even if the
 * full-database refresh below has never been run, so vendor lookups keep
 * working offline and on a fresh install.
 */
const OUI = {
  "000C29": "VMware",
  "005056": "VMware",
  "001C42": "Parallels",
  "080027": "Oracle VirtualBox",
  525400: "QEMU / KVM",
  "02420A": "Docker",
  B827EB: "Raspberry Pi Foundation",
  DCA632: "Raspberry Pi",
  E45F01: "Raspberry Pi",
  D83ADD: "Raspberry Pi",
  "2CCF67": "Raspberry Pi",
  "3C22FB": "Apple",
  A4B197: "Apple",
  F0989D: "Apple",
  "8863DF": "Apple",
  "9C207B": "Apple",
  "04D3CF": "Apple",
  "001451": "Apple",
  ACDE48: "Apple",
  "7CD1C3": "Apple",
  "0016CB": "Apple",
  "001B63": "Apple",
  F0DBF8: "Apple",
  "40B395": "Apple",
  "6C4008": "Apple",
  C82A14: "Apple",
  D0E140: "Apple",
  "8C8590": "Apple",
  A886DD: "Apple",
  "787B8A": "Apple",
  F4F5D8: "Google",
  "9CFC01": "Google",
  "3C5AB4": "Google",
  DAA119: "Google",
  "1C6A7A": "Nest Labs",
  "18B430": "Nest Labs",
  "44650D": "Amazon Technologies",
  "68370E": "Amazon Technologies",
  FCA183: "Amazon Technologies",
  "84D6D0": "Amazon Technologies",
  "4C17EB": "Sonos",
  "5CAAFD": "Sonos",
  "347E5C": "Sonos",
  B8E937: "Sonos",
  "00179A": "D-Link",
  "1CBDB9": "D-Link",
  "00195B": "D-Link",
  F0B4D2: "D-Link",
  "0026F2": "Netgear",
  A040A0: "Netgear",
  "9C3DCF": "Netgear",
  "204E7F": "Netgear",
  C03F0E: "Netgear",
  "00184D": "Netgear",
  EC086B: "TP-Link",
  "50C7BF": "TP-Link",
  A42BB0: "TP-Link",
  "3C84F6": "TP-Link",
  "1C61B4": "TP-Link",
  F81A67: "TP-Link",
  "002722": "Ubiquiti Networks",
  "44D9E7": "Ubiquiti Networks",
  "788A20": "Ubiquiti Networks",
  FCECDA: "Ubiquiti Networks",
  687251: "Ubiquiti Networks",
  "245A4C": "Ubiquiti Networks",
  "00156D": "Ubiquiti Networks",
  F09FC2: "Ubiquiti Networks",
  "18E829": "Ubiquiti Networks",
  E063DA: "Ubiquiti Networks",
  "24A43C": "Ubiquiti Networks",
  "802AA8": "Ubiquiti Networks",
  "0418D6": "Ubiquiti Networks",
  DC9FDB: "Ubiquiti Networks",
  "000142": "Cisco Systems",
  "001A2F": "Cisco Systems",
  "00259C": "Cisco / Linksys",
  "0018F8": "Cisco / Linksys",
  "001EE5": "Cisco / Linksys",
  "48F8B3": "Linksys",
  C0563C: "Linksys",
  "00E0FC": "Huawei Technologies",
  240995: "Huawei Technologies",
  "781DBA": "Huawei Technologies",
  F8E71E: "Ruckus Wireless",
  "001349": "Zyxel",
  BCF685: "Synology",
  "001132": "Synology",
  "00089B": "QNAP Systems",
  "245EBE": "QNAP Systems",
  "001B21": "Intel",
  A0C589: "Intel",
  "3C970E": "Intel",
  "8C554A": "Intel",
  "5CF9DD": "Dell",
  "18DBF2": "Dell",
  D067E5: "Dell",
  B8CA3A: "Dell",
  "3448ED": "Dell",
  "3CD92B": "Hewlett Packard",
  "9457A5": "Hewlett Packard",
  "0017A4": "Hewlett Packard",
  F4CE46: "Hewlett Packard Enterprise",
  "002590": "Super Micro Computer",
  AC1F6B: "Super Micro Computer",
  "3CD0F8": "Samsung Electronics",
  "5001BB": "Samsung Electronics",
  "8425DB": "Samsung Electronics",
  "1C232C": "Samsung Electronics",
  E8508B: "Samsung Electronics",
  "0090A9": "Western Digital",
  "0014EE": "Western Digital",
  "001E8F": "Canon",
  "002673": "Canon",
  "0000AA": "Xerox",
  "008077": "Brother Industries",
  "3C2AF4": "Brother Industries",
  "000048": "Seiko Epson",
  "0026AB": "Seiko Epson",
  "9CAED3": "Seiko Epson",
  "0017C8": "Kyocera",
  "0021B7": "Lexmark",
  "6045BD": "Microsoft",
  "0017FA": "Microsoft",
  281878: "Microsoft",
  "6C2990": "Grandstream Networks",
  "000B82": "Grandstream Networks",
  "0004F2": "Polycom",
  "64167F": "Polycom",
  446132: "Ecobee",
  "94103E": "Belkin",
  "080502": "Belkin",
  EC1A59: "Belkin (WeMo)",
  B4750E: "Belkin",
  "24F5A2": "Belkin",
  "001788": "Philips Hue",
  ECB5FA: "Philips Hue",
  "0025DC": "Sony",
  FCF152: "Sony",
  "3C0771": "Sony",
  "001DBA": "Sony",
  "001BFC": "ASUSTek Computer",
  "10C37B": "ASUSTek Computer",
  "1C872C": "ASUSTek Computer",
  "2C56DC": "ASUSTek Computer",
  "38D547": "ASUSTek Computer",
  "40167E": "ASUSTek Computer",
  "704D7B": "ASUSTek Computer",
  "9C5C8E": "ASUSTek Computer",
  AC220B: "ASUSTek Computer",
  BCEE7B: "ASUSTek Computer",
  D850E6: "ASUSTek Computer",
  F832E4: "ASUSTek Computer",
  "5CCF7F": "Espressif (ESP8266/ESP32)",
  "240AC4": "Espressif",
  "3C6105": "Espressif",
  A020A6: "Espressif",
  "807D3A": "Espressif",
  "84F3EB": "Espressif",
  "2462AB": "Espressif",
  CC50E3: "Espressif",
  "18FE34": "Espressif",
  B4E62D: "Espressif",
  "68C63A": "Espressif",
  500291: "Espressif",
  "7CDFA1": "Espressif",
  "98F4AB": "Espressif",
  D8BFC0: "Espressif",
  "34AB95": "Espressif",
  C82B96: "Espressif",
  "40F520": "Espressif",
  "3C71BF": "Espressif",
  "0C8268": "Texas Instruments",
  "2CAB33": "Texas Instruments",
  "7C70BC": "Texas Instruments",
  "0022F4": "AMPAK Technology",
  "6CADF8": "AzureWave Technology",
  546003: "Actiontec Electronics",
  "00904C": "Broadcom",
  "005043": "Marvell",
  "0021CC": "Flextronics",
};

/** Normalize a MAC address to AA:BB:CC:DD:EE:FF form, or null when invalid. */
function normalizeMac(mac) {
  if (!mac) return null;
  const hex = String(mac)
    .replace(/[^0-9a-fA-F]/g, "")
    .toUpperCase();
  if (hex.length !== 12) return null;
  return (hex.match(/.{2}/g) || []).join(":");
}

/**
 * Full IEEE snapshot, loaded from disk (loadOuiCache) or fetched fresh
 * (refreshOuiDatabase). Empty until either has run at least once, in which
 * case lookupVendor falls back to the small built-in OUI table above -
 * refreshing is opt-in and this module must keep working without it.
 */
let overlay = {};
let meta = { updatedAt: null, entries: 0, source: null };

/** Look up the vendor for a MAC address. Returns null when unknown. */
function lookupVendor(mac) {
  const normalized = normalizeMac(mac);
  if (!normalized) return null;
  const prefix = normalized.replace(/:/g, "").slice(0, 6);
  if (overlay[prefix]) return overlay[prefix];
  if (OUI[prefix]) return OUI[prefix];

  // Locally administered addresses (bit 0x02 of the first octet) are
  // randomized - common on modern phones and laptops.
  const firstOctet = parseInt(normalized.slice(0, 2), 16);
  if (Number.isFinite(firstOctet) && (firstOctet & 0x02) !== 0) {
    return "Randomized (private) MAC";
  }
  return null;
}

function getOuiStatus() {
  return {
    builtinEntries: Object.keys(OUI).length,
    downloadedEntries: meta.entries,
    updatedAt: meta.updatedAt,
    source: meta.source,
  };
}

/**
 * Load a previously downloaded snapshot from disk, if one exists. Safe to
 * call unconditionally on every startup: a missing or corrupt cache file
 * just leaves the overlay empty, so lookups fall back to the built-in table.
 */
function loadOuiCache(cacheFile) {
  try {
    const raw = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    if (raw && raw.entries && typeof raw.entries === "object") {
      overlay = raw.entries;
      meta = {
        updatedAt: raw.updatedAt || null,
        entries: Object.keys(overlay).length,
        source: raw.source || null,
      };
    }
  } catch {
    /* no cache yet, or it's unreadable - fine, the built-in table still works */
  }
}

const IEEE_OUI_CSV_URL = "https://standards-oui.ieee.org/oui/oui.csv";

/** Split one CSV line, honoring double-quoted fields (IEEE quotes every field, including ones with commas). */
function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

/**
 * Download the full IEEE MA-L assignment list and replace the in-memory
 * overlay with it, persisting a snapshot to `cacheFile` so the refresh
 * survives restarts. Entirely opt-in - nothing here ever runs unless a
 * caller (a UI button, in practice) explicitly asks for it, so offline or
 * air-gapped deployments are completely unaffected.
 */
async function refreshOuiDatabase(cacheFile) {
  const response = await fetch(IEEE_OUI_CSV_URL, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    throw new Error(`Could not reach the IEEE OUI registry (HTTP ${response.status})`);
  }
  const text = await response.text();

  const entries = {};
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    const prefix = (fields[1] || "").trim().toUpperCase();
    const org = (fields[2] || "").trim();
    if (/^[0-9A-F]{6}$/.test(prefix) && org) entries[prefix] = org;
  }

  // The real list has ~35k rows - a suspiciously short result means the
  // download was truncated or IEEE changed their format, so bail out
  // instead of silently shrinking the vendor database.
  if (Object.keys(entries).length < 1000) {
    throw new Error("Downloaded OUI list looks incomplete - keeping the previous database");
  }

  const snapshot = { updatedAt: new Date().toISOString(), source: IEEE_OUI_CSV_URL, entries };
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  const tmp = `${cacheFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snapshot));
  fs.renameSync(tmp, cacheFile);

  overlay = entries;
  meta = {
    updatedAt: snapshot.updatedAt,
    entries: Object.keys(entries).length,
    source: snapshot.source,
  };
  return getOuiStatus();
}

module.exports = {
  OUI,
  getOuiStatus,
  loadOuiCache,
  lookupVendor,
  normalizeMac,
  refreshOuiDatabase,
};
