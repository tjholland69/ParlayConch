import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useAuth } from "@/hooks/use-auth";
import { useAppResume } from "@/hooks/use-app-resume";
import {
  useSentParlays,
  useMarkParlayPlaced,
  useRevertParlayToApproved,
} from "@/hooks/use-parlay-transitions";

const SNOOZE_MS = 5 * 60 * 1000;

/**
 * Prompts "Did you place this bet?" for any parlay stuck in `sent` status
 * once the app returns to the foreground. We can't get a callback from the
 * sportsbook app confirming a bet was placed, so this is the honest
 * self-report step that closes the approved -> sent -> placed loop.
 */
export function SentParlayResumeGuard() {
  const { isAuthenticated } = useAuth();
  const { data: sentParlays, refetch } = useSentParlays(isAuthenticated);
  const markPlaced = useMarkParlayPlaced();
  const revertToApproved = useRevertParlayToApproved();
  const snoozedUntil = useRef<Record<number, number>>({});
  const promptOpen = useRef(false);

  useAppResume(() => {
    if (isAuthenticated) refetch();
  });

  useEffect(() => {
    if (!sentParlays || sentParlays.length === 0 || promptOpen.current) return;

    const now = Date.now();
    const next = sentParlays.find((p) => (snoozedUntil.current[p.id] ?? 0) <= now);
    if (!next) return;

    const gameLabel =
      next.legs?.length === 1
        ? `${next.legs[0].game?.awayTeam ?? ""} @ ${next.legs[0].game?.homeTeam ?? ""}`.trim()
        : `${next.legs?.length ?? 0}-leg parlay`;

    promptOpen.current = true;
    Alert.alert(
      "Did you place this bet?",
      `You sent your approved parlay (${gameLabel || "week's picks"}) to your sportsbook. Did it go through?`,
      [
        {
          text: "Not now",
          style: "cancel",
          onPress: () => {
            snoozedUntil.current[next.id] = Date.now() + SNOOZE_MS;
            promptOpen.current = false;
          },
        },
        {
          text: "No",
          onPress: () => {
            revertToApproved.mutate(next.id);
            promptOpen.current = false;
          },
        },
        {
          text: "Yes",
          onPress: () => {
            markPlaced.mutate(next.id);
            promptOpen.current = false;
          },
        },
      ],
    );
  }, [sentParlays]);

  return null;
}
