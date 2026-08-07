import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewProps,
  ViewStyle,
  StyleProp,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkTheme, lightTheme, Theme } from "./theme";

const ThemeContext = createContext<{
  theme: Theme;
  isDark: boolean;
  toggle: () => void;
}>({ theme: darkTheme, isDark: true, toggle: () => {} });

const THEME_KEY = "hifz-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((v) => {
      if (v) setIsDark(v !== "light");
    });
  }, []);
  function toggle() {
    setIsDark((prev) => {
      AsyncStorage.setItem(THEME_KEY, prev ? "light" : "dark");
      return !prev;
    });
  }
  return (
    <ThemeContext.Provider value={{ theme: isDark ? darkTheme : lightTheme, isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function Screen({
  children,
  contentStyle,
  ...rest
}: ViewProps & {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.screenContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return <Text style={[styles.title, { color: theme.text }]}>{children}</Text>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <Text style={[styles.sectionTitle, { color: theme.text }]}>{children}</Text>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewProps["style"] }) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Muted({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return <Text style={[styles.muted, { color: theme.muted }]}>{children}</Text>;
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  if (!children) return null;
  return <Text style={[styles.error, { color: theme.danger }]}>{children}</Text>;
}

export function SuccessText({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  if (!children) return null;
  return <Text style={[styles.success, { color: theme.success }]}>{children}</Text>;
}

export function Field({
  label,
  children,
  hint,
  style,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.field, style]}>
      <Text style={[styles.fieldLabel, { color: theme.muted }]}>{label}</Text>
      {children}
      {hint ? <Muted>{hint}</Muted> : null}
    </View>
  );
}

export function StyledTextInput(props: TextInputProps) {
  const { theme } = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.muted}
      style={[
        styles.input,
        { color: theme.text, backgroundColor: theme.surfaceAlt, borderColor: theme.border },
      ]}
      {...props}
    />
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: ViewProps["style"];
}) {
  const { theme } = useTheme();
  const colors: Record<string, { bg: string; fg: string }> = {
    primary: { bg: theme.primary, fg: theme.onPrimary },
    secondary: { bg: theme.surfaceAlt, fg: theme.text },
    danger: { bg: theme.surfaceAlt, fg: theme.danger },
  };
  const c = colors[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        { backgroundColor: c.bg },
        (disabled || loading) && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.fg} size="small" />
      ) : (
        <Text style={[styles.buttonText, { color: c.fg }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

export function LinkButton({
  title,
  onPress,
  danger,
  style,
}: {
  title: string;
  onPress?: () => void;
  danger?: boolean;
  style?: ViewProps["style"];
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} style={[styles.linkButton, style]}>
      <Text style={{ color: danger ? theme.danger : theme.primary, fontSize: 14, fontWeight: "600" }}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewProps["style"] }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { theme } = useTheme();
  return (
    <Row style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[
              styles.segment,
              {
                backgroundColor: active ? theme.primary : "transparent",
                borderColor: theme.border,
              },
            ]}
          >
            <Text
              style={{
                color: active ? theme.onPrimary : theme.muted,
                fontWeight: active ? "700" : "500",
              }}
            >
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </Row>
  );
}

export interface PickerOption {
  label: string;
  value: string | number;
}

export function PickerModal({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selected: string | number | null;
  onSelect: (value: string | number) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
          <ScrollView style={styles.modalList}>
            {options.map((o) => {
              const active = String(o.value) === String(selected);
              return (
                <TouchableOpacity
                  key={String(o.value)}
                  onPress={() => onSelect(o.value)}
                  style={[
                    styles.modalOption,
                    { borderColor: theme.border },
                    active && { backgroundColor: theme.surfaceAlt },
                  ]}
                >
                  <Text
                    style={{
                      color: active ? theme.primary : theme.text,
                      fontWeight: active ? "700" : "400",
                    }}
                  >
                    {o.label}
                  </Text>
                  {active ? <Text style={{ color: theme.primary }}>●</Text> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity onPress={onClose} style={styles.modalCancel}>
            <Text style={{ color: theme.muted }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export function ProgressBar({ percent, style }: { percent: number; style?: ViewProps["style"] }) {
  const { theme } = useTheme();
  const p = Math.max(0, Math.min(100, percent));
  return (
    <View style={[styles.bar, { backgroundColor: theme.barBg }, style]}>
      <View style={[styles.barFill, { backgroundColor: theme.barFill, width: `${p}%` }]} />
    </View>
  );
}

export function StarsInline({ rating, size = 14 }: { rating: number; size?: number }) {
  const { theme } = useTheme();
  return (
    <Text style={{ color: theme.gold, fontSize: size }}>
      {"★".repeat(Math.max(0, Math.min(5, Math.round(rating))))}
    </Text>
  );
}

export function Loading() {
  const { theme } = useTheme();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={theme.primary} />
      <Text style={{ color: theme.muted, marginTop: 8 }}>Loading…</Text>
    </View>
  );
}

export function Prompt({
  visible,
  title,
  message,
  placeholder,
  secureTextEntry,
  confirmLabel = "OK",
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  secureTextEntry?: boolean;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const { theme } = useTheme();
  const [value, setValue] = useState("");
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
          {message ? <Muted>{message}</Muted> : null}
          <StyledTextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            secureTextEntry={secureTextEntry}
            autoCapitalize="none"
            autoFocus
          />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <TouchableOpacity
              onPress={onCancel}
              style={[styles.button, { backgroundColor: theme.surfaceAlt, flex: 1 }]}
            >
              <Text style={{ color: theme.text, fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                onConfirm(value);
                setValue("");
              }}
              style={[styles.button, { backgroundColor: theme.primary, flex: 1 }]}
            >
              <Text style={{ color: theme.onPrimary, fontWeight: "700" }}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <Card style={styles.emptyState}>
      <Muted>{children}</Muted>
    </Card>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 8,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  muted: {
    fontSize: 13,
  },
  error: {
    fontSize: 14,
    fontWeight: "600",
  },
  success: {
    fontSize: 14,
    fontWeight: "600",
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  linkButton: {
    paddingVertical: 6,
    paddingRight: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  segmented: {
    gap: 4,
  },
  segment: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    alignItems: "center",
  },
  bar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
  },
  loading: {
    paddingVertical: 48,
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    borderRadius: 14,
    padding: 16,
    maxHeight: "70%",
  },
  modalList: {
    marginTop: 8,
  },
  modalOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalCancel: {
    paddingVertical: 12,
    alignItems: "center",
  },
});
