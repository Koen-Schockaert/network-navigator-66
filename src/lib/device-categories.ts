import CameraAltIcon from "@mui/icons-material/CameraAlt";
import DesktopWindowsIcon from "@mui/icons-material/DesktopWindows";
import DevicesOtherIcon from "@mui/icons-material/DevicesOther";
import DnsIcon from "@mui/icons-material/Dns";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlined";
import LaptopIcon from "@mui/icons-material/Laptop";
import PrintIcon from "@mui/icons-material/Print";
import RouterIcon from "@mui/icons-material/Router";
import SensorsIcon from "@mui/icons-material/Sensors";
import SmartphoneIcon from "@mui/icons-material/Smartphone";
import SpeakerIcon from "@mui/icons-material/Speaker";
import TabletMacIcon from "@mui/icons-material/TabletMac";
import TvIcon from "@mui/icons-material/Tv";
import type SvgIcon from "@mui/material/SvgIcon";

/**
 * Device category taxonomy shown in the UI. Ids must match the categories
 * `core/category.cjs` can guess (plus "uncategorized", which never comes
 * from a guess - it's just what an unset `category` renders as).
 */
export type DeviceCategory = {
  value: string;
  label: string;
  icon: typeof SvgIcon;
};

export const DEVICE_CATEGORIES: DeviceCategory[] = [
  { value: "desktop", label: "Desktop", icon: DesktopWindowsIcon },
  { value: "laptop", label: "Laptop", icon: LaptopIcon },
  { value: "phone", label: "Phone", icon: SmartphoneIcon },
  { value: "tablet", label: "Tablet", icon: TabletMacIcon },
  { value: "printer", label: "Printer", icon: PrintIcon },
  { value: "router", label: "Router / network", icon: RouterIcon },
  { value: "server", label: "Server / NAS", icon: DnsIcon },
  { value: "camera", label: "Camera", icon: CameraAltIcon },
  { value: "tv", label: "TV / media", icon: TvIcon },
  { value: "speaker", label: "Speaker", icon: SpeakerIcon },
  { value: "iot", label: "IoT / smart home", icon: SensorsIcon },
  { value: "other", label: "Other", icon: DevicesOtherIcon },
];

export const UNCATEGORIZED: DeviceCategory = {
  value: "uncategorized",
  label: "Uncategorized",
  icon: HelpOutlineIcon,
};

const BY_VALUE = new Map(DEVICE_CATEGORIES.map((category) => [category.value, category]));

export function categoryMeta(value: string | null | undefined): DeviceCategory {
  if (!value) return UNCATEGORIZED;
  return BY_VALUE.get(value) ?? UNCATEGORIZED;
}
