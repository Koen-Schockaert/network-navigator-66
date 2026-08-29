import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/netscan/AppShell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NetScan — Local Network Device Inventory" },
      {
        name: "description",
        content:
          "Scan your LAN, track every device by IP, MAC, vendor and open ports, and compare scans over time.",
      },
      { property: "og:title", content: "NetScan — Local Network Device Inventory" },
      {
        property: "og:description",
        content:
          "Desktop and container network scanner: discover devices, monitor uptime and review change history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <AppShell />;
}
