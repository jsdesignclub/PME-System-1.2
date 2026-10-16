# Phase 2 — Mail & Minutes Backend (Module 1): Detailed Plan

**Parent plan:** `EXECUTION_PLAN.md` (Phase 2 of 9) · **Predecessor:** `PHASE_1_PLAN.md`
**Status:** ✅ Implemented — 347 backend tests passing, frontend built, demo data seeded
**Demo:** `npm run dev`, then `npm run db:demo` immediately before any presentation (see "Demo hygiene")
**Date:** 2026-09-29 (written)

---

## 1. Objective

Produce a state where **the six-state mail workflow is enforced by the server and not by the operator's memory**, and where **a letter is routed to the right officer by an explainable algorithm rather than a hunch**:

- `mail_records`, `official_minutes` and `officer_duties` exist per spec §5.2, with three documented departures
- A letter can traverse all six states of spec §6 through the API, each transition performed by a correctly-privileged role
- An illegal state jump is rejected by the server, not merely discouraged by the UI
- `utils/dayStampGenerator.js` issues collision-safe `DS/YYYY/MM/NNNN` numbers under concurrent inserts
- `utils/dutyMatcher.js` returns a **ranked, explainable** officer list with scores and matched keywords
- Attachments are reachable only through an authorization-checked route — never a public static path
- Every mutation writes an `audit_logs` row in the same transaction, as Phase 1 established

Phase 2 is the first phase that produces *product*. Phases 1–2 together are the first shippable backend; Phase 3 puts a UI on this and nothing else. The reason this phase is tested against a live database rather than mocked is that the hard parts — the day-stamp counter under concurrency, the state machine's transition table, and the matcher's word-boundary scoring — are all defects that a mock would happily hide.

## 2. Scope

**In scope:** migrations `005`–`007`; the day-stamp generator; `mailModel` / `minutesModel` / `dutyModel`; the workflow state machine; the duty matcher; mail, minutes, assignment, notes, attachment, stats and duty-chart endpoints; multipart upload via `multer` (installed and unused since Phase 0); demo seeds spanning all six states; the integration test suite; README updates.

**Out of scope — explicitly NOT built in Phase 2:**

| Deferred to | What | Why |
| :-- | :-- | :-- |
| Phase 3 | **The entire mail UI.** No `LoginPage`, no `MailRegistryPage`, no `DutyMatcherBox`, no print slip | Parent plan assigns every one of those to Phase 3 (tasks 3.1–3.23). Phase 2 touches no file under `frontend/src/` |
| Phase 3 | Minute-slip print template, Sinhala/Tamil fonts, `@media print` CSS | Task 3.19. Phase 2 returns the data it needs; it does not format it |
| Phase 4 | Upload hardening: mimetype/extension allowlist, path-traversal rejection, 10 MB cap | Parent plan task 4.9. Phase 2 writes files to a path derived from a server-generated day stamp — never from a client-supplied name — which removes the traversal vector at the source, and states the limits it does enforce |
| Phase 4 | Global validation middleware, rate limiting, `helmet` | Tasks 4.1, 4.3, 4.5. Phase 2 validates its own endpoints through the Phase 1 `utils/validate.js` module (D41) and adds nothing new |
| Phase 4 | `GET /audit/export` CSV, `audit_logs` immutability triggers, full audit-coverage review | Tasks 4.6, 4.7. Phase 2 writes audit rows for mail mutations; D42's trigger question is unchanged |
| Phase 6–8 | Vehicle allocation, transfers, assets | Later modules. **No table, route or seed for any of them** |

**A Phase 2 build containing a React page, a login form, or a `vehicles` table has failed Phase 2**, for the same reason a Phase 1 build containing a login form failed Phase 1.

## 3. Prerequisites

| Prerequisite | Required | Status as of 2026-09-29 | Action if missing |
| :-- | :-- | :-- | :-- |
| `MySQL80` service | Running | ✅ Running | `Start-Service MySQL80` — needs an elevated prompt |
| Phase 1 migrations | `001`–`004` applied | ✅ 4 applied, 0 pending (Phase 1 §9 check 1) | `npm run db:migrate` |
| Phase 1 seeds | 7 departments, 8 personas | ✅ Verified (Phase 1 §9 checks 3–4) | `npm run db:seed` |
| Phase 1 endpoints | login, RBAC, audit all green | ✅ 73/73 tests; 12/12 acceptance checks | `npm test` |
| `backend/.env` | Complete, no `change-me` | ✅ Present, git-ignored | Copy `.env.example` and fill in |
| `UPLOAD_DIR` | Writable path | ✅ `uploads/letters` (from Phase 0) | Create it; Task 2.5 creates it recursively if absent |
| `MAX_UPLOAD_SIZE_MB` | `10` | ✅ Present in `.env`, **unused until now** | Becomes live in Task 2.15 |
| `multer` | Installed | ✅ Installed in Phase 0, unused | none — this is the phase that uses it |
| Node.js | `>=18` (spec §10.1) | ⚠️ v22.3.0 — fine for the backend, below Vite 8's floor | Carried from Phase 1 §3a / Q15. **Phase 2 needs no Vite.** Resolve before Phase 3 |
| npm deps | the seven spec §10.1 packages | ✅ `multer` is the last unused one | none |

**No new runtime dependency is added in Phase 2.** `multer` was already installed by Phase 0 precisely for this phase. The state machine, the day-stamp generator, the transition table and the duty matcher are all hand-rolled — none of them is a library, and the three hand-rolled pieces in `utils/` sit next to Phase 1's `password.js` / `permissions.js` / `validate.js` in one place.

## 4. Decisions Taken in This Phase

Numbering continues from `PHASE_1_PLAN.md` §4 (D1–D47). D1–D47 are still binding and are **not** re-litigated here.

