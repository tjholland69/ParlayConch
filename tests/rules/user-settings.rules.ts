import type { UserSettings } from "../../shared/schema";
import { mergeUserSettings } from "../../shared/statsAggregation";

export type UserSettingsMergeRule = {
  id: string;
  description: string;
  current: UserSettings | null;
  patch: UserSettings;
  expected: UserSettings;
};

export const USER_SETTINGS_MERGE_RULES: UserSettingsMergeRule[] = [
  {
    id: "merge.null-current",
    description: "First settings write on null current",
    current: null,
    patch: { displayName: "Alice", theme: "dark" },
    expected: { displayName: "Alice", theme: "dark" },
  },
  {
    id: "merge.preserve-existing-keys",
    description: "Shallow patch preserves unmentioned keys",
    current: { displayName: "Alice", theme: "dark", region: "US" },
    patch: { primaryColor: "#ff0000" },
    expected: { displayName: "Alice", theme: "dark", region: "US", primaryColor: "#ff0000" },
  },
  {
    id: "merge.deep-notificationPreferences",
    description: "Nested notificationPreferences merge without dropping sms/push",
    current: {
      displayName: "Bob",
      notificationPreferences: { email: true, sms: true, push: false },
    },
    patch: { notificationPreferences: { email: false } },
    expected: {
      displayName: "Bob",
      notificationPreferences: { email: false, sms: true, push: false },
    },
  },
  {
    id: "merge.overwrite-displayName",
    description: "Explicit patch overwrites prior displayName",
    current: { displayName: "Old", theme: "light" },
    patch: { displayName: "New" },
    expected: { displayName: "New", theme: "light" },
  },
  {
    id: "merge.replace-notificationPreferences-object",
    description: "Full notificationPreferences replacement adds new keys",
    current: {
      notificationPreferences: { email: true, sms: false, push: true },
    },
    patch: {
      notificationPreferences: { email: false, sms: true, push: true, phone: "+15551212" },
    },
    expected: {
      notificationPreferences: { email: false, sms: true, push: true, phone: "+15551212" },
    },
  },
];

export function applyUserSettingsMergeRule(rule: UserSettingsMergeRule): UserSettings {
  return mergeUserSettings(rule.current, rule.patch);
}
