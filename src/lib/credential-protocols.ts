import FolderIcon from "@mui/icons-material/Folder";
import KeyIcon from "@mui/icons-material/Key";
import LanguageIcon from "@mui/icons-material/Language";
import DesktopWindowsIcon from "@mui/icons-material/DesktopWindows";
import TerminalIcon from "@mui/icons-material/Terminal";
import type SvgIcon from "@mui/material/SvgIcon";

import type { CredentialProtocol } from "./netscan-types";

export type CredentialProtocolMeta = {
  value: CredentialProtocol;
  label: string;
  icon: typeof SvgIcon;
  defaultPort: number;
  urlScheme: "http" | "https" | null;
  /** Hints the form to default to SSH-key auth for this protocol; never hard-restricts the other option. */
  suggestsKeyAuth: boolean;
};

export const CREDENTIAL_PROTOCOLS: CredentialProtocolMeta[] = [
  {
    value: "http",
    label: "HTTP",
    icon: LanguageIcon,
    defaultPort: 80,
    urlScheme: "http",
    suggestsKeyAuth: false,
  },
  {
    value: "https",
    label: "HTTPS",
    icon: LanguageIcon,
    defaultPort: 443,
    urlScheme: "https",
    suggestsKeyAuth: false,
  },
  {
    value: "ssh",
    label: "SSH",
    icon: TerminalIcon,
    defaultPort: 22,
    urlScheme: null,
    suggestsKeyAuth: true,
  },
  {
    value: "telnet",
    label: "Telnet",
    icon: TerminalIcon,
    defaultPort: 23,
    urlScheme: null,
    suggestsKeyAuth: false,
  },
  {
    value: "rdp",
    label: "RDP",
    icon: DesktopWindowsIcon,
    defaultPort: 3389,
    urlScheme: null,
    suggestsKeyAuth: false,
  },
  {
    value: "vnc",
    label: "VNC",
    icon: DesktopWindowsIcon,
    defaultPort: 5900,
    urlScheme: null,
    suggestsKeyAuth: false,
  },
  {
    value: "ftp",
    label: "FTP",
    icon: FolderIcon,
    defaultPort: 21,
    urlScheme: null,
    suggestsKeyAuth: false,
  },
  {
    value: "other",
    label: "Other",
    icon: KeyIcon,
    defaultPort: 0,
    urlScheme: null,
    suggestsKeyAuth: false,
  },
];

const OTHER = CREDENTIAL_PROTOCOLS[CREDENTIAL_PROTOCOLS.length - 1] as CredentialProtocolMeta;
// Keyed by plain string, not CredentialProtocol - protocol is unvalidated
// free text (like devices.label), so lookups must accept any string.
const BY_VALUE = new Map<string, CredentialProtocolMeta>(
  CREDENTIAL_PROTOCOLS.map((protocol) => [protocol.value, protocol]),
);

export function protocolMeta(value: string | null | undefined): CredentialProtocolMeta {
  if (!value) return OTHER;
  return BY_VALUE.get(value) ?? OTHER;
}

export function buildCredentialUrl(
  protocol: CredentialProtocol,
  host: string | null | undefined,
  port: number | null | undefined,
): string | null {
  const meta = protocolMeta(protocol);
  if (!meta.urlScheme || !host) return null;
  const suffix = port && port !== meta.defaultPort ? `:${port}` : "";
  return `${meta.urlScheme}://${host}${suffix}`;
}
