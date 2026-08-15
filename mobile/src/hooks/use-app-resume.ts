import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

/** Fires `onResume` whenever the app transitions from background/inactive to active. */
export function useAppResume(onResume: () => void) {
  const appState = useRef(AppState.currentState);
  const onResumeRef = useRef(onResume);
  onResumeRef.current = onResume;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        onResumeRef.current();
      }
      appState.current = next;
    });
    return () => subscription.remove();
  }, []);
}
