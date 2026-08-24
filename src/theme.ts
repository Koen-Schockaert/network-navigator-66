import { createTheme, alpha } from "@mui/material/styles";

/**
 * Central MUI theme: a dark, high-contrast "command center" look.
 * Every colour used by the app is defined here - components must read from
 * the theme rather than hardcoding values.
 */

const MONO = '"JetBrains Mono", "SFMono-Regular", "Menlo", "Consolas", monospace';

const surface = {
  base: "#0b1017",
  panel: "#121a24",
  raised: "#182333",
  line: "#22303f",
};

export const statusColors = {
  online: "#3ddc97",
  offline: "#5b6b7c",
  alert: "#ffb020",
  danger: "#ff5c5c",
  info: "#4aa8ff",
};

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "dark",
    background: { default: surface.base, paper: surface.panel },
    primary: { main: "#4aa8ff", contrastText: "#04121f" },
    secondary: { main: "#3ddc97", contrastText: "#04150e" },
    success: { main: statusColors.online },
    warning: { main: statusColors.alert },
    error: { main: statusColors.danger },
    info: { main: statusColors.info },
    divider: surface.line,
    text: { primary: "#e6edf5", secondary: "#8fa3b8" },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily:
      '"Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
    h4: { fontWeight: 700, letterSpacing: "-0.02em" },
    h5: { fontWeight: 700, letterSpacing: "-0.01em" },
    h6: { fontWeight: 600, letterSpacing: "-0.01em" },
    subtitle2: { fontWeight: 600, letterSpacing: "0.02em" },
    overline: { letterSpacing: "0.14em", fontWeight: 700, fontSize: 10 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: `radial-gradient(1200px 600px at 15% -10%, ${alpha(
            "#4aa8ff",
            0.09,
          )}, transparent 60%)`,
          backgroundAttachment: "fixed",
        },
        "::selection": { background: alpha("#4aa8ff", 0.35) },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: `1px solid ${surface.line}`,
        },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundColor: surface.panel, borderRadius: 12 },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 8 } },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 6 },
        sizeSmall: { fontSize: 11 },
      },
    },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiSelect: { defaultProps: { size: "small" } },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: surface.raised, fontSize: 12 },
      },
    },
    MuiLinearProgress: {
      styleOverrides: { root: { height: 6, borderRadius: 999 } },
    },
    MuiTableCell: {
      styleOverrides: { root: { borderColor: surface.line } },
    },
  },
});

export const mono = MONO;
export const surfaces = surface;
