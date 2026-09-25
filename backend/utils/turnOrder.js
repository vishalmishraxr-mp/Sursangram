/**
 * Builds an alternating turn order from the two teams, in each team's
 * join order (host can reassign turn order manually in a future phase).
 * e.g. A: [Vishal, Aman, Rohit], B: [Rahul, Kunal]
 *   -> Vishal(A), Rahul(B), Aman(A), Kunal(B), Rohit(A)
 */
export function buildTurnOrder(players) {
  const teamA = players.filter((p) => p.teamId === "A");
  const teamB = players.filter((p) => p.teamId === "B");
  const order = [];
  const max = Math.max(teamA.length, teamB.length);
  for (let i = 0; i < max; i++) {
    if (teamA[i]) order.push({ playerId: teamA[i].playerId, teamId: "A" });
    if (teamB[i]) order.push({ playerId: teamB[i].playerId, teamId: "B" });
  }
  return order;
}
