import React, { useState } from "react";
import { Platform, StyleProp, Text, TouchableOpacity, View, ViewStyle } from "react-native";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { fmtTime } from "./format";
import { Field, PickerModal, PickerOption, useTheme } from "./ui";

function toDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function FieldShell({
  label,
  value,
  placeholder,
  onPress,
  style,
}: {
  label: string;
  value: string;
  placeholder: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  return (
    <Field label={label} style={style}>
      <TouchableOpacity
        onPress={onPress}
        style={{
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.surfaceAlt,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <Text style={{ color: value ? theme.text : theme.muted, fontSize: 16 }}>
          {value || placeholder}
        </Text>
      </TouchableOpacity>
    </Field>
  );
}

export function DateField({
  label,
  value,
  placeholder = "Choose a date",
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (dateStr: string) => void;
}) {
  const [show, setShow] = useState(false);
  const [temp, setTemp] = useState<Date | null>(null);

  if (show && Platform.OS === "android") {
    return (
      <DateTimePicker
        value={temp ?? (value ? toDate(value) : new Date())}
        mode="date"
        onChange={(event: DateTimePickerEvent, date?: Date) => {
          setShow(false);
          if (event.type === "set" && date) {
            onChange(toDateStr(date));
          }
        }}
      />
    );
  }

  return (
    <>
      <FieldShell label={label} value={value} placeholder={placeholder} onPress={() => setShow(true)} />
      {show && Platform.OS === "ios" && (
        <View>
          <DateTimePicker
            value={temp ?? (value ? toDate(value) : new Date())}
            mode="date"
            display="spinner"
            onChange={(_: DateTimePickerEvent, date?: Date) => setTemp(date ?? null)}
          />
          <TouchableOpacity
            onPress={() => {
              onChange(toDateStr(temp ?? new Date()));
              setShow(false);
              setTemp(null);
            }}
          >
            <Text style={{ color: "#34C48B", fontWeight: "700", paddingVertical: 6 }}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

export function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (time: string) => void;
}) {
  const [show, setShow] = useState(false);
  const [temp, setTemp] = useState<Date | null>(null);

  const current = (): Date => {
    const [h, m] = value.split(":").map(Number);
    const d = new Date();
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  };

  if (show && Platform.OS === "android") {
    return (
      <DateTimePicker
        value={temp ?? current()}
        mode="time"
        is24Hour
        onChange={(event: DateTimePickerEvent, date?: Date) => {
          setShow(false);
          if (event.type === "set" && date) {
            onChange(
              `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
            );
          }
        }}
      />
    );
  }

  return (
    <>
      <FieldShell label={label} value={value ? fmtTime(value) : ""} placeholder="Choose time" onPress={() => setShow(true)} />
      {show && Platform.OS === "ios" && (
        <View>
          <DateTimePicker
            value={temp ?? current()}
            mode="time"
            is24Hour
            display="spinner"
            onChange={(_: DateTimePickerEvent, date?: Date) => setTemp(date ?? null)}
          />
          <TouchableOpacity
            onPress={() => {
              const d = temp ?? current();
              onChange(
                `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
              );
              setShow(false);
              setTemp(null);
            }}
          >
            <Text style={{ color: "#34C48B", fontWeight: "700", paddingVertical: 6 }}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

export function PickerField({
  label,
  value,
  options,
  placeholder = "Choose…",
  onChange,
  style,
}: {
  label: string;
  value: string | number | null;
  options: PickerOption[];
  placeholder?: string;
  onChange: (value: string | number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  const { theme } = useTheme();
  const selectedLabel = options.find((o) => String(o.value) === String(value))?.label;
  return (
    <>
      <FieldShell
        label={label}
        value={selectedLabel ?? ""}
        placeholder={placeholder}
        onPress={() => setOpen(true)}
        style={style}
      />
      <PickerModal
        visible={open}
        title={label}
        options={options}
        selected={value}
        onSelect={(v) => {
          onChange(v);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
