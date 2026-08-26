/**
 * One-off backfill: fills in the parlay_legs.decided_* columns
 * (decidedAt / decidedPlayDesc / decidedQuarter / decidedClock /
 * decidedConfidence) for legs where they're still unset.
 *
 * This just calls the same detection functions the nflverse sync job
 * already runs after every score sync (see server/jobs/nflverse-sync-queue.ts)
 * — detectExactDecisionMoments() for over-win/under-loss and won player-prop
 * legs, then detectHeuristicDecisionMoments() for spread/moneyline win-or-loss
 * and under-win/over-loss legs — but across every league in one pass,
 * without touching scores/players.
 *
 * Both functions only ever act on legs with decidedAt still null, so this
 * is safe to re-run — it will never re-decide or overwrite a leg that
 * already has a value.
 *
 * Run with:
 *   npm run backfill:decision-moments
 */
import { detectExactDecisionMoments, detectHeuristicDecisionMoments } from "../server/services/decisionDetection";

async function main() {
  console.log("Running exact decision detection (won over / player-prop legs)...");
  const exact = await detectExactDecisionMoments();
  console.log("  exact:", exact);

  console.log("\nRunning heuristic decision detection (won spread / moneyline / under legs)...");
  const heuristic = await detectHeuristicDecisionMoments();
  console.log("  heuristic:", heuristic);

  const decided = exact.overDecided + exact.propDecided + heuristic.spreadMoneylineDecided + heuristic.underDecided;
  console.log(`\n✓ Backfilled decided_* fields for ${decided} leg(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });