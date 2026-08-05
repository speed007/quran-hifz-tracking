export interface Theme {
  dark: boolean;
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  onPrimary: string;
  gold: string;
  danger: string;
  success: string;
  barBg: string;
  barFill: string;
  shadow: string;
}

export const darkTheme: Theme = {
  dark: true,
  background: "#0C1411",
  surface: "#13201A",
  surfaceAlt: "#1A2B23",
  border: "#24382E",
  text: "#EAF4EE",
  muted: "#8FA89A",
  primary: "#34C48B",
  onPrimary: "#06301F",
  gold: "#E9C46A",
  danger: "#F06A6A",
  success: "#34C48B",
  barBg: "#1E3128",
  barFill: "#34C48B",
  shadow: "#000000",
};

export const lightTheme: Theme = {
  dark: false,
  background: "#F3F7F4",
  surface: "#FFFFFF",
  surfaceAlt: "#EDF3EF",
  border: "#DDE7E0",
  text: "#14201A",
  muted: "#5E7368",
  primary: "#12805C",
  onPrimary: "#FFFFFF",
  gold: "#B8860B",
  danger: "#D64545",
  success: "#12805C",
  barBg: "#E2ECE5",
  barFill: "#12805C",
  shadow: "#000000",
};
