import CloseIcon from "@mui/icons-material/Close";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useRef, useState } from "react";
import { netscan } from "@/lib/netscan-api";
import type { DeviceRow } from "@/lib/netscan-types";
import { mono } from "@/theme";
import { StatusChip } from "./shared";

type PingLine = {
  sequence: number;
  rttMs: number | null;
  timestamp: string;
};

type Props = {
  open: boolean;
  device: DeviceRow | null;
  onClose: () => void;
};

export function PingDialog({ open, device, onClose }: Props) {
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<PingLine[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  // Reset the log whenever the dialog is (re)opened for a device.
  useEffect(() => {
    if (!open) return;
    setLines([]);
    setRunning(false);
    sessionIdRef.current = null;
  }, [open, device?.id]);

  useEffect(() => {
    return netscan.subscribe((event) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId || event.sessionId !== sessionId) return;
      if (event.type === "ping:result") {
        setLines((prev) => [
          ...prev,
          {
            sequence: event.sequence ?? prev.length + 1,
            rttMs: event.rttMs ?? null,
            timestamp: event.timestamp ?? new Date().toISOString(),
          },
        ]);
      } else if (event.type === "ping:stopped") {
        setRunning(false);
      }
    });
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  // Stop a running session whenever the dialog is closed by any means — the
  // Close/Stop buttons, Escape, a backdrop click, or the parent closing it
  // directly — so a ping loop never keeps running in the background.
  useEffect(() => {
    if (open) return;
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    sessionIdRef.current = null;
    setRunning(false);
    netscan.stopPing(sessionId).catch(() => {});
  }, [open]);

  // Same cleanup if the component unmounts entirely while a session is live.
  useEffect(() => {
    return () => {
      if (sessionIdRef.current) netscan.stopPing(sessionIdRef.current).catch(() => {});
    };
  }, []);

  const start = async () => {
    if (!device || running) return;
    setLines([]);
    setRunning(true);
    const { sessionId } = await netscan.startPing(device.ip);
    sessionIdRef.current = sessionId;
  };

  const stop = async () => {
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    setRunning(false);
    if (sessionId) await netscan.stopPing(sessionId).catch(() => {});
  };

  const handleClose = async () => {
    await stop();
    onClose();
  };

  const stats = useMemo(() => {
    const received = lines.filter((line) => line.rttMs !== null);
    const rtts = received.map((line) => line.rttMs as number);
    return {
      sent: lines.length,
      received: received.length,
      lossPct: lines.length
        ? Math.round(((lines.length - received.length) / lines.length) * 100)
        : 0,
      min: rtts.length ? Math.min(...rtts) : null,
      max: rtts.length ? Math.max(...rtts) : null,
      avg: rtts.length
        ? Math.round((rtts.reduce((a, b) => a + b, 0) / rtts.length) * 10) / 10
        : null,
    };
  }, [lines]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Typography variant="h6" component="span">
            Ping
          </Typography>
          <Box sx={{ fontFamily: mono }}>{device?.ip}</Box>
          {device ? <StatusChip online={device.online} /> : null}
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <Chip size="small" label={`Sent ${stats.sent}`} />
            <Chip size="small" label={`Received ${stats.received}`} />
            <Chip size="small" label={`Loss ${stats.lossPct}%`} />
            <Chip
              size="small"
              label={`Min/Avg/Max ${stats.min ?? "—"}/${stats.avg ?? "—"}/${stats.max ?? "—"} ms`}
            />
          </Stack>
          <Box
            ref={logRef}
            sx={{
              height: 280,
              overflowY: "auto",
              bgcolor: "background.default",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              p: 1.25,
              fontFamily: mono,
              fontSize: 13,
            }}
          >
            {lines.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {running
                  ? "Waiting for the first reply…"
                  : "Press Start to begin pinging this device."}
              </Typography>
            ) : (
              lines.map((line) => (
                <Box key={line.sequence}>
                  {line.rttMs === null
                    ? `seq=${line.sequence} request timed out`
                    : `seq=${line.sequence} time=${line.rttMs} ms`}
                </Box>
              ))
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        {running ? (
          <Button startIcon={<StopIcon />} color="warning" onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button startIcon={<PlayArrowIcon />} onClick={start} disabled={!device}>
            Start
          </Button>
        )}
        <Button startIcon={<CloseIcon />} onClick={handleClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
