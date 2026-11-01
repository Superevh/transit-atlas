# System JSON

One object with four keys. `assets/starter.system.json` is a copy to start from. `scripts/check.mjs` enforces everything here.

## meta

| Key | Required | Limit | Meaning |
|---|---|---|---|
| `lang` | yes | `en` or `zh` | Picks the interface strings. All text in the file must be in this language. |
| `title` | yes | 60 characters, 28 Chinese | Shown on the title plate and the browser tab. |
| `subtitle` | no | 110, or 50 Chinese | One line on what the map covers. |
| `fictional` | yes | true or false | When true, the plate carries a fictional-example label. |
| `keepLatin` | no | list | Chinese maps only: names that must stay in Latin letters, such as a product name. Keep it short. |

## lines

A line is one unbroken route through the system, such as "the path of a paid order".

| Key | Required | Limit | Meaning |
|---|---|---|---|
| `no` | yes | 1 to 8, unique | The number on the roundel. It also fixes the colour. |
| `name` | yes | 24, or 10 Chinese | Shown in the legend and beside the first roundel. |
| `role` | no | any short sentence | What the line carries. Shown under Lines in the handoff panel and printed by `handoff.mjs`. |

## nodes (stations)

At most 60, but `check.mjs` also fails any map whose labels would open below 11 px at Fit on a 1280x800 screen. Long chains fold automatically into bands; a map that still fails must be split.

| Key | Required | Limit | Meaning |
|---|---|---|---|
| `id` | yes | lower-case letters, digits, hyphens | Never shown. |
| `label` | yes | 34, or 16 Chinese | Station name on the map. |
| `type` | yes | see below | Fixes the station's shape and its filter. |
| `status` | no | `fact`, `inferred`, `unknown` | Defaults to `fact`. |
| `basis` | when not a fact | 200, or 90 Chinese | `inferred`: why you think so. `unknown`: the open question. |
| `note` | no | 240, or 110 Chinese | What the brief itself says about this station. Leave it out when the brief says nothing more; never put your own description here. |
| `owner` | no | short | Team or person, only if supplied. |

Types and shapes: `actor` person or team, ring with a dot. `process` step or service, open dot. `store` data store, solid dot. `queue` queue or event, capsule. `decision` decision, diamond. `document` document, square. `external` outside system, dashed ring.

Physical places take the type of what they do: somewhere things wait to be picked up is a `queue`, somewhere things are kept is a `store`, somewhere people do a step is a `process`.

Open questions: everything with `status: "unknown"` and the same `basis` text counts as one question. Give a station and the tracks that exist only because of it the identical `basis`.

## edges

At most 120.

| Key | Required | Limit | Meaning |
|---|---|---|---|
| `from`, `to` | yes | node ids | Direction matters; the map draws a small arrow. |
| `type` | yes | `flow`, `sends`, `reads`, `writes`, `triggers`, `depends`, `returns` | Sets the verb in the dossier. Use `sends` for anything delivered to a person or system, such as a message or reminder, and `returns` only when something truly goes back. |
| `line` | no | a declared line number | With it, the edge is track on that line. Without it, a thin direct link. |
| `label` | no | 40, or 18 Chinese | Shown in the dossier. |
| `status`, `basis` | as for nodes | | |

## Rules for lines

- The edges of one line must chain head to tail with no branch. A loop back to its first station is allowed, which suits a lifecycle.
- A branch is its own line, sharing the station where it splits. Shared stations become interchanges automatically.
- Two lines may run between the same two stations; they are drawn side by side.
- An edge that is not part of a journey (a read, a dependency) is usually better as a direct link.
- A node with no edges is allowed only when its status is `unknown`.

## What you never set

Position, colour, shape, size, label side and route. They are computed from this data, and JSON order has no effect.
