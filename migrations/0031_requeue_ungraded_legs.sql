-- Game bets used to be marked "enriched" the first time the grader saw them,
-- even when their game hadn't been played, so they were never graded
-- automatically afterwards. Put every such pick back in the grading queue.
UPDATE parlay_legs AS l
SET odds_enriched = false
FROM parlays AS p
WHERE p.id = l.parlay_id
  AND l.result IS NULL
  AND l.odds_enriched = true
  AND l.bet_type <> 'player_prop'
  AND l.game_id IS NOT NULL
  AND p.status <> 'void';
