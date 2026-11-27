# Fantasy VCT

A private fantasy league where friends draft VCT pros each stage and score points from their real match stats.

## People

**Commissioner**:
The one user who runs the league: adds members, tournaments and fixes data.
_Avoid_: Admin, owner

**Manager**:
A user who has joined a tournament and drafts a roster in each of its stages.
_Avoid_: Drafter, player, team owner

## Drafting

**Stage**:
One part of a tournament as listed on VLR, with its own pool, draft and points.
_Avoid_: Round, phase, split

**Draft**:
The live snake draft that fills every manager's roster for one stage.
_Avoid_: Using "draft" to mean the stage or the tournament

**Pickable**:
A player or coach that can be drafted; in the UI, a "pro".
_Avoid_: Draftee, asset

**Player**:
A pickable who plays maps and scores from their own stats.
_Avoid_: Using "player" for a manager

**Coach**:
A team's head coach, a pickable who scores from their team's results.

**Pool**:
The pickables available to draft in one stage.

**Roster**:
A manager's 5 players and 1 coach in one stage.
_Avoid_: Team, lineup

**Owner**:
The manager whose roster holds a pickable in a given stage.

**Carry-over**:
The picks a manager keeps from the previous stage when the next stage's draft starts.

**Eliminated**:
A pickable whose team didn't make the next stage's pool; known only once every match of the stage is played.
_Avoid_: Using "eliminated" for a team that merely has no upcoming match listed

**Sub**:
A player outside the pool who fills in for a pool player on a map; their stats for that map count for the player they replaced.
_Avoid_: Stand-in, substitute pickable

## Scoring

**Match stats**:
The per-map numbers scraped from VLR during the tournament.
_Avoid_: Stats (when form stats could be meant)

**Form stats**:
A player's rating, ACS and K/D over the 90 days before import, shown only in the draft pool.
_Avoid_: Stats (when match stats could be meant)

**Bonus**:
Points not earned from a stat: the sweep bonus and the forfeit bonus.

**Scope**:
What a ranking covers: the whole tournament (Total) or one stage.

**Standings**:
The ranking of managers by their rosters' points.
_Avoid_: Leaderboard

**Leaderboard**:
The ranking of pickables by points, with the match stats behind them.
_Avoid_: Standings, stats page
