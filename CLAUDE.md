# Icarus: rules for every agent, on either Mac

Two Macs and several agents work on this repo at once. They cannot see each other.
GitHub (`THEMANINHOLLYWOOD/icarus`) is the only place they meet, so look there first.

## Before you change anything

1. `git fetch --prune origin`
2. `git status -sb`, then `git log --oneline HEAD..@{u}`. If GitHub has commits you
   do not, bring them in (`git pull --rebase`) before you edit.
3. `git branch -r --no-merged origin/review/whole-game` lists work that is not in
   the game yet. If a branch there touches what you are about to touch, tell the
   user before you start.

## Where work goes

- `review/whole-game` is the game: what is live is built from it. `main` is brought
  up to it only when the user says (last done 2026-11-28), by fast-forward, never
  by committing on `main` itself.
- New work goes on a branch of your own, cut from the latest
  `origin/review/whole-game`, named `<this Mac's short name>/<topic>`
  (`hostname -s` gives the name). Push that branch; do not push anyone else's.
- The session that deploys may put small, tested fixes straight onto
  `review/whole-game`.
- Almost the whole game is one file, `index.html`. Two branches that both edit it
  will collide, so keep a change to one section, say which, and rebase on the
  latest before you push.

## Before you commit or push

- Fetch again. If GitHub moved while you worked, rebase and test again.
- Commit as `Andres <198836260+THEMANINHOLLYWOOD@users.noreply.github.com>`.
- Never force-push `review/whole-game`, `main` or `crossover`.

## Merging

- Into `review/whole-game` or `main`: only when the user says to, and only after
  you have shown them what is coming in (`git log --oneline`, `git diff --stat`)
  and that it merges without conflicts (`git merge-tree --write-tree`).
- A push does not deploy. One Mac deploys, from a built copy (`tools/build.mjs`,
  see the README); do not deploy from a second machine.

## Never commit

`.env*`, keys of any kind, or the stray `index 2.html` / `index 3.html`.