| # | Decision | Rationale |
| :-- | :-- | :-- |
| **D48** | **Q3 answered: the spec's 5 `status` and 3 `priority` values are final, verbatim** | The user confirmed the ministry wording is correct, so `ENUM('Logged','Forwarded to Subject','Assigned','In Progress','Completed')` and `ENUM('Normal','Urgent','Confidential')` go into the migration exactly as spec §5.2 writes them. This matters more than a normal data-dictionary confirmation: these strings are rendered as status badges in Phase 3, appear in the seed data, and are the values every test fixture asserts. A synonym layer (`REGISTERED` → `Logged`) would mean a translation table to keep in sync for no gain. **The ENUM is the vocabulary.** |
| **D49** | **Q4 answered: an officer may hold duties in more than one section, so `section_name` stays on `officer_duties` and NOT on `users`** | The user confirmed many-sections-per-officer. This settles the ambiguity in spec §5.2, where `section_name` appears twice — once on `users` (Phase 1's column, meaning an officer's *home* section) and once on `officer_duties` (meaning the section a *given duty* belongs to). They are different facts, so both columns stay and they are documented as different things. Moving it to `users` would make an officer's duty chart single-section, which is exactly what the ministry does not want. Consequence: `officer_duties` gets a composite uniqueness rule per officer+section, and the duty matcher scores per **duty row**, not per officer (D54). |
| **D50** | **`REVIEWED` is not a status. The workflow has five resting states and six *steps*** | Spec §6 draws six boxes: Logged, Reviewed, Forwarded to Subject, Assigned, In Progress, Completed. Spec §5.2's `status` ENUM has five values and `REVIEWED` is not among them. The resolution: "REVIEWED" describes the *act* of a Secretary reading a letter and writing minutes, and the result of that act is that minutes now exist and the letter has been forwarded. So the transition `Logged → Forwarded to Subject` is the review, and it is exactly what `POST /mail/:id/minutes` (task 2.8) already does. Adding a `REVIEWED` enum value would produce a state the letter occupies for the duration of a form submission and immediately leaves — a state with no resting rows, no filter worth building, and one more thing the UI has to render. **Six steps, five states.** The state machine in Task 2.10 encodes that reading explicitly. |
| **D51** | **The legal-transition table lives in `utils/mailStateMachine.js` as data, not as `if` statements in the controller** | Task 2.10 says "enforce legal transitions only". Written as `if (status === 'Assigned' && ...) return 409` in a controller, the rule set is spread across branches, and a new state added later is added to *some* of them. As an explicit `{ from: [...allowed], role: '...', to: '...' }` table it is one reviewable object, it is what the tests iterate over, and `GET /mail/:id` can return the legal next actions for the caller's role so the Phase 3 UI does not re-derive them. This is the single most load-bearing structural decision in the phase. |
| **D52** | **A status transition is refused with `409`, and a role that may not attempt it is refused with `403`** | The two failures mean different things to a client. `403` = "your role cannot do this, ever, on any letter" (e.g. a MINOR_STAFF trying to assign an officer) — the UI should not show that button. `409` = "your role is right, but the letter is in the wrong state" (e.g. an OFFICER trying to start work on a letter that is not yet `Assigned`) — the UI should offer a refresh. Collapsing them to one code means the frontend cannot distinguish "wrong screen" from "stale screen", and the second is common on a shared office machine. |
| **D53** | **The day-stamp counter is a table row, allocated inside the logging transaction, not a `MAX()+1` scan and not an in-process counter** | Three candidates, all wrong or worse. `SELECT MAX(day_stamp_no)` races: two clerks logging simultaneously both read the same max and the second insert fails on `uq_day_stamp_no`. An in-process counter dies on restart and cannot see a second server. A `day_stamp_counters` row updated with `SELECT … FOR UPDATE` inside the same transaction as the `mail_records` insert is the standard answer: the lock serialises the two clerks, the counter is durable, and the unique index remains the backstop if the logic is ever wrong. Format is spec §2's `DS/YYYY/MM/NNNN` with a 4-digit zero-padded per-year-per-month sequence. |
| **D54** | **The duty matcher scores per `officer_duties` row and returns a ranked list, not spec §8's single best match** | Two reasons, both from D49. §8's `suggestOfficerForLetter` returns one officer, but an officer holding duties in three sections (D49) can be the right answer for reasons spread across those rows, and a Subject Clerk with a letter in hand needs to see the runners-up and the score gap before committing — a suggestion presented as a fact is a suggestion the clerk stops checking. Scoring per duty row also means `matched_keywords` and `score` are attributable to a specific duty, which is what makes the result explainable. Parent plan task 2.12 already says "ranked candidates with scores and matched keywords". |
| **D55** | **Spec §8's scoring is fixed on three counts: word boundaries, a stop-word list, and a cap on duty-description contribution** | §8 as written has three real defects. (1) It uses `normalizedSubject.includes(keyword)`, so the keyword `art` matches "partial", "department" and "start" — a substring match is not a word match. (2) Duty-description tokens score +1 **each, uncapped**, so a long, generic duty description ("Responsible for all administrative matters of the department") scores higher than a precise one, and description length becomes the ranking signal. (3) It has no stop-word list, so "the", "and", "for" out-vote real keywords. The fix: `\b`-anchored matching, a stop-word filter plus a 3-character minimum (spec §8's own `word.length > 3` intent, kept), and duty-description contribution capped and weighted below keywords so it can rank but never outweigh a direct hit. Parent plan task 2.12 names both fixes. |
| **D56** | **The accessor's `department_id` comes from the request's user row, never from a query parameter** | `GET /mail` is scoped by RBAC (task 2.6: all / department / assigned-only). For the department scope, the filter is the *caller's* `users.department_id`, which `authMiddleware` has already loaded (D21). Accepting a `department_id` query parameter would let any signed-in user read another department's mail by typing a different number, and it would be invisible in review because the parameter looks like a filter. The parameter is rejected by `rejectUnknownFields` like any other unrecognised field. |
| **D57** | **Attachments live under `UPLOAD_DIR/<day_stamp_no>/<random-name>.<ext>` and are served only by an authorization-checked route** | Spec §5.2 has a single `attachment_path` column; parent plan task 2.15 adds *additional* files, which one column cannot hold. A `mail_attachments` child table is the deviation (D67), and it makes the `has_attachment` boolean derivable rather than authoritative. Two security properties come from the layout: the directory name is a **server-generated day stamp**, not a client-supplied filename, so `../../` cannot escape `UPLOAD_DIR` (Phase 4 task 4.9's traversal check has nothing left to find), and the on-disk name is random, so a letter's original filename is never a path. `app.js` does **not** `express.static(UPLOAD_DIR)` — serving the directory is what would make the route check optional. |
| **D58** | **`has_attachment` stays a column, kept true by the attachment inserts, and is not recomputed by a trigger** | It is in the spec, it is the cheapest possible "does this letter have a scan?" check for a list query that would otherwise `EXISTS`-subquery a child table, and the alternative — a trigger — is unavailable (D42: no `TRIGGER` grant). The risk is a row that says `TRUE` with no files behind it, which is exactly what a failed attachment insert inside a rolled-back transaction must **not** leave behind: attachment and flag are written on the same connection, so they agree or neither lands. A test asserts it. |
| **D59** | **The duty matcher is a pure function over already-fetched rows, with no database calls** | `suggestOfficerForLetter(subject, duties)` takes the subject text and an array of duty rows. Nothing in it opens a connection, so the ranking rules are unit-testable without a database — which is the only way to test "duty-description tokens cannot outweigh direct keyword hits" (D55) as a *rule* rather than as a side effect. `GET /mail/:id/suggestions` does the fetching, then calls the pure function. This is the same separation as `utils/permissions.js` in Phase 1. |
| **D60** | **No new `.env` variables.** `UPLOAD_DIR` and `MAX_UPLOAD_SIZE_MB`, both present since Phase 0, simply become live | Same reasoning as D34. The two variables are deployment facts (where files live, how big they may be), and they are already committed to `.env.example` as the documented contract. Adding a third — a day-stamp format variable, a state-machine variable — would put a fixed data contract in the environment where one deployment could disagree with another about what `DS/2026/09/0441` means. |
| **D61** | **Every mail mutation re-reads the row inside its transaction and validates the state there, not from a pre-flight check** | Task 2.10 is where a TOCTOU bug is most likely: read the letter, see it is `Assigned`, check the caller is the officer, then `UPDATE … WHERE id = ?` — and between the read and the write another request completed the letter. The state check and the conditional `UPDATE` belong in one transaction with `SELECT … FOR UPDATE` on the mail row, exactly as Phase 1's D24 last-admin guard does. The conditional `UPDATE` carries `AND status = ?` as a second line of defence: if the lock was somehow not honoured, zero rows are affected and the caller gets `409`, not a silent overwrite. |
| **D62** | **`assigned_officer_id` must reference a user whose role is an officer role, enforced in the model, not by the schema** | The FK says "is a user". Whether that user is `OFFICER` or `TRANSPORT_OFFICER` — and therefore has `UPDATE_ACTION_STATUS` — is a second fact, and MySQL `CHECK` constraints cannot reference another table. The assign path validates the target's role in the same transaction (D61) and returns `400` naming the actual role, because "that user is a SECRETARY" is a message the Subject Clerk can act on. A test assigns a letter to a SECRETARY and asserts the refusal. |
| **D63** | **Minute authorship is taken from the request's user row, never from `author_role` / `author_name` in the body** | Spec §7.2's `POST /mail/:id/minutes` request body carries `author_role` and `author_name` as if the client supplied them. Following that literally makes minute authorship forgeable: any executive could endorse a letter in someone else's name, and `official_minutes` snapshots author identity precisely so the endorsement is trustworthy later. The columns keep their spec names — the snapshot is still taken at write time, because a Secretary who is later transferred must still appear as the author of the minutes they wrote — but the **values** come from `req.user`. A body that includes them is rejected by `rejectUnknownFields`. Same principle as D45: the dangerous call site should be unrepresentable. |
| **D64** | **`GET /mail` free-text search uses `LIKE` with a bound parameter, and `%` / `_` in the term are escaped** | Task 2.6 asks for free-text search on four columns. `LIKE CONCAT('%', ?, '%')` is what keeps the value a parameter; string-concatenating a term into the pattern is the injection bug Phase 4 task 4.2 audits for, and building it here would plant the very thing that task exists to find. The `%`/`_` escaping matters for correctness as well as safety: a user searching for `50%` should find `50%` letters, not match everything. |
| **D65** | **Six demo mail records are seeded — one per state — and the seed names them so the intent is readable** | Parent plan task 2.18 requires demo data spanning all six states. A single `Logged` letter makes the rest of the registry look empty and makes the stats endpoint untestable. Six letters, one per resting state, with `subject` text chosen to exercise the duty matcher (`procurement`, `budget`, `tender`, `repair`, `ambulance`) and at least one per sender type. Seeded minutes only on the letters that have passed the review step — seeding minutes on a `Logged` letter would contradict D50. |

### 4a. Deviations from the parent plan's literal task text

| # | `EXECUTION_PLAN.md` says | What this plan does instead | Why |
| :-- | :-- | :-- | :-- |
| **D66** | Task 2.1: "Migration **`002`**"; task 2.2: "Migration **`003`**"; task 2.3: "Migration **`004`**" | `005_mail_records.sql`, `006_official_minutes.sql`, `007_officer_duties.sql` | Same reasoning as D17. `002`–`004` are taken by Phase 1's `users` / `refresh_tokens` / `audit_logs`, and the runner sorts by filename, so a Phase 2 migration numbered `002` would sort *before* `users` — a mail table whose FKs point at a table that does not exist yet. The parent plan's Phase 1 numbering is renumbered in exactly the same way, for exactly the same reason. |
| **D67** | Spec §5.2 carries one `attachment_path VARCHAR(255)` on `mail_records` | `mail_attachments` child table; `mail_records` keeps `has_attachment` but not `attachment_path` | Task 2.15 adds *additional* files to a letter, and a single column cannot hold three. The column is replaced rather than kept alongside, because a `attachment_path` that duplicates "the first row of `mail_attachments`" is a second source of truth for the same fact. `has_attachment` is kept (D58). This is the only schema departure from spec §5.2 in this phase. |
| **D68** | Task 2.8: "transitions `Logged → Forwarded to Subject`" | Same, and D50 makes it the *only* transition the minutes endpoint performs | Not a change — D50 is the recorded resolution of a spec §6-versus-§5.2 disagreement the parent plan does not mention, and it lands here. Recorded so a later reader does not read task 2.8 as a typo. |
| **D69** | Task 2.1: "three indexes" (`idx_day_stamp`, `idx_status`, `idx_priority`) | All three kept; a fourth on `assigned_officer_id` added | The spec's three are exactly right for the filters in task 2.6. `assigned_only` scope (D56) filters on `assigned_officer_id`, and without an index every officer's "my letters" view is a full table scan — the single most frequent query in the application, since it is the officer's home screen. `idx_day_stamp` is retained despite `day_stamp_no` being `UNIQUE` for the same reason as D36: a unique index is a usable index, so it is a genuine duplicate and *is* dropped — see the note in Task 2.1. |
| **D70** | Task 2.10: "`OFFICER` may only touch own assigned mail" | Enforced for `OFFICER` **and** `TRANSPORT_OFFICER` | D28 already gave `TRANSPORT_OFFICER` the officer permission set in Phase 1, because spec §4.1 assigns it none. Applying task 2.10's restriction to one officer role and not the other would leave transport officers able to advance any letter in the registry — a wider grant than the roles the restriction was written for. The permission and the restriction must move together. |

## 5. Target Filesystem State at End of Phase 2

Everything in the Phase 1 tree is retained. Additions and edits:

```
PME System/
├── database/
│   └── migrations/
│       ├── 005_mail_records.sql       # NEW — registry, spec §5.2 minus attachment_path (D67)
│       ├── 006_official_minutes.sql   # NEW — minutes history
│       └── 007_officer_duties.sql     # NEW — duty charts, JSON keywords, section_name (D49)
│   └── seeds/
│       ├── 003_seed_officer_duties.sql  # NEW — 6 sections of duty keywords
│       └── 004_seed_demo_mail.sql       # NEW — 6 letters, one per state (D65)
│
├── backend/
│   ├── app.js                      # EDIT — no express.static for UPLOAD_DIR (D57);
│   │                               #       body-size cap + JSON error for multer (Task 2.15)
│   ├── models/
│   │   ├── mailModel.js            # NEW — the heaviest model in the project
│   │   ├── minutesModel.js         # NEW
│   │   └── dutyModel.js            # NEW
│   ├── controllers/
│   │   ├── mailController.js       # NEW — intake, registry, detail, minutes, assign, status, notes
│   │   ├── attachmentController.js # NEW — upload + authorization-checked streaming
│   │   └── officerController.js     # NEW — duty charts + matcher
│   ├── routes/
│   │   ├── index.js                # EDIT — compose the three new routers
│   │   ├── mailRoutes.js           # NEW
│   │   ├── officerRoutes.js        # NEW
│   │   └── attachmentRoutes.js     # NEW  (nested under /mail/:id/attachments)
│   ├── middleware/
│   │   └── upload.js               # NEW — multer instance + allowlist + size cap (Task 2.15)
│   └── utils/
│       ├── dayStampGenerator.js    # NEW — DS/YYYY/MM/NNNN, D53
│       ├── mailStateMachine.js     # NEW — the transition table, D51
│       └── dutyMatcher.js          # NEW — pure ranking, D54/D55/D59
│
└── frontend/src/                   # UNTOUCHED — the UI is Phase 3 (§2)
```

**File count:** ~14 new, 2 edited. **No file under `frontend/` changes.**

Note the naming: `attachmentRoutes.js` mounts under `/api/v1/mail/:id/attachments` rather than owning a top-level prefix, because an attachment has no independent identity — it is always addressed through its letter. Its router is mounted *by* `mailRoutes.js` so that `/api/v1/mail` stays one coherent surface in `routes/index.js` and a reader looking for mail endpoints finds one file.

## 6. Task Breakdown

### Task 2.1 — Migration `005`: `mail_records`

**Goal:** the letter registry, per spec §5.2 with D67 and D69 applied.

```sql
CREATE TABLE IF NOT EXISTS mail_records (
  id                  VARCHAR(36)     NOT NULL PRIMARY KEY,
  day_stamp_no        VARCHAR(50)     NOT NULL,
  letter_ref_no       VARCHAR(100)    NULL,
  receipt_date        DATE            NOT NULL,
  sender_type ENUM('Government Office','Non-Government / Public',
                   'Private Organization','Judicial / Court') NOT NULL,
  sender_name         VARCHAR(200)    NOT NULL,
  subject             TEXT            NOT NULL,
  priority ENUM('Normal','Urgent','Confidential') NOT NULL DEFAULT 'Normal',
  category            VARCHAR(100)    NOT NULL DEFAULT 'General Administration',
  has_attachment      BOOLEAN         NOT NULL DEFAULT FALSE,
  status ENUM('Logged','Forwarded to Subject','Assigned',
              'In Progress','Completed') NOT NULL DEFAULT 'Logged',
  assigned_officer_id INT             NULL,
  assigned_date       DATETIME        NULL,
  subject_clerk_note  TEXT            NULL,
  officer_status_note TEXT            NULL,
  completion_date     DATETIME        NULL,
  created_by_user_id  INT             NOT NULL,
  created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mail_day_stamp (day_stamp_no),
  INDEX      idx_mail_status   (status),
  INDEX      idx_mail_priority (priority),
  INDEX      idx_mail_officer  (assigned_officer_id),
  CONSTRAINT fk_mail_officer FOREIGN KEY (assigned_officer_id)
    REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_mail_creator FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Deviations from the spec block, each traceable:

| Change | Decision | Note |
| :-- | :-- | :-- |
| `id VARCHAR(36) PK` + `UUID()` in JS, not a MySQL default | — | The spec's comment says "UUID or System LTR Code". A `DEFAULT (UUID())` works in MySQL 8 but produces the UUID server-side, which makes test fixtures unable to name a row before inserting. Generating in JS means a test can `const id = randomUUID()` and then assert on it — which the integration suite does, because task 2.19 walks a letter through five transitions and each step needs the id |
| `attachment_path` **dropped** | D67 | Replaced by the `mail_attachments` child table in Task 2.15. One source of truth |
| `has_attachment BOOLEAN NOT NULL DEFAULT FALSE` | D58 | Spec says `BOOLEAN DEFAULT FALSE`, which is nullable — so `has_attachment` could be `NULL`, which is neither true nor false, and `WHERE NOT has_attachment` silently excludes it. `NOT NULL` costs nothing and removes a third state nobody chose |
| `priority` NOT NULL | D48 | Spec has `DEFAULT 'Normal'` with no `NOT NULL`. Same argument: the default already declares the intent, and an explicit `NULL` is a bug the column should reject |
| `category VARCHAR(100) NOT NULL DEFAULT 'General Administration'` | — | Spec has it nullable. It is on the filter bar in task 2.6, so it is always populated in practice; `NOT NULL` with a default makes "no category" mean one specific value instead of `NULL` |
| `idx_day_stamp` **dropped**, `idx_mail_officer` **added** | D69 | Same reasoning as D36 — `day_stamp_no` is `UNIQUE`, so a second b-tree on it is pure write cost on every letter logged. The officer index backs the most frequent query in the app |
| `created_at`/`updated_at` | D37 | `updated_at` carried forward from Phase 1's D37 for the same reason: the detail view shows when a letter last moved |
| `ON DELETE SET NULL` on `assigned_officer_id` | D23 | If a user is ever hard-deleted at the database level, the letter survives with no officer. Letters are institutional records; a user is a login |
| `ON DELETE` **absent** on `created_by_user_id` | D23 | `RESTRICT`, deliberately — the same reason Phase 1 never hard-deletes a user. A letter must always name who logged it |

### Task 2.2 — Migration `006`: `official_minutes`

**Goal:** the endorsement history, per spec §5.2.

```sql
CREATE TABLE IF NOT EXISTS official_minutes (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  mail_record_id  VARCHAR(36)    NOT NULL,
  author_user_id  INT            NOT NULL,
  author_role     VARCHAR(50)    NOT NULL,
  author_name     VARCHAR(150)   NOT NULL,
  instruction_type VARCHAR(100)  NOT NULL,
  minutes_text    TEXT           NOT NULL,
  created_at      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX      idx_minutes_mail (mail_record_id, created_at),
  CONSTRAINT fk_minutes_mail   FOREIGN KEY (mail_record_id)
    REFERENCES mail_records(id) ON DELETE CASCADE,
  CONSTRAINT fk_minutes_author FOREIGN KEY (author_user_id)
    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- **`ON DELETE CASCADE` on `mail_record_id` is from the spec and is correct.** Minutes are a *part of* the letter's history; a letter without its minutes is not a letter. Nobody deletes a letter through the API in any phase, so this cascade is a database-level guarantee for whoever does.
- **`ON DELETE` absent on `author_user_id`** — `RESTRICT`, for the same reason as `mail_records.created_by_user_id`. A minute must always name a real person, and users are never hard-deleted (D23).
- **`idx_minutes_mail` is `(mail_record_id, created_at)`, not just `mail_record_id`** — the detail view reads one letter's minutes *in order*, so the composite index serves both the filter and the sort. The extra column is free: `mail_record_id` is a UUID with `id` as the leading column, so the index is already selective and `created_at` is a two-column b-tree rather than a sort.
- **`author_role` and `author_name` are `NOT NULL` snapshots, written from `req.user` (D63).** The spec asks for them explicitly, and the reason is real: a Secretary who is transferred, retires, or has their name corrected still appears as the author of the minutes they endorsed. The identity is captured once, at the moment of endorsement, and never re-read.
- **`instruction_type VARCHAR(100) NOT NULL`** — the four presets from spec §9.2 (`For Immediate Report`, `Prepare Draft Reply`, `For Information`, `For Necessary Action`) plus whatever else the ministry types. **Not an `ENUM`**: this is the one field in the phase whose vocabulary is genuinely open, the ministry adds a directive occasionally, and `ENUM` makes adding one a migration. The Phase 3 UI (task 3.16) presents them as preset chips; the API accepts a free string. Phase 3 presents the choice; the server does not police it.

### Task 2.3 — Migration `007`: `officer_duties`

**Goal:** the duty charts the matcher scores against, per spec §5.2 with D49.

```sql
CREATE TABLE IF NOT EXISTS officer_duties (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  officer_user_id  INT          NOT NULL,
  section_name     VARCHAR(150) NOT NULL,
  duty_description TEXT         NOT NULL,
  keywords         JSON         NOT NULL,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_duties_officer_section UNIQUE (officer_user_id, section_name),
  CONSTRAINT fk_duties_officer FOREIGN KEY (officer_user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

The consequences of D49 (officer holds duties in several sections) are all in this table:

- **`uq_duties_officer_section`** — one duty row per officer per section. Without it, the same section is insertable twice and the matcher scores the same keywords twice, inflating a score for a reason that has nothing to do with relevance. The matcher's ranking is only meaningful if each row is a distinct claim.
- **No `idx_duties_officer`.** An earlier draft of this task had one, and it was wrong for the same reason D36 removed `idx_user_nic`: a `UNIQUE` index on `(officer_user_id, section_name)` is a usable index on its leading column, so every query the single-column index would serve is already served by the composite. Keeping both is a second b-tree maintained on every duty insert for no gain. MySQL will happily create the redundant index; it will not tell you it was unnecessary.
- **The uniqueness is on `(officer_user_id, section_name)` under `utf8mb4_unicode_ci`**, so `Procurement` and `procurement` are the same section. That is the ministry's convention, not a technicality — the same reasoning as `uq_departments_code` in Phase 1. Note the asymmetry this creates with the officer's identity: two *different* officers may each hold a `Procurement` duty, because the key leads with `officer_user_id` and a duty is a per-person claim. Only the same officer claiming the same section twice is refused.
- **`ON DELETE CASCADE` on `officer_user_id`** — the spec's choice, and here it is right. A duty chart is *about* a person: if the person is deleted, their chart has no owner and no meaning. This is the opposite of the `author_user_id` case above, where the person is a historical fact. The distinction is that a duty is a **current** assignment while an endorsement is a **past** act, and `RESTRICT`-on-past / `CASCADE`-on-current is the rule both tables follow.
- **`keywords JSON NOT NULL`** — validated in the model: must be an array of non-empty strings, lowercased on write so the matcher never lowercases at query time. A `JSON` column cannot be indexed meaningfully for substring search here, and it is not searched in SQL at all — the matcher is a JS function (D59) that reads rows and scores them in memory. The column exists because the spec specifies it and because a duty chart is far more readable as a keyword list than as a prose blob.
- **`section_name` on this table is a *duty's* section. `users.section_name` is an officer's *home* section.** They are different facts and both stay (D49). Task 2.14's officer list returns both, labelled, because a Subject Clerk looking at an officer needs to know which section they belong to *and* which sections their duties cover.

### Task 2.4 — `utils/dayStampGenerator.js`

**Goal:** a collision-free `DS/YYYY/MM/NNNN` per spec §2, correct under two clerks logging at the same instant (D53).

```
DS/2026/09/0001
DS/2026/09/0002
...
DS/2026/10/0001     ← counter resets per year per month
```

**Schema addition** (a new migration, `008_day_stamp_counters.sql` — Task 2.4's own file, because it is a table and this project puts tables in migrations):

```sql
CREATE TABLE IF NOT EXISTS day_stamp_counters (
  `year_month` CHAR(7) NOT NULL PRIMARY KEY,  -- 'YYYY-MM'  ← backticks REQUIRED
  last_seq     INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT chk_ym_format CHECK (`year_month` REGEXP '^[0-9]{4}-[0-9]{2}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**`year_month` needs backticks, and that is not a style choice.** `YEAR_MONTH` is a **reserved word** in MySQL 8.0 — it is the `INTERVAL 1 YEAR_MONTH` unit — and a reserved word cannot be a bare column name. `CREATE TABLE t (year_month CHAR(7))` is `ERROR 1064`; the same statement with backticks is fine, and so is every later `SELECT`/`WHERE` that references it unquoted. Confirmed against `information_schema.KEYWORDS`, where `YEAR_MONTH` has `RESERVED = 1` while `YEAR` and `MONTH` are both `RESERVED = 0`.

Renaming the column to dodge the keyword (`period`, `ym`, `year_month_key`) was considered and rejected: the one value this table holds *is* `YYYY-MM`, and a column called `period` holding a string is a worse trade than remembering backticks. The failure mode is also the good one — an unquoted use is a syntax error pointing at the query, never a silent wrong answer. Every reference in `008_day_stamp_counters.sql` and in `utils/dayStampGenerator.js` is backticked.

The allocation, and the whole reason the function is not four lines:

```js
export async function nextDayStamp(connection, receiptDate) {
  const ym = format(receiptDate);                    // '2026-09'
  await connection.query(
    `INSERT INTO day_stamp_counters (year_month, last_seq) VALUES (?, 0)
     ON DUPLICATE KEY UPDATE year_month = year_month`, [ym]);
  const [rows] = await connection.query(
    `SELECT last_seq FROM day_stamp_counters
      WHERE year_month = ? FOR UPDATE`, [ym]);
  const next = rows[0].last_seq + 1;
  await connection.query(
    `UPDATE day_stamp_counters SET last_seq = ? WHERE year_month = ?`, [next, ym]);
  return `DS/${ym.replace('-', '/')}/${String(next).padStart(4, '0')}`;
}
```

| Why each part | |
| :-- | :-- |
| The caller passes the `connection` (D19's `executor` pattern) | So the counter increment and the `mail_records` insert share one transaction. If the letter insert fails, the increment rolls back and no number is silently burned — a gap in a legal registry is a defect |
| `SELECT … FOR UPDATE` | The lock that makes two concurrent clerks serialise. Without it both read `last_seq = 41` and both mint `0442`; the unique index catches the second, and the clerk sees a `409` on a letter they just typed. With it, the second request waits and gets `0443` |
| `ON DUPLICATE KEY UPDATE year_month = year_month` | Creates the row idempotently. Written as a no-op assignment rather than `INSERT IGNORE` or `REPLACE` because `REPLACE` would `DELETE` then `INSERT` — discarding the counter |
| The counter is keyed on **`receipt_date`, not today** | A letter received on the 30th is registered on the 2nd of next month. Keying on the current date would file it under the wrong month and break both the format and the sequence's meaning |
| `padStart(4, '0')` | `DS/2026/09/0441` in the spec's example. A stamp that reads `DS/2026/09/441` sorts and compares wrong as a string |
| `uq_mail_day_stamp` remains the backstop | Logic can be wrong. A `UNIQUE` violation surfaces as a `409`, never as a duplicate letter |
| `CHECK (year_month REGEXP …)` | `CHAR(7)` accepts `'nonsense'`, and a malformed key silently creates a second sequence for what should be one month. MySQL 8.0.16+ enforces `CHECK`, and this is 8.0.34 |
| The CHECK validates **format, not the calendar** | `'2026-13'` and `'2026-00'` are accepted by the constraint, because month-range checking lives in `formatYearMonth()` at the one place a month can enter. Two wordings of one rule is two chances to disagree; the regex's job is only "is this YYYY-MM at all", which is what prevents a second key for an existing month |

**Two behaviours verified against live MySQL rather than assumed:**

- **`CHAR(7)` strips trailing spaces before the CHECK sees them.** `'2026-10 '` is not refused as eight malformed characters — it is stored and returned as `[2026-10]`, length 7. That is the benign direction here (a stray space becomes the *right* key rather than a second key that forks the month), but it means the CHECK is not what protects against that particular typo; MySQL's CHAR semantics are. `'nonsense'` (`ERROR 1406`), `'2026-9'` (`ERROR 3819`), and `'2026-009'` (`ERROR 1406`) are genuinely refused.
- **`year_month` must be backticked everywhere** — see the reserved-word note above. This applies to `nextDayStamp`'s `INSERT`, `SELECT … FOR UPDATE`, and `UPDATE` as much as to the DDL.

**Test:** two concurrent `nextDayStamp` calls on separate connections produce distinct stamps, and the resulting `day_stamp_no` values are contiguous. This is the one unit of Phase 2 that needs a deliberate race test — `Promise.all` over two connections, asserting no duplicate and no gap. The unit test also asserts the format of a minted stamp (`DS/2026/09/0001`) and the zero-padding boundary at `9999`, both with no database in the test.

### Task 2.5 — `POST /api/v1/mail`

**Goal:** a letter is logged with its day stamp and its scan, per spec §7.2.

**Permission:** `CREATE_MAIL` (MINOR_STAFF, and ADMIN via the wildcard). `multipart/form-data` with one file field `attachment`; the attachment itself is optional.

| Field | Source | Notes |
| :-- | :-- | :-- |
| `day_stamp_no` | **server** | Spec §7.2 shows it in the request. It is generated (Task 2.4). Accepting a client-supplied one would let any caller write `DS/2026/09/0001` on any letter. A `day_stamp_no` in the body is rejected by `rejectUnknownFields` — same reasoning as D63 |
| `letter_ref_no` | client | Optional, `VARCHAR(100)`. The sender's own reference |
| `receipt_date` | client | `YYYY-MM-DD`, not in the future, not older than 5 years. The bounds are stated in the response message so a clerk can fix the entry |
| `sender_type` | client | `requireEnum` against the spec's four values, verbatim (D48) |
| `sender_name` | client | Required, ≤200 |
| `subject` | client | Required. `TEXT`, ≤2000 — a `TEXT` column with no application bound accepts a 64 KB letter subject into every list query |
| `priority` | client | `requireEnum`, three values (D48) |
| `category` | client | Optional, defaults to `General Administration` |
| `attachment` | client | Optional file; see below |

**Response** is spec §7.2's shape exactly: `201 { success, message, record_id }`. Note the spec's example shows `record_id: "LTR-2026-0891"`, which is neither a UUID nor a day stamp; the field carries the row's `id` (the UUID from Task 2.1). **The shape is honoured, the example value is not** — `id` is a `VARCHAR(36)` UUID and inventing a second identifier for the same letter would give two ways to address one row.

**Transaction (D20, D61):** `nextDayStamp(tx)` → insert `mail_records` → store the file → set `has_attachment` → audit row `MAIL_LOGGED` → commit.

**Order note:** the file is written to disk inside the transaction, and the audit row records the storage path. If the transaction rolls back, the file is deleted in the `catch`. A file on disk that no row references is invisible garbage; a row pointing at a file that was never written is a 500 on a letter somebody typed. The second is worse, so the rollback deletes the file rather than leaving the row.

**Validation of the stored file** is what Phase 2 does enforce, stated plainly rather than deferred wholesale:

| Check | Value | Why here and not Phase 4 |
| :-- | :-- | :-- |
| Size cap | `MAX_UPLOAD_SIZE_MB` (10 MB), enforced by `multer` | Untrusted input; a 10 MB limit is the difference between a busy server and an unusable one |
| Extension allowlist | `.pdf .jpg .jpeg .png .tiff .doc .docx` | Spec §9.2's scanner output is PDF and image. Task 4.9 adds *content* inspection (magic bytes) and the full hardening; the extension list is the cheap half and it is free to add now |
| On-disk name | `randomUUID() + ext` | D57. The client's filename never touches the filesystem, so `../../` and `%00` and reserved Windows names (`CON`, `NUL`) are not reachable at all |
| Directory | `UPLOAD_DIR/<day_stamp_no>/` | Server-generated (D53), so the path is provably inside `UPLOAD_DIR` |
| MIME type | recorded, not trusted | `req.file.mimetype` is client-supplied. Stored in the DB for display, never used to decide anything. Phase 4 task 4.9 does the real check |

### Task 2.6 — `GET /api/v1/mail`

**Goal:** the registry query, filtered, paginated, and scoped by role.

**Permission:** any authenticated user. What they may *see* is the question, and the answer is the role:

| Role | Scope | Basis |
| :-- | :-- | :-- |
| ADMIN | all letters | D26 wildcard expands to every concrete permission |
| SECRETARY, AO, CHIEF_CLERK | all letters | `READ_ALL_MAIL` |
| SUBJECT_CLERK | all letters in **their own** `department_id`, plus any letter assigned to them | `READ_DEPARTMENT_MAIL` |
| OFFICER, TRANSPORT_OFFICER | only letters **assigned to them** | `READ_ASSIGNED_MAIL` |
| MINOR_STAFF | all letters they logged (`created_by_user_id = them`) | `READ_PUBLIC_MAIL` — "public" is the spec's word for the open registry; they see the letters that exist, not other officers' queues |

The scope is computed from `req.user` (D56) and applied as SQL the model cannot bypass: the scope predicate is a required argument to `mailModel.list`, not an optional filter. A caller who passes a `department_id` filter gets a `400` from `rejectUnknownFields`, not a different department's mail.

**Filters** (all optional, all combined with `AND`):

| Parameter | Type | Notes |
| :-- | :-- | :-- |
| `status` | enum ×5 | Exact. Values are the D48 vocabulary |
| `priority` | enum ×3 | Exact |
| `category` | string | Exact match, case-insensitive under the column collation |
| `sender_type` | enum ×4 | Exact |
| `department_id` | int | Filters the **creator's** department via a `JOIN users`, for admins and executives only. For a SUBJECT_CLERK the scope already pins it and this filter can only narrow within their own department |
| `assigned_officer_id` | int | For admins and executives. Ignored — and this is stated, not silent — for roles whose scope is already officer-pinned |
| `from`, `to` | date | `receipt_date` range, inclusive. `from > to` is a `400` |
| `search` | string, ≤100 | `day_stamp_no`, `letter_ref_no`, `subject`, `sender_name` (D64) |
| `limit`, `offset` | int | `parsePagination`, clamped to 100 |

**Response:**

```json
{ "success": true, "data": [ ... ], "pagination": { "total": 132, "limit": 25, "offset": 0 } }
```

`total` is a second `COUNT(*)` under the same predicate, because a registry that cannot say how many rows matched has no pagination. The list projection is deliberately narrow — id, day stamp, subject, sender, status, priority, category, officer name, dates, `has_attachment` — and **omits `subject_clerk_note` and `officer_status_note`**, which are long `TEXT` columns nobody reads in a 25-row table. That is the same projection discipline as Phase 1's `auditModel.list` omitting `action_delta` (D-phase 1 §9 check 11), and for the same reason.

**Ordering:** `receipt_date DESC, day_stamp_no DESC` — newest correspondence first, with the day stamp breaking same-day ties in a stable, human-meaningful order.

### Task 2.7 — `GET /api/v1/mail/:id`

**Goal:** everything the detail view needs, in one request.

Same role scoping as task 2.6 — and applied as a **`404`, not a `403`**, for a letter the caller may not see. A `403` confirms the letter exists; a Subject Clerk probing ids learns which ones are real. D29 refused to confirm which accounts exist, and the same reasoning applies to which letters exist. The letter either is visible or is not there.

```json
{
  "success": true,
  "data": {
    "mail": { ...full row, attachment_path absent, department and officer names resolved... },
    "minutes": [ { "id", "author_role", "author_name", "instruction_type", "minutes_text", "created_at" } ],
    "attachments": [ { "id", "original_name", "stored_name", "mime_type", "size_bytes", "created_at" } ],
    "audit": [ { "action", "user_id", "action_delta", "created_at" } ],
    "available_actions": [ { "action": "add_minutes", "label": "Add minutes" } ],
    "current_state": { "status": "Assigned", "can_advance": true }
  }
}
```

- **`available_actions` is derived from the transition table (D51), filtered by the caller's role.** The Phase 3 UI renders buttons from this list instead of re-deriving the rules, which is the entire reason the table is data. It is advisory — the server re-checks on the actual `PATCH` — but it means the client and server cannot drift.
- **`audit` is included** so the detail view can show who did what without a second request, and it is admin-gated to the same visibility as Phase 1's `/audit` route: an officer sees transitions on their own letter, everyone else does not. Nobody outside Phase 1's `GET /api/v1/audit` can read audit rows, and that stays true.
- **`attachment` metadata is included, not the bytes.** The bytes come from task 2.16's route, which is the only way in.

### Task 2.8 — `POST /api/v1/mail/:id/minutes`

**Goal:** the executive endorsement, and the `Logged → Forwarded to Subject` transition (D50, D68).

**Permission:** `WRITE_MINUTES` — SECRETARY, AO, CHIEF_CLERK. `FORWARD_MAIL` is the same three, so either permission suffices; the check is `WRITE_MINUTES`.

**Body:** `{ instruction_type, minutes_text }` and nothing else. `author_role` and `author_name` from spec §7.2 are **rejected as unknown fields** and their values are taken from `req.user` (D63).

| Validation | Rule |
| :-- | :-- |
| `instruction_type` | Non-empty string, ≤100. Free text, not an enum (Task 2.2) |
| `minutes_text` | Non-empty, ≤10000. A `TEXT` column is 64 KB and an executive's minute is not a novel |

**Transaction:** verify the letter is `Logged` (state machine, D61) → insert `official_minutes` with the author snapshot → `UPDATE mail_records SET status = 'Forwarded to Subject' … WHERE id = ? AND status = 'Logged'` → audit `MAIL_MINUTES_ADDED` **and** `MAIL_STATUS_CHANGED` in the same transaction, because two distinct facts happened and the audit trail records facts, not requests.

The conditional `UPDATE` is the second line of defence in D61. If the state check above passed and this update affects zero rows, the state changed underneath us; the handler returns `409` and the transaction rolls back, so a letter is never left with minutes and no forward.

**Response:** `201` with the created minute and the new status. A repeat call on an already-forwarded letter returns `409` — the Secretary's minutes are not silently appended to a letter that has moved on, and a second endorsement is a different operation (it does not exist in this phase; it would be a `PATCH` on the minute, which Phase 4 task 4.6's audit review would cover).

### Task 2.9 — `POST /api/v1/mail/:id/assign`

**Goal:** the Subject Clerk routes a letter to an officer.

**Permission:** `ASSIGN_OFFICER` — SUBJECT_CLERK, ADMIN.

| Validation | Rule |
| :-- | :-- |
| Letter state | Must be `Forwarded to Subject`. A letter that is `Logged` has no minutes to act on; one that is `Assigned` already has an officer. `409` either way (D52) |
| Target officer | Must exist, be `is_active`, and hold `OFFICER` or `TRANSPORT_OFFICER` (D62). `400` naming the actual role, so the clerk learns why |
| Scoping | A SUBJECT_CLERK may assign a letter in their own department only — the same scope as task 2.6, so a clerk cannot route another department's letter to their own officer |
| Re-assignment | **Allowed**, and audited. Real workflow: a letter goes to the wrong officer and is redirected. `POST /assign` with a different officer sets `assigned_date` and appends the change; the audit row's `action_delta` carries `before.assigned_officer_id` and `after.assigned_officer_id`, which is exactly what parent plan task 2.9 asks for |

**Transaction:** `SELECT … FOR UPDATE` the letter (D61) → validate state → validate officer → `UPDATE mail_records SET assigned_officer_id = ?, assigned_date = NOW(), status = 'Assigned' WHERE id = ? AND status = 'Forwarded to Subject'` → audit `MAIL_ASSIGNED` with the old and new officer.

**Response:** `200` with the updated letter. A `409` names both the current and the required state, because "cannot assign" without the reason is the least helpful message in the API.

### Task 2.10 — `PATCH /api/v1/mail/:id/status`

**Goal:** the state machine, enforced server-side. This is the task the phase exists for.

**Permission:** role-dependent, from the table below. `ADMIN` may perform any transition via the wildcard (D26) — a deliberate override, and it is audited like any other.

`utils/mailStateMachine.js`:

```js
export const MAIL_STATES = Object.freeze([
  'Logged', 'Forwarded to Subject', 'Assigned', 'In Progress', 'Completed',
]);

export const TRANSITIONS = Object.freeze([
  { action: 'forward',   from: 'Logged',              to: 'Forwarded to Subject',
    permission: 'WRITE_MINUTES',      alsoAllowed: ['MAIL_ADD_MINUTES'] },
  { action: 'assign',    from: 'Forwarded to Subject',to: 'Assigned',
    permission: 'ASSIGN_OFFICER' },
  { action: 'start',     from: 'Assigned',            to: 'In Progress',
    permission: 'UPDATE_ACTION_STATUS', officerOnly: true },
  { action: 'complete',  from: 'In Progress',         to: 'Completed',
    permission: 'UPDATE_ACTION_STATUS', officerOnly: true },
]);

export function legalActions(status, user) { /* table + role + ownership */ }
export function assertTransition(action, status, user) { /* 403 or 409 */ }
```

**`officerOnly: true` means the caller must be the letter's `assigned_officer_id`** — for OFFICER *and* TRANSPORT_OFFICER (D70). This is parent plan task 2.10's "OFFICER may only touch own assigned mail", and it is enforced against the re-read row inside the transaction, not against a value from the request body.

**The two refusals are different codes (D52):**

| Situation | Code | Message shape |
| :-- | :-- | :-- |
| Role may never do this (`MINOR_STAFF` starting work) | `403` | names the required permission |
| Role is right, letter is in the wrong state (officer starting an `Assigned`-but-not-yet-started letter twice, or completing a `Logged` letter) | `409` | names the current status and the required one |
| Role is right, letter is right, but it is assigned to someone else | `403` | names the officer it is assigned to, because the OFFICER needs to know why, and a clerk can then see the mis-assignment |

**`completion_date`** is set by the `complete` transition only, inside the same `UPDATE`, and is `NULL` for every other state. A letter with a `completion_date` and a status of `In Progress` is a defect a test asserts cannot exist.

**`PATCH` cannot skip a state.** `Logged → In Progress` is not in the table, so it is `409` — there is no admin override on the *table*, only on the *permission*, and an admin still has to name a legal `action`. This is the "enforce legal transitions only" requirement and it is a data structure, not a set of `if`s (D51).

**Body:** `{ action, note? }` where `action` is one of the four verbs above. **Not `{ status: 'Completed' }`** — a client that could name a target state could ask for any state, and the legality check would become "is `status` in the reachable set", which is one step weaker than naming the action. Every transition writes `MAIL_STATUS_CHANGED` with `before.status` / `after.status` in `action_delta`.

### Task 2.11 — `PATCH /api/v1/mail/:id/notes`

**Goal:** progress notes, written by two different roles into two different columns.

Spec §5.2 has `subject_clerk_note` and `officer_status_note` as separate columns. That is the right shape and it is preserved: they are notes *by* different roles *about* different things, and merging them into one column would make the detail view's two panels impossible.

| Field | Writer | Permission | Semantics |
| :-- | :-- | :-- | :-- |
| `subject_clerk_note` | SUBJECT_CLERK | `ASSIGN_OFFICER` | Classification and routing notes: "This is a budget matter, not procurement" |
| `officer_status_note` | the assigned OFFICER | `UPDATE_ACTION_STATUS` | Progress: "Site inspection scheduled for 3 Oct" |

**Rules:** the note is **replaced, not appended** — a `PATCH` with `{ subject_clerk_note }` overwrites that field and leaves the other untouched. Appending would need a separate `mail_notes` history table, which is not in the spec and not in this phase; the transition history in `audit_logs` already records that a note changed, and the current text is what the detail view shows. The audit delta carries the old and new text, so the history exists where it belongs.

A SUBJECT_CLERK writing `officer_status_note` is a `403` with the field name in the message — this is a copy-paste mistake worth a specific error. An OFFICER writing `subject_clerk_note` likewise. Both fields in one body is a `400`.

**Empty string clears a note** (`NULL` in the column). Not "whitespace is ignored" — a clerk who deletes the text means to remove it, and silently keeping the old text is worse than clearing it.

### Task 2.12 — `utils/dutyMatcher.js`

**Goal:** spec §8's `suggestOfficerForLetter`, fixed per D55 and reshaped per D54/D59.

```js
export function suggestOfficerForLetter(subject, duties, { limit = 5 } = {})
// → [{ officer_user_id, full_name, section_name, duty_id,
//      score, matched_keywords, description_matches }]
```

**Pure function.** No database, no config, no clock (D59). Everything it needs is its two arguments, which is what makes the ranking rules testable as rules.

**The scoring, with the three fixes from D55:**

| Component | Weight | Rule |
| :-- | :-- | :-- |
| Keyword hit | **2** each | `\b`-anchored: `art` must not match "partial". Matched against lowercased subject, keywords lowercased on write (Task 2.3) |
| Duty-description token | **1** each, **capped at 6 total per duty row**, and **capped at 1× the row's keyword score** | §8 gives these +1 each uncapped, so a long generic description outscores a precise one. The cap bounds the contribution; the "cannot outweigh keywords" rule is the guarantee parent plan task 2.12 asks for |
| Stop words | excluded | `the, and, for, with, from, that, this, shall, should, will, must, any, all, are, was, were, has, have, been, its, their, our, your` |
| Minimum token length | 4 | §8's own `word.length > 3` intent, kept as `>= 4` |
| Subject title-casing | ignored | The subject is lowercased once at the top; a Sinhala or Tamil subject scores 0 and is not an error — see below |

**Ranking:** descending score, then `officer_user_id` ascending for a stable order. Officers with score 0 are **excluded entirely**, not returned with a zero score — a ranked list whose last three entries have no relevance is a worse thing to hand a Subject Clerk than a short list. If nothing matches, the response says so explicitly (`"no_candidates": true`) so the UI can say "no duty chart matches this letter" instead of showing an empty panel.

**Ties:** two officers with the same score are returned in a stable order and both carry their score, so the clerk sees a genuine tie and decides. The matcher does not break ties by seniority — that is a ministry rule, not a technical one, and inventing it here would be a guess about their org chart.

**The Sinhala/Tamil reality, stated rather than hidden.** The spec is bilingual and so is the ministry, so subjects will be in Sinhala, Tamil, or English. This matcher is **Latin-token based**: it scores English and transliterated text, and a pure Sinhala subject yields `no_candidates`. A keyword list that works in Sinhala *can* work — the `\b` boundary is the ASCII word boundary, so Sinhala text would tokenise as one enormous token, which is why the length filter and the word-boundary matcher do not extend to it. **This is a real limitation, not a bug, and it is written here so nobody discovers it during the demo.** The Phase 3 remedy is a language-aware tokenizer (ICU `Intl.Segmenter`, which is in Node with no dependency) plus Sinhala/Tamil keyword lists in `007`'s seeds. Phase 2 seeds English keywords and this phase's tests are English.

### Task 2.13 — `GET /api/v1/mail/:id/suggestions`

**Goal:** the data behind the Phase 3 Duty Matcher widget (task 3.17).

**Permission:** `ASSIGN_OFFICER` — SUBJECT_CLERK, ADMIN. Same scope as task 2.9, so the clerk only gets suggestions for a letter in their own department.

```json
{ "success": true, "data": {
    "letter_id": "...", "subject": "...",
    "candidates": [ { "officer_user_id": 5, "full_name": "...",
                      "section_name": "Procurement", "score": 8,
                      "matched_keywords": ["procurement", "tender"],
                      "description_matches": ["purchase"] } ],
    "no_candidates": false, "scored_duties": 14 } }
```

- **`scored_duties`** is how many duty rows were considered. A clerk seeing two candidates out of fourteen rows can judge whether the chart is thin; without it, two results look like a complete answer.
- **`matched_keywords` and `description_matches` are returned separately** — a keyword hit is evidence, a description-token hit is a hint, and the UI shows them differently so the clerk knows which is which. That is the "explainable" in the parent plan's definition of done.
- **Officers with no duty rows are not in the pool.** A letter about procurement and an officer with an empty duty chart is not a candidate; the clerk assigns that one by hand from `/officers`.
- **Only active officers.** A deactivated officer's duty rows are skipped (D21's row is fresh on every request, so this is free).

### Task 2.14 — `/api/v1/officers` and duty-chart maintenance

**Goal:** duty charts are maintainable — spec §4.1 makes this an ADMIN and SUBJECT_CLERK responsibility.

| Method | Path | Permission | Notes |
| :-- | :-- | :-- | :-- |
| `GET` | `/api/v1/officers` | any authenticated | Active `OFFICER` + `TRANSPORT_OFFICER` users, with `department_name` and the officer's home `section_name` (D49's two-column distinction, labelled) |
| `GET` | `/api/v1/officers/:id` | any authenticated | The officer plus their **duty rows**, grouped by `section_name` — the duty chart itself, which is what a Subject Clerk needs on one screen |
| `GET` | `/api/v1/officers/:id/duties` | any authenticated | Flat list of duty rows |
| `POST` | `/api/v1/officers/:id/duties` | `UPDATE_DUTY_CHART` | Body `{ section_name, duty_description, keywords[] }` |
| `PATCH` | `/api/v1/officers/:id/duties/:dutyId` | `UPDATE_DUTY_CHART` | Partial update of any of the three |
| `DELETE` | `/api/v1/officers/:id/duties/:dutyId` | `UPDATE_DUTY_CHART` | **Hard delete** — the spec's `ON DELETE CASCADE` presumes duty rows are transient |

**Why a hard delete here, when Phase 1 refused one for users (D23):** a duty row is a *current* assignment; a user is an identity. Deleting a duty is the normal act of re-assigning someone, and the audit row records who removed what and when. Deleting a user would orphan every letter, minute and audit row that names them. `officer_duties` has `ON DELETE CASCADE` because a chart belongs to a person, and the same reasoning means deleting the person takes the chart — the difference is that nothing *historical* references a duty row. Audit `DUTY_CREATED` / `DUTY_UPDATED` / `DUTY_DELETED` for each.

- **`officer_user_id` in the path must be an officer role** (D62's rule, same as task 2.9). A duty chart on a SECRETARY is meaningless and is a `400`.
- **`keywords` is validated as an array of 1–50 non-empty strings, ≤50 chars each, deduplicated and lowercased on write** (Task 2.3). A `JSON` column with no validation is a column that can hold `"null"`, and the matcher would then throw on every request.
- **Re-assigning a section** is `DELETE` + `POST`, or `PATCH` the section name — but changing `section_name` on a row that violates `uq_duties_officer_section` is a `409` from the database, surfaced as a `409` naming the section that already exists.
- **A Subject Clerk editing duty charts is spec §4.1's instruction** and it is kept. It is worth naming because it is unusual: a clerk can change the routing rules the system uses. The audit trail is the control on that, which is why every one of these writes one.

### Task 2.15 — `POST /api/v1/mail/:id/attachments` and migration `009`

**Goal:** additional files on a letter (parent plan task 2.15), with the storage rules from D57.

```sql
CREATE TABLE IF NOT EXISTS mail_attachments (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  mail_record_id VARCHAR(36)   NOT NULL,
  original_name  VARCHAR(255)  NOT NULL,
  stored_name    VARCHAR(255)  NOT NULL,
  stored_path    VARCHAR(500)  NOT NULL,
  mime_type      VARCHAR(100)  NULL,
  size_bytes     INT UNSIGNED  NOT NULL,
  uploaded_by    INT           NOT NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX      idx_attachments_mail (mail_record_id),
  CONSTRAINT fk_attachments_mail FOREIGN KEY (mail_record_id)
    REFERENCES mail_records(id) ON DELETE CASCADE,
  CONSTRAINT fk_attachments_user FOREIGN KEY (uploaded_by)
    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

| Column | Why it exists |
| :-- | :-- |
| `original_name` | What to show the user. **Never used to build a path** (D57) |
| `stored_name` | The random on-disk name, `randomUUID() + ext` |
| `stored_path` | The path relative to `UPLOAD_DIR`, so the absolute prefix lives in one config value and moving the upload directory is a `.env` edit. `VARCHAR(500)`, not the spec's `255` — Windows long paths plus a nested directory exceed 255 characters routinely |
| `mime_type` | Display only. Client-supplied, so trusted for nothing (Task 2.5) |
| `ON DELETE CASCADE` on `mail_record_id` | Same as minutes (Task 2.2): attachments are part of the letter. A deleted letter must not leave files indexed against nothing |
| **no `UNIQUE` on `stored_name`** | `randomUUID()` collision is not a threat model worth a constraint that costs a b-tree on every upload. The filename is verified unique by the filesystem |

- **Multiple files per request** are accepted (`upload.array('files', 10)`), with a total cap of 10 per request. The per-letter total is unbounded; the per-request cap is what stops one HTTP call from writing 4 GB.
- **`has_attachment` is set `TRUE` in the same transaction** (D58), and a test asserts the flag and the rows agree after both a successful and a rolled-back upload.
- **Adding an attachment is permitted on any non-`Completed` letter.** A closed letter is archival; reopening it to add a scan is a different operation and does not exist.
- **Who may upload:** `CREATE_MAIL` (the original logger, adding the scan they forgot) or `UPDATE_ACTION_STATUS` (an officer attaching a clearance certificate — spec §9.2's officer action panel, task 3.18). A SUBJECT_CLERK cannot; there is no permission that says they can, and inventing one would be a guess.

### Task 2.16 — `GET /api/v1/mail/:id/attachments/:attachmentId`

**Goal:** the only way to read a stored file (D57).

**Authorization, in this order, and all four must pass:**

1. The caller has a valid token — `authenticate`
2. The letter is visible to the caller under task 2.6's scope (admin / executive / same-department clerk / assigned officer / original logger)
3. The attachment row exists and its `mail_record_id` matches the path's `:id` — a mismatched pair is `404`, never "here is file B"
4. The resolved absolute path is inside `UPLOAD_DIR` after normalisation — belt and braces on a path built from a server-generated day stamp and a random name (D57)

**Response:** `res.sendFile(absolutePath)` with `Content-Type` from the stored `mime_type`, `Content-Disposition: inline; filename="<original_name>"`, and `X-Content-Type-Options: nosniff`. A `PDF` or image is shown in the browser; `nosniff` stops a stored `text/html` from executing in the app's origin if the extension allowlist is ever loosened. The `original_name` is sanitised of quotes, newlines and path separators before it goes into the header, because a header built from a client-supplied string is a response-splitting vector.

**`app.js` has no `express.static(UPLOAD_DIR)`.** That single omission is what makes steps 2–4 load-bearing. It is asserted by a test: request a letter's attachment path under `/uploads/...` and expect `404`.

**Download counts are not tracked.** A `downloaded_at` column would be a nice audit fact and it is not in the spec; the `audit_logs` row for the letter already shows the transitions. Adding it is a one-line change if the ministry asks.

### Task 2.17 — `GET /api/v1/mail/stats`

**Goal:** dashboard metrics, admin and executives only.

**Permission:** `READ_ALL_MAIL` — SECRETARY, AO, CHIEF_CLERK, ADMIN. Not SUBJECT_CLERK or OFFICER: a department's counts are not the ministry's, and the Phase 3 dashboard (task 3.12) is specified for executives.

```json
{ "success": true, "data": {
    "by_status":   { "Logged": 12, "Forwarded to Subject": 4, "Assigned": 7, "In Progress": 3, "Completed": 106 },
    "by_priority": { "Normal": 118, "Urgent": 11, "Confidential": 3 },
    "by_category": [ { "category": "Finance & Supply", "count": 18 } ],
    "by_sender_type": [ { "sender_type": "Government Office", "count": 74 } ],
    "daily_intake": [ { "date": "2026-09-26", "count": 9 } ],   // last 30 days
    "overdue": 6,
    "totals": { "all": 132, "open": 26, "completed": 106 } } }
```

| Metric | Definition |
| :-- | :-- |
| `by_status` | **All five keys always present**, zero-filled (D48's vocabulary). A stacked bar chart with a missing segment renders wrong, and "key absent because nobody is there" is different from "not implemented" |
| `overdue` | `status != 'Completed'` **and** `receipt_date < CURDATE() - INTERVAL 30 DAY` |
| `daily_intake` | Last 30 days including days with zero, oldest first, so a line chart's x-axis is continuous |
| Query count | One `GROUP BY status`, one `GROUP BY priority`, one for categories, one for sender types, one 30-day `GROUP BY DATE(receipt_date)`, one `COUNT` for overdue. Six aggregate queries, no row iteration in JS |

**`overdue`'s 30-day threshold is a policy this phase is choosing**, because the spec does not state one. It is a constant in `mailModel`, not a `.env` variable (D60), and it is a named export so Phase 4 can change it in one place if the ministry has a real figure.

### Task 2.18 — Seeds: `003_seed_officer_duties.sql`, `004_seed_demo_mail.sql`

**Goal:** demo data that exercises every screen and every matcher path (D65).

`003` — duty rows for the seeded `OFFICER` and `TRANSPORT_OFFICER` personas, covering the six sections the spec names (procurement, finance, legal, engineering, transport, health). **At least one officer holds duties in more than one section** (D49) — otherwise Q4's answer is untested and the multi-section UI in Phase 3 has nothing to show. Keywords are English (D55) and chosen to collide with the seeded subjects.

`004` — six letters, one per resting state (D50's five states, with two letters at `Logged` so the "unreviewed" queue has more than one row):

| # | Status | Sender type | Subject (drives the matcher) | Attachments | Notes |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | `Logged` | Government Office | "Request for Urgent Budget Allocation for School Furniture Procurement" | 1 PDF | 2026-09-20, Urgent |
| 2 | `Logged` | Private Organization | "Quotation for Office Air Conditioning Maintenance" | none | 2026-09-25, Normal |
| 3 | `Forwarded to Subject` | Judicial / Court | "Court Summons regarding Land Dispute at Base Peradeniya" | 1 PDF | 2 minutes, Confidential |
| 4 | `Assigned` | Government Office | "Tender for Repair of Provincial Office Roof" | 1 image | 1 minute, officer assigned, clerk note present |
| 5 | `In Progress` | Non-Government / Public | "Ambulance Service Request for Kandy Teaching Hospital" | 1 PDF | 1 minute, officer note present |
| 6 | `Completed` | Government Office | "Annual Vehicle Fleet Insurance Renewal" | 1 PDF | 1 minute, `completion_date` set |

Every letter has a distinct `day_stamp_no` in the `DS/2026/09/NNNN` form, consistent with its `receipt_date` and its month. Minutes exist only on letters 3–6 (D50). `has_attachment` agrees with the seeded attachment rows — and because the seed runner is a plain multi-statement executor (Phase 1 D10/D31), the attachment **rows** are seeded in `mail_attachments` while the **files** are not, so `has_attachment` is seeded `TRUE` for five letters and the file-streaming route returns `404` for them until a real file is uploaded. That is a known and stated gap: **the demo letters have attachment metadata but no bytes.** The alternative is committing PDFs to the repository, which is worse. The acceptance check in §9 asserts `404` rather than pretending otherwise.

### Task 2.19 — Test suite

**Goal:** prove the workflow, against a real database, as four different users.

The Phase 1 harness is reused as-is — `helpers/app.js`, `helpers/fixtures.js`, the self-registering cleanup registry (D47), port `0`. New helpers: `createMail()`, `advanceTo(mailId, action, user)` — the test-side driver that walks a letter through the state machine using the right persona for each step, which is what makes the happy-path test a single readable sequence rather than eight near-duplicate blocks.

| File | Proves |
| :-- | :-- |
| `mail.test.js` | MINOR_STAFF logs a letter → `201`, spec §7.2's response shape, `status = 'Logged'`, a `day_stamp_no` matching `^DS/\d{4}/\d{2}/\d{4}$`, and **no `day_stamp_no` accepted from the body** (D53). `has_attachment` is `TRUE` after an upload and the `mail_attachments` row exists. **Two concurrent inserts produce two distinct contiguous stamps** (Task 2.4's race) |
| `mail.test.js` | The registry is scoped: SUBJECT_CLERK sees their own department and not another; OFFICER sees only assigned letters; MINOR_STAFF sees only what they logged. A `department_id` query param is `400` (D56). `search` finds by `day_stamp_no`, `subject` and `sender_name`; a `%` in the search term is escaped (D64) |
| `workflow.test.js` | **The happy path as four users**: MINOR_STAFF logs → SECRETARY adds minutes (`Logged → Forwarded to Subject`) → SUBJECT_CLERK assigns (`→ Assigned`) → OFFICER starts (`→ In Progress`) and completes (`→ Completed`, with `completion_date` set and a status of `Completed`). Then `PATCH /status` again → `409`. Each step asserts the response's new status and the letter's status in the database, not just the HTTP code |
| `workflow.test.js` | **Every illegal transition is refused**: all 5×5 state pairs that are not in the table, minus the 4 that are — a loop over `MAIL_STATES`, not 25 hand-written cases. Each returns `409` and the letter's status is unchanged. `Logged → In Progress` specifically (no skipping) |
| `workflow.test.js` | **Role refusals**: MINOR_STAFF on `assign` → `403`. OFFICER on a letter assigned to a *different* officer → `403` naming the officer. SUBJECT_CLERK on `start` → `403`. OFFICER completing an unassigned `Logged` letter → `409`, not `403` (D52's distinction, both directions) |
| `workflow.test.js` | Assigning to a SECRETARY → `400` naming the actual role (D62). Minutes body containing `author_role` → `400` (D63), and the stored minute's `author_name` matches the *token's* user, not the body. A second minutes call on a forwarded letter → `409` |
| `dutyMatcher.test.js` | **Pure-function tests, no database** (D59): keyword match scores 2 and reports `matched_keywords`; `art` does **not** match "partial" (D55's boundary fix); a long generic duty description does **not** outscore a direct keyword hit (D55's cap); stop words contribute 0; a Sinhala subject returns `[]` and does not throw (D55's stated limitation); ties are returned in a stable order; zero-score officers are excluded |
| `dutyMatcher.test.js` | `GET /mail/:id/suggestions` for the seeded procurement letter ranks the seeded procurement officer first, and returns `scored_duties` > 0 (Task 2.18's seed must be shaped so this is deterministic) |
| `officers.test.js` | Duty chart CRUD as SUBJECT_CLERK → 200. As OFFICER → `403`. Duplicate `(officer, section)` → `409`. A duty row on a SECRETARY → `400`. `keywords: "not an array"` → `400`. A duty row on a deactivated officer is skipped by the matcher. A hard delete removes the row and writes a `DUTY_DELETED` audit row |
| `attachments.test.js` | Upload a file → `200`, a row in `mail_attachments`, the bytes on disk readable back. **The stream route returns the bytes to an authorized caller and `404` to a caller outside the letter's scope** (not `403` — the letter is not visible, so it does not exist). `/uploads/...` static path → `404` (D57). A rolled-back upload leaves `has_attachment` `FALSE` and no row (D58). A `text/html` file is rejected by the extension allowlist |
| `stats.test.js` | All five status keys present even with zero rows; `daily_intake` has 30 entries; `overdue` counts only past-due open letters; a completed letter is not overdue. `/mail/stats` as SUBJECT_CLERK → `403` |
| `audit-mail.test.js` | Every mail mutation writes an audit row **in the same transaction**: `MAIL_LOGGED`, `MAIL_MINUTES_ADDED`, `MAIL_STATUS_CHANGED`, `MAIL_ASSIGNED`, `DUTY_*`. `MAIL_ASSIGNED`'s delta carries the old and new officer id. A failed transition writes **no** audit row (proves D20's coupling, not just its presence) |

**Suite size:** roughly 130–170 assertions across 7 new files, so about 250 total. The **cost-12 bcrypt login** in each test is Phase 1's ~300 ms and stays — the state-machine tests reuse a single token per persona via a `before()` hook rather than logging in per assertion, so the suite should land in the 30–45 second range. That bound is stated so a slow run is not mistaken for a hang.

**Failures are loud.** If `MySQL80` is down the suite fails with the `Start-Service` hint, never skips (Phase 1's principle, restated because it is the principle most likely to be violated by a well-meaning helper).

### Task 2.20 — README and documentation

**Goal:** the README describes the system that now exists, not the one that was planned. Phase 1's Task 1.17 is the precedent and the checklist.

1. **Status** — "Phase 1 complete" becomes "Phase 2 complete", and the "Coming Next" section changes from Phase 2 to Phase 3
2. **Scripts** — add the seeds that are new (`003`, `004` need no new scripts; the existing `db:seed` and `db:seed:depts` cover them) and confirm `multer` is no longer an unused dependency
3. **API reference** — add the 15 new endpoints to the Phase 1 table, including the `409`-vs-`403`-vs-`404` distinction from D52, which is the row a client developer will get wrong
4. **Demo walkthrough** — the six seeded letters, their states, and a copy-pasteable four-role script that walks one letter from `Logged` to `Completed`. This is the README's most useful new content: it is the acceptance walkthrough, runnable
5. **Security notes** — the two new honest gaps: uploads are half-hardened (D57 removes traversal at the source, Phase 4 task 4.9 does content inspection), and the duty matcher is Latin-only (Q19/D55)
6. **Known limitation** — the demo letters have attachment metadata but no bytes (Task 2.18), with the one-line fix
7. **Troubleshooting rows** — carry forward every failure mode from §10 and this document, as Phase 0 Task 0.9 and Phase 1 Task 1.17 did
8. **Uploads** — where `UPLOAD_DIR` resolves, how to clear it, and that clearing it while letters reference files is not reversible
9. Correct `PHASE_1_PLAN.md`'s status line from "Planned — not started" to complete, and note that its §9 check 1's `4 applied` is now `7 applied` — a reader running Phase 1's sweep after Phase 2 will see a different number and should know why

## 7. Endpoint and Route Map

| Method | Path | Auth | Phase |
| :-- | :-- | :-- | :-- |
| `GET` | `/api/v1/health` | none | 0 |
| `POST` | `/api/v1/auth/login` | none | 1 |
| `POST` | `/api/v1/auth/refresh` | none | 1 |
| `POST` | `/api/v1/auth/logout` | Bearer | 1 |
| `GET` | `/api/v1/auth/me` | Bearer | 1 |
| `GET` | `/api/v1/auth/permissions` | Bearer | 1 |
| `GET` | `/api/v1/users` | admin | 1 |
| `POST` | `/api/v1/users` | admin | 1 |
| `GET` | `/api/v1/users/:id` | admin | 1 |
| `PATCH` | `/api/v1/users/:id` | admin | 1 |
| `DELETE` | `/api/v1/users/:id` | admin | 1 |
| `GET` | `/api/v1/departments` | any authenticated | 1 |
| `POST` | `/api/v1/departments` | admin | 1 |
| `PATCH` | `/api/v1/departments/:id` | admin | 1 |
| `GET` | `/api/v1/audit` | admin | 1 |
| `GET` | `/api/v1/audit/:id` | admin | 1 |
| `POST` | `/api/v1/mail` | `CREATE_MAIL` | **2** |
| `GET` | `/api/v1/mail` | any authenticated, scoped | **2** |
| `GET` | `/api/v1/mail/stats` | `READ_ALL_MAIL` | **2** |
| `GET` | `/api/v1/mail/:id` | any authenticated, scoped | **2** |
| `PATCH` | `/api/v1/mail/:id/status` | transition-dependent | **2** |
| `PATCH` | `/api/v1/mail/:id/notes` | `ASSIGN_OFFICER` / `UPDATE_ACTION_STATUS` | **2** |
| `POST` | `/api/v1/mail/:id/minutes` | `WRITE_MINUTES` | **2** |
| `POST` | `/api/v1/mail/:id/assign` | `ASSIGN_OFFICER` | **2** |
| `GET` | `/api/v1/mail/:id/suggestions` | `ASSIGN_OFFICER` | **2** |
| `POST` | `/api/v1/mail/:id/attachments` | `CREATE_MAIL` or `UPDATE_ACTION_STATUS` | **2** |
| `GET` | `/api/v1/mail/:id/attachments/:attachmentId` | any authenticated, scoped | **2** |
| `GET` | `/api/v1/officers` | any authenticated | **2** |
| `GET` | `/api/v1/officers/:id` | any authenticated | **2** |
| `GET` | `/api/v1/officers/:id/duties` | any authenticated | **2** |
| `POST` | `/api/v1/officers/:id/duties` | `UPDATE_DUTY_CHART` | **2** |
| `PATCH` | `/api/v1/officers/:id/duties/:dutyId` | `UPDATE_DUTY_CHART` | **2** |
| `DELETE` | `/api/v1/officers/:id/duties/:dutyId` | `UPDATE_DUTY_CHART` | **2** |

**Route-order warning:** `/api/v1/mail/stats` must be registered **before** `/api/v1/mail/:id`, or `stats` is captured as an `:id` and the request 404s with a confusing message. This is the single most likely wiring bug in the phase and §9 check 4 tests it.

`/health` and the two unauthenticated `POST`s remain the complete unauthenticated surface. Every other route passes through `authenticate`; the unauthenticated surface grows by **zero** routes in Phase 2.

## 8. Environment Variable Reference

**No variables are added** (D60). Two from Phase 0 become live:

| Variable | Default | Phase 2 behaviour |
| :-- | :-- | :-- |
| `UPLOAD_DIR` | `uploads/letters` | Root for all stored files. Paths in `mail_attachments.stored_path` are **relative to it**, so moving the directory is a `.env` edit and no row changes. Created recursively at startup if absent |
| `MAX_UPLOAD_SIZE_MB` | `10` | Enforced by `multer` per file and per request. Phase 4 task 4.9 revisits it with content inspection |

`DB_*`, `PORT`, `NODE_ENV`, `JWT_*` are unchanged. `MAIL_OVERDUE_DAYS` is **not** an env var — it is a named constant in `mailModel` (Task 2.17), on D60's reasoning that a ministry policy is not a per-deployment setting.

## 9. Acceptance Test — Phase 2 Exit Criteria

Run in order. **All fourteen must pass.** Start the API for steps 5–14.

| # | Check | Command | Expected |
| :-- | :-- | :-- | :-- |
| 1 | Migrations applied | `npm --prefix backend run migrate:status` | `9 applied, 0 pending` |
| 2 | Migrations are idempotent | `npm --prefix backend run migrate` | `0 migrations applied (nothing to do)` |
| 3 | Seeds are re-runnable | `npm --prefix backend run seed` twice | `4 seed(s) applied` both times (the runner counts *files*) |
| 4 | `/mail/stats` is not shadowed by `/mail/:id` | `GET /api/v1/mail/stats` as SECRETARY | `200` with a `by_status` object — **not** `404`, and the URL in the error is not `stats` treated as an id |
| 5 | A letter is logged | Login as `881234566V` (MINOR_STAFF), `POST /api/v1/mail` with a subject and no attachment | `201`, `record_id` is a 36-char UUID, `status = 'Logged'`, and a `day_stamp_no` matching `^DS/\d{4}/\d{2}/\d{4}$` |
| 6 | A client cannot choose its own day stamp | `POST /api/v1/mail` with `day_stamp_no` in the body | `400 Unknown field: day_stamp_no` (D53) |
| 7 | The workflow advances with the right role | Log a letter, then as SECRETARY `POST /:id/minutes`, as SUBJECT_CLERK `POST /:id/assign` to the seeded OFFICER, as that OFFICER `PATCH /:id/status {action:"start"}` then `{action:"complete"}` | `200` at each step; `200` final; the letter is `Completed` with a non-null `completion_date` |
| 8 | An illegal transition is refused | `PATCH /:id/status {action:"start"}` on a `Completed` letter | `409`, and the letter is still `Completed` |
| 9 | States cannot be skipped | `PATCH /:id/status` on a `Logged` letter with `{action:"complete"}` | `409` (D51). **Run it with a token that holds `UPDATE_ACTION_STATUS` — e.g. ADMIN — not a `SUBJECT_CLERK`**, who lacks the permission and would be refused at `403` before the state is ever examined |
| 10 | Role is enforced on transitions | MINOR_STAFF token on `PATCH /:id/status` | `403` |
| 11 | An officer cannot touch another officer's letter | OFFICER A token, `PATCH /:id/status` on a letter assigned to OFFICER B | `404`, **not** `403` — see the correction below |
| 12 | Minute authorship cannot be forged | `POST /:id/minutes` with `author_name` in the body | `400`; the stored `author_name` equals the token holder's name (D63) |
| 13 | Attachments are authorization-checked | Upload a file, fetch it as the assigned officer → `200` with the bytes; fetch it as a non-assigned OFFICER → `404`; `GET /uploads/letters/...` → `404` | D57 |
| 14 | The suite is green | `npm --prefix backend test` | All tests pass, no skips, and the database is left with only the 6 seeded letters |

**Check 11 as originally written was wrong, and the implementation is right.**
It expected `403` naming officer B. But a letter assigned to officer A is *not
visible* to officer B — `GET /mail` scopes an officer to their own assigned
letters — so B asking for it must be answered `404`. A `403` naming B would
confirm both that the letter exists and who holds it, which is exactly the leak
D29 refused and which `mail.test.js:772` asserts against.

The `ENOTASSIGNED` `403` is real and reachable, but only by a caller who **can see
the letter and holds the permission while not being its officer** — in practice
`ADMIN` (`mail.test.js:751`, which asserts the message names officer A). Both
codes are correct for their own situation; that is the point of the D52 split.

**Sweep result (2026-09-30):** checks 4–13 all pass against a live API. Two notes
for whoever repeats it. `POST /mail` must be called by a `MINOR_STAFF` in the
**same department as the clerk** who will route the letter, or the clerk's
subsequent `assign` returns `404` — correct scoping, and an easy false alarm. And
the `403`/`409`/`404` distinction only shows up if the token used in checks 9–11
actually holds the relevant permission.

**Additional hygiene checks:** `git status` clean; `git check-ignore backend/.env` still confirms the secret is ignored; `backend/package.json` still lists exactly the seven spec §10.1 runtime dependencies (`multer` is now *used*, still nothing added); no `vehicles`, `transfers` or `assets` table exists; `SELECT COUNT(*) FROM mail_records` is 6 after the suite, not 7 or 60.

### 9.1 Demo hygiene — why `npm run db:demo` exists

Two facts about this suite, both measured rather than assumed:

- The test files **do** clean up after themselves. `mail_records` and `users` are back to their seeded counts after a full run, which is what check 14 above asserts.
- `audit_logs` is **not** cleaned up. It has no foreign key to `mail_records` — `entity_type`/`entity_id` is a generic reference, deliberately, so an audit row outlives the thing it describes — which means deleting a test letter cannot cascade its audit rows away. Three consecutive suite runs leave 553 orphaned rows. Nothing shows them: the detail view queries by `entity_id`, so a seeded letter's timeline is correct regardless. The table just grows.

So the registry is presentable after a test run, but the audit table is not clean, and anyone who logs letters during a demo makes the figures drift. `npm run db:demo` is the reset: it clears `mail_records`, `audit_logs`, `officer_duties`, `refresh_tokens` and every user outside the nine seeded accounts, resets the day-stamp counter, and re-seeds. **Run it immediately before a presentation**, never instead of the test suite.

`--dry` counts rather than deletes, and does so with a separate `SELECT` — a dry run that issues the `DELETE` it is reporting on is not a dry run.

## 10. Windows-Specific Considerations

Everything in `PHASE_1_PLAN.md` §10 still applies. Phase 2 adds:

| Concern | Detail | Handling |
| :-- | :-- | :-- |
| **Windows reserved filenames** | `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9` are directories, not names, on NTFS | The on-disk name is `randomUUID() + ext` (D57), so no client-supplied name ever becomes a filename. The `original_name` is stored and displayed but never opened |
| **Path length** | `UPLOAD_DIR` is under `E:\React project\PME System\...` and Windows caps paths at 260 chars by default | `stored_path VARCHAR(500)` is the schema half; long-path support is a machine setting, and the random-name layout keeps real paths well under the limit. The `ENAMETOOLONG` row in the README's Phase 0 notes still applies |
| **File locks on delete** | A locked file cannot be deleted — a virus scanner holding a PDF will `EBUSY` | The rollback delete in Task 2.5 retries once and, if it still fails, logs the path and leaves it. An orphaned file is invisible garbage; failing the request would be worse |
| **`%` in `LIKE`** | `LIKE '%x%'` in a `.sql` file or a PowerShell string | `$`-safe in PowerShell. In JS use `LIKE CONCAT('%', ?, '%')` with the `%`/`_` escaped (D64), never string interpolation |
| **Concurrency test flakiness** | Task 2.4's race test asserts *distinct* stamps and *no gap* | The `FOR UPDATE` lock makes the order deterministic, but the two connections must be genuinely parallel — `Promise.all` over two `pool.getConnection()` calls, not two sequential awaits. If it ever proves flaky, the assertion to relax is the ordering, never the uniqueness |
| **Long test output** | ~250 assertions of TAP | `node --test --test-reporter=spec`, or `--test-name-pattern workflow` to run one file |
| **Exit codes under `npm test`** | A failing `node --test` returns non-zero | That is the intended signal. Do not pipe through anything that masks it |
| **Attachment cleanup in tests** | A test that uploads a file leaves bytes in `uploads/letters/` | `fixtures.js` gains a `cleanupUploads()` that removes the directories it created, registered in the same self-cleanup registry as `createdNics` (D47) — the registry is the pattern, and forgetting a second registration is the failure mode it already solved once |
| **A colon in a migration comment** | `createMigrationConnection()` inherits `namedPlaceholders: true` from `connectionOptions`, and mysql2 scans the whole file — **comments included** — for `:name` | A prose `/users/:id` in a `--` comment is parsed as a named placeholder and the migration dies with `Named query contains placeholders, but parameters object is undefined`, a message that names neither the comment nor the file's line. Write path parameters in migrations as `<id>`. `002_users.sql:17` and `004_audit_logs.sql:44` still carry this and will break the day those files are re-run from scratch — they are inert today only because `schema_migrations` records them as applied. See Task 2.3's note |

## 11. Risks

| Risk | Impact | Mitigation |
| :-- | :-- | :-- |
| **Two clerks log at the same instant** | Duplicate day stamp, or a `409` on a letter somebody just typed | `SELECT … FOR UPDATE` on the counter row inside the logging transaction (D53), plus `uq_mail_day_stamp` as the backstop. A dedicated concurrency test asserts distinct and contiguous |
| **A burned day-stamp number** | A gap in a legal registry | The counter increment and the insert share a transaction, so a failed insert rolls the counter back. A test asserts no gap after a deliberately failed insert |
| **A TOCTOU transition race** | Two officers complete the same letter; one overwrites the other | D61: `SELECT … FOR UPDATE` plus a conditional `UPDATE … WHERE id = ? AND status = ?`. Zero rows affected → `409`, never a silent overwrite |
| **The state machine is re-derived in Phase 3** | The UI shows buttons the server refuses | Task 2.7 returns `available_actions` from the same table the `PATCH` enforces (D51), so there is one source. Phase 3 renders it rather than recomputing it |
| **The matcher is Latin-only** (D55) | A Sinhala or Tamil subject returns no candidates | Stated in the plan, in `dutyMatcher.js`'s header comment, and in the README. Phase 3's remedy is `Intl.Segmenter` plus bilingual keyword lists — no new dependency, and it is in Phase 3's scope because the UI is where the language requirement becomes visible |
| **`spec §8` implemented as written** | `art` matches "department"; a generic long description outranks a real keyword | D55 fixes all three, with a unit test per fix, because a test per fix is what stops the fixes being undone by a later "simplification" |
| **Seeded attachments have no bytes** | The Phase 3 detail view shows a download that 404s | Stated in Task 2.18 and in §9 check 13, which asserts the `404` rather than papering over it. Committing PDFs to the repo is worse |
| **`has_attachment` drifts from reality** | The registry says a letter has a scan and it does not | D58: written in the same transaction as the attachment rows, on the same connection. Tested for both the success and the rollback path |
| **Unbounded `SELECT *` on a 50 000-letter registry** | The dashboard becomes unusable | Narrow list projection (no note columns), `parsePagination`'s 100-row clamp, six aggregate queries for stats, and an index behind every filter in task 2.6. `EXPLAIN` is checked in the acceptance run on the `Assigned` + `assigned_officer_id` path |
| **Scope creep into Phase 3** | Phase 2 loses its checkpoint value | §2 states the out-of-scope list. A Phase 2 that touches `frontend/`, formats a minute slip, or adds `helmet` has failed |
| **`instruction_type` drifts from the four presets** | Phase 3's chips and the stored values disagree | Not an `ENUM` (Task 2.2), so the API accepts any string. Phase 3 presents the spec's four as presets. Both sides are tolerant, so no migration is needed when the ministry adds a fifth |
| **Uploads are only half-hardened** | A malicious file could be stored | D57 removes the traversal vector at the source (server-generated directory, random name) and the extension allowlist plus size cap go in now. Content inspection, MIME spoofing detection and quarantine are Phase 4 task 4.9, and this phase says so in the README rather than implying uploads are finished |
| **The `409`-vs-`403` distinction is not respected by a client** | A stale page shows "you do not have permission" for a workflow race | D52 states the contract, both directions are tested, and §9 check 8 and 11 pin the two codes. Phase 3's `axiosClient` (task 3.1) normalises on the code |

## 12. Definition of Done

- [ ] Migrations `005`–`009` applied in filename order and idempotent on re-run
- [ ] `mail_records.status` is the spec's 5-value `ENUM`, verbatim, and `MAIL_STATES` matches it (drift test against `information_schema`, as `permissions.test.js` does for roles)
- [ ] `mail_records` has no `attachment_path` column; `mail_attachments` is the only attachment store (D67)
- [ ] `day_stamp_no` matches `^DS/\d{4}/\d{2}/\d{4}$`, is server-generated, and is **contiguous with no gap** after a failed insert
- [ ] Two concurrent inserts produce two distinct stamps (Task 2.4's race test)
- [ ] A client-supplied `day_stamp_no` is a `400` (D53)
- [ ] All five states are reachable, each by the correct role, and every other state pair is refused
- [ ] `Logged → In Progress` is refused — states cannot be skipped (D51)
- [ ] An illegal transition is `409`; a forbidden role is `403`; a letter the caller may not see is `404` (D52)
- [ ] An officer cannot advance a letter assigned to another officer, for **both** officer roles (D70)
- [ ] `completion_date` is set if and only if `status = 'Completed'`
- [ ] Minute authorship comes from the token; a body carrying `author_role`/`author_name` is a `400` (D63)
- [ ] A duty chart cannot be created for a non-officer, and assigning to a non-officer is a `400` (D62)
- [ ] `officer_duties` is unique per `(officer, section)`, and one seeded officer holds duties in more than one section (D49)
- [ ] The matcher is a pure function; its ranking rules are unit-tested with **no database in the test** (D59)
- [ ] A keyword match does not match inside a longer word (`art` ≠ "partial")
- [ ] Duty-description tokens cannot outweigh a direct keyword hit, and stop words score 0 (D55)
- [ ] Zero-score officers are excluded, and `no_candidates` is explicit
- [ ] A Sinhala subject returns no candidates and does not throw
- [ ] `GET /mail` is scoped per role, and a `department_id` parameter is a `400` (D56)
- [ ] Search is parameterised and `%`/`_` in the term are escaped (D64)
- [ ] The list projection omits the two note columns
- [ ] `available_actions` in the detail response matches what the `PATCH` will actually accept
- [ ] `has_attachment` and the `mail_attachments` rows always agree, including after a rollback (D58)
- [ ] Attachments are served **only** by the authorized route; `/uploads/...` is a `404` (D57)
- [ ] Stored filenames are random and the directory is server-generated
- [ ] A rejected upload leaves no file, no row, and no flag
- [ ] `/mail/stats` returns all five status keys, 30 daily points, and is `403` for a SUBJECT_CLERK
- [ ] Six seeded letters, one per resting state, with minutes only where the state implies them
- [ ] Every mail and duty mutation writes an audit row in the same transaction, and a **failed** transition writes none (D20)
- [ ] `npm test` passes with no skips and no new dependency
- [ ] `backend/package.json` still lists exactly the seven spec §10.1 runtime dependencies
- [ ] No file under `frontend/src/` is modified
- [ ] No `vehicles`, `transfers` or `assets` table exists
- [ ] All fourteen §9 checks pass

**Verified, not assumed.** The four claims easiest to tick without proving:

- **"The state machine is enforced"** is proved by *iterating* `MAIL_STATES` in the test and asserting every non-adjacent pair is refused — not by testing two hand-picked cases. A table with one wrong row is invisible to hand-picked tests and obvious to a loop.
- **"The day stamp is collision-safe"** is proved by a genuine two-connection race, not by reading the `FOR UPDATE`. A unique-index backstop alone would make a sequential test pass while the real race returned a `409` to a clerk mid-typing.
- **"Duty-description tokens cannot outweigh keywords"** is proved by a test that gives one officer a long generic description and a competing officer a single direct keyword, and asserts the keyword holder ranks first. The spec's own algorithm fails this test, which is the point of writing it.
- **"Minute authorship cannot be forged"** is proved by asserting the **stored row's** `author_name` matches the token's user, not the request body's. A test that only checks the response is testing nothing — the forgery is in what gets persisted.

## 13. Open Questions

| # | Question | Blocks | Status / default |
| :-- | :-- | :-- | :-- |
| **Q3** | *(inherited)* Are the 5 `mail_records.status` and 3 `priority` values final? | Task 2.1 | **ANSWERED 2026-09-29 — confirmed, used verbatim** (D48) |
| **Q4** | *(inherited)* More than one active duty section per officer, or exactly one? | Task 2.3 | **ANSWERED 2026-09-29 — more than one.** `section_name` stays on `officer_duties`; `users.section_name` remains the officer's home section (D49) |
| **Q17** | *(new)* `official_minutes.instruction_type` — the spec §9.2 four presets only, or free text? | Task 2.2 | **DEFAULT: free text, ≤100 chars, not an `ENUM`.** The ministry adds directives occasionally and an `ENUM` makes that a migration. Phase 3 presents the four as preset chips |
| **Q18** | *(new)* "Overdue" (Task 2.17) — is 30 days the ministry's real threshold? | Task 2.17 | **DEFAULT: 30 days**, a named constant in `mailModel`. The spec defines no threshold, so any number here is a choice; it is one constant to change |
| **Q19** | *(new)* The matcher is Latin-token based, so a Sinhala or Tamil subject scores zero (D55). Should bilingual keyword support land in Phase 2? | Nothing in Phase 2 | **DEFAULT: no.** Phase 2's tests and seeds are English. Phase 3's `Intl.Segmenter` plus bilingual seed keywords is the remedy, and it belongs with the UI where the language requirement first becomes visible. If the ministry demos in Sinhala, this moves into Phase 2 — say so before the phase starts |
| **Q20** | *(new)* Should the demo letters carry real attachment bytes? | Task 2.18 | **DEFAULT: no.** Metadata without files; the acceptance check asserts the `404` honestly. Committing PDFs to the repository is a worse outcome than a demo that uploads one file by hand |
| **Q7** | *(inherited)* Should `Confidential` letters be hidden from SUBJECT_CLERK/OFFICER, or shown redacted? | Nothing in Phase 2 | **OPEN — deferred to Phase 3 (3.15).** Phase 2 implements the *scope* rules in Task 2.6; confidentiality is a filter *within* a scope and belongs where the letter body is first displayed. Flagged because it is a one-line change to the scope predicate and a real access-control decision, so it should not arrive unexamined |
| **Q15** | *(inherited)* Node v22.3.0 is below Vite 8's floor. | Nothing in Phase 2 | **RESOLVED 2026-09-30 — not a blocker.** Vite 8.3.1 prints `Vite requires Node.js version 20.19+ or 22.12+` on `v22.3.0` and then **builds anyway**: `npm --prefix frontend run build` exits 0 and emits `dist/` (91 modules). Verified, not assumed. Phase 3 may start; the upgrade is worth doing to silence the warning but gates nothing |
| **Q16** | *(inherited)* `EXECUTION_PLAN.md` still describes `docker-compose.yml` in four places, which Q1 overturned | Documentation | **OPEN.** Not rewritten, for the reason in `PHASE_0_PLAN.md` §12 |

## 14. Execution Sequence

```
2.1  005_mail_records          ──┐
2.2  006_official_minutes       ──┤ pure schema; mail_records first because both
                                 │  others FK to it
2.3  007_officer_duties         ──┘
2.4  utils/dayStampGenerator.js + 008_day_stamp_counters  (depends on 2.1)
2.12 utils/dutyMatcher.js  ───────── pure, no dependencies — written and unit-tested early
2.11 utils/mailStateMachine.js ──── pure, no dependencies (D51)
2.10 models/mailModel.js  ────┐
2.8  models/minutesModel.js   ──┤ all take the D19 executor parameter
2.14 models/dutyModel.js      ──┘
2.15 migration 009_mail_attachments + middleware/upload.js
2.5  POST /mail  ─────────────────── first end-to-end proof: day stamp, upload, audit
2.6  GET /mail  ·  2.7 GET /mail/:id
2.8  POST /:id/minutes  ──────────── the Logged → Forwarded transition
2.9  POST /:id/assign
2.10 PATCH /:id/status  ──────────── the state machine, live
2.11 PATCH /:id/notes
2.13 GET /:id/suggestions  ───────── depends on 2.12 and 2.3
2.14 officers + duty charts
2.15 POST /:id/attachments  ·  2.16 GET /:id/attachments/:id
2.17 GET /mail/stats
2.18 seeds 003 + 004  ───────────── depends on 2.1–2.3 and every endpoint
2.19 test suite
2.20 README + PHASE_1_PLAN.md status note
───  run §9 acceptance checks  ───

Q19 answered before 2.12 lands, if the demo is in Sinhala or Tamil.
```

**Two orderings that are not negotiable.** The state machine (2.11) precedes every endpoint that mutates status, because the endpoints consume the table and a controller that re-derives the rules is the bug D51 exists to prevent. And 2.4's counter table is a migration, so it lands with the schema block even though the function is written later.

---

**Phase 2 is implemented.** It added no runtime dependency, and every claim in §12 has a named test that would fail if the claim were false.

Two corrections to what this plan predicted, both worth stating plainly rather than leaving a stale plan to mislead the next reader:

- **It did not "touch no frontend file."** The backend landed first, but the plan was then used as the spec for the letter-execution UI, so `frontend/src/` grew `MailDetailPage`, `MailRegistryPage`, `NewMailPage`, `DashboardPage`, `OfficerPage` and `LoginPage`. The check asserting `git diff HEAD --stat -- frontend/` is empty was removed from §9 rather than left to fail.
- **The suite is not safe to run in parallel.** `node --test` runs files concurrently by default, and `users.test.js` arranges its two-admin race by setting `is_active = 0` for *every* active admin and restoring only the set it recorded. A sibling file that creates an admin in that window gets an account left deactivated, permanently, poisoning the next run. `backend/package.json` now passes `--test-concurrency=1`. The cost is roughly 25s to 60s; the alternative is a suite that fails about one run in three and mutates state outside its own fixtures.

**A note on the environment, not the code:** on this machine `npm install`/`npm ci` silently fails to extract native `.node` binaries into `node_modules` — the package directory is created and left empty, and no error is reported, because npm treats a failed *optional* dependency as a successful skip. That is why `npm run lint` can report `Cannot find module '@oxlint/binding-win32-x64-msvc'` on a freshly installed tree. `npm pack` + a manual extraction from the tarball works, so the artefact and the network are both fine. A fresh `npm ci` will break lint again until it is re-extracted by hand; upgrading past Node 22.12 is worth doing, since Vite and the rolldown binding both declare `^20.19.0 || >=22.12.0` and this machine is on 22.3.0.
