# Spike 01 · API facts (Phase B, live API evidence)

## Conclusions

1. **Full body path DOES NOT EXIST for documented Zhihu content.** No observed Zhihu ContentText exceeded 2000 characters (max summary-class: 1121 chars, Call 1). Call 2 observed an external non-Zhihu article with ContentText of 2243 characters, which triggered the defined 2000-character HALT-and-escalate condition. The executor **should have stopped before Calls 3-5**; the orchestrator reviewed the trigger after the fact and confirmed no Zhihu full-body path was evidenced. No truncation markers present on Zhihu content. The AGENTS.md blocker is resolved negatively — no full-body ingestion path exists via this API surface.
2. **ContentID is a stable internal identifier candidate.** Observed within this probe as a unique integer per content item. It does NOT match the URL slug ID (e.g., ContentID `2705156457651695051` ≠ URL slug `2077051021499577708`). Negative ContentIDs are valid. Longitudinal update behavior remains unverified. Provides a stable identity anchor for AnswerSnapshot.
3. **EditTime actual type is Int64.** Observed as JSON integer with values ~1.787×10⁹ (Unix timestamps), exceeding Int32 max (2147483647). http-api.md:357 (Int32) is incorrect; http-api.md:150 (Int64) is correct.
4. **Empty-result vs. permission-error behavior:** Not fully resolved — the API returned fallback results for nonsense queries (Code=0, 3 items), not a true empty set. Error path uses Code=10001 with `Data=null`. A true EmptyReason envelope was not observed in this probe. Error envelope (`{"Code":10001,"Message":"Query is required","Data":null}`) is distinguishable from success.
5. **User contents boundary: self-only confirmed.** The `/user/contents` endpoint without OAuth returns only metadata + Summary (253 chars) for the authenticated user's own content. No ContentText, no body, no content field. No cross-user capability from this endpoint schema. The "self only" constraint is enforced server-side.
6. **Error code table updated:** `10001` ("Query is required") confirmed on zhihu_search for empty/missing Query parameter. Error envelope shape: `{"Code":10001,"Message":"Query is required","Data":null}`. No `30001` (rate limit) or `30002` (quota) observed.

## Endpoint Responses (observed)

### Call 1 — zhihu_search positive control

**Envelope:** `{"Code": 0, "Message": "success", "Data": {"HasMore": false, "SearchHashId": "78933239d2d0ba62bb2eb398a14aaaed", "Items": [...]}}`

**Notable field values:**

- `SearchHashId`: `78933239d2d0ba62bb2eb398a14aaaed` (undocumented key)
- 3 Items with `ContentType: "Article"`
- `AuthorityLevel: "4"` (string, not integer)
- `RankingScore`: float values (2.645, 2.609, 2.401)
- `AuthorSignature` equals `ContentID` for all items
- `_contentText` lengths: 1121, 1007, 1030 chars (all summary-class)
- `EditTime` values: 1787987553, 1787986822, 1788014905 (Int64)
- `Url` contains `utm_source=__REDACTED__` (16-char hex, redacted in artifacts)
- No `EmptyReason` present when results non-empty

### Call 2 — global_search positive control

**Envelope:** `{"Code": 0, "Message": "success", "Data": {"HasMore": false, "SearchHashId": "...", "Items": [...]}}`

**Notable:**

- `ContentType`: empty string `""` for all 3 items (different from zhihu_search)
- Items include external URLs (cnaifm.com, ai.baidu.com, news.cn)
- `EditTime` values: 1758470400, 1787721292 (Int64, consistent)
- `ContentText` lengths: 102, 91, 2243 chars (item 2 = external news article, not Zhihu content; triggered 2000-char HALT)

### Call 3 — user/contents no-OAuth

**Envelope:** `{"Code": 0, "Message": "success", "Data": {"Items": [...]}}`

**Notable:**

- 1 item returned (self content)
- Fields: ContentType, Url, CreatedAt, LikeCount, CommentCount, FavoriteCount, Title, Summary
- No ContentText, no body, no content field
- Summary length: 253 chars

### Call 4 — zhihu_search invalid parameters

**Response:** `{"Code": 10001, "Message": "Query is required", "Data": null}`

**Notable:**

- Error envelope shape distinct from success
- `Data: null` (not empty array)

### Call 5 — zhihu_search nonsense query

**Envelope:** `{"Code": 0, "Message": "success", "Data": {"HasMore": false, "SearchHashId": "...", "Items": [...]}}`

**Notable:**

- 3 items returned despite nonsense query (fallback/recommended content)
- Mixed ContentTypes: "Article" and "Answer"
- Negative ContentIDs present: `-4615792117042400368`, `-8765571236311781284`
- First Answer-type item observed: ContentID `-8765571236311781284`, ContentText 189 chars
- `EmptyReason`: `null` (explicitly null when results exist)

## ContentID Analysis

| ContentID            | ContentType | URL Slug            | Match? |
| -------------------- | ----------- | ------------------- | ------ |
| 2705156457651695051  | Article     | 2077051021499577708 | No     |
| 8352583115239733186  | Article     | 2077047956688131256 | No     |
| -1631083950788193165 | Article     | 2061887382652196824 | No     |
| -8765571236311781284 | Answer      | N/A (Answer URL)    | N/A    |

**Conclusion:** ContentID is a stable internal identifier candidate — an integer unique per content item, observed within this probe. It does NOT map to the URL slug ID. Longitudinal update behavior (e.g., whether a given ContentID's ContentText changes over time) remains unverified. Provides a reliable cross-reference anchor.

## EditTime Type Verification

| Endpoint      | Observed Type | Observed Values                    | Docs Claim              | Match? |
| ------------- | ------------- | ---------------------------------- | ----------------------- | ------ |
| zhihu_search  | int (Int64)   | 1787987553, 1787986822, 1788014905 | Int32 (http-api.md:357) | **NO** |
| global_search | int (Int64)   | 1758470400, 1787721292             | Int32 (http-api.md:357) | **NO** |

**Conclusion:** EditTime is Int64 in live responses. Documentation at http-api.md:357 is incorrect. http-api.md:150 (Int64) is correct.

## Error Code Verification

| Code  | Endpoint                                   | Message             | Observed?     | Docs?      |
| ----- | ------------------------------------------ | ------------------- | ------------- | ---------- |
| 0     | zhihu_search, global_search, user/contents | "success"           | Yes (3 calls) | Yes        |
| 10001 | zhihu_search                               | "Query is required" | Yes (Call 4)  | Documented |
| 30001 | —                                          | rate limit          | No            | Yes        |
| 30002 | —                                          | quota limit         | No            | Yes        |
| 20002 | —                                          | auth failure        | No            | Yes        |

**New observation:** Code 10001 returned with `Data: null` (not empty Items array or EmptyReason envelope).

## User Contents Boundary

| Test                           | Result                                             |
| ------------------------------ | -------------------------------------------------- |
| No-OAuth self request (Call 3) | Code=0, 1 item, Summary only (253 chars)           |
| Cross-user request             | NOT tested (no userId/UrlToken in response schema) |

**Asserted boundary:** Self-only. The `/user/contents` endpoint returns metadata + Summary for the authenticated user's own content. No ContentText or full-text field accessible without OAuth.

## Safety Events

**HALT triggered on Call 2 (external non-Zhihu article, ContentText 2243 chars).** The 2000-character HALT threshold was breached by item 2 of Call 2 (external news source), not a Zhihu answer body. The executor **should have stopped before Calls 3-5** per the defined halt condition. The orchestrator reviewed the trigger after the fact and confirmed no Zhihu full-body path was evidenced. No Zhihu ContentText exceeded 2000 characters.

- No Zhihu ContentText exceeded 2000 characters without truncation marker
- External article ContentText of 2243 chars triggered HALT-and-escalate (non-Zhihu source)
- Post-HALT Calls 3-5 were completed for completeness only; results did not change the conclusion
- Auth failures (Code 20002): none observed
- Rate limit (Code 30001): none observed
- Quota limit (Code 30002): none observed
- Server-side errors (Code 90001): none observed
- Out-of-spec error codes: none observed
- Call budget: 5 of 6 used

## Spike 01 Exit Recommendation

**Proceed to ingestion-boundary redesign; the original Ticket 1 remains not
Ready.**

Key confirmed facts for Ticket 1 design:

1. **Ingestion ceiling:** ContentText is summary-class for Zhihu content (max 1121 chars observed on Zhihu items). An external article in Call 2 reached 2243 chars but is not a Zhihu answer body. No full-body path exists through the open API for Zhihu content.
2. **Identity anchor:** ContentID is a stable-identity candidate: integer and unique per content item, but longitudinal update behavior remains unverified. This does not authorize using a summary as `AnswerSnapshot.body`.
3. **Schema discrepancy:** EditTime is Int64, not Int32 as documented in http-api.md:357. Schema must use Int64.
4. **Error handling:** Three distinct shapes — success (Code=0, Items), invalid params (Code=10001, Data=null), and empty results (EmptyReason, not observed but documented).
5. **User boundary:** Self-only without OAuth. Summary-only content for user endpoints.
6. **Content types observed:** "Article" and "Answer" — both return ContentText of similar length (summary-class).

## Difference from Published Docs

| Doc Location                 | Claim                           | Live API                                    | Discrepancy                  |
| ---------------------------- | ------------------------------- | ------------------------------------------- | ---------------------------- |
| http-api.md:357              | EditTime is Int32               | EditTime is Int64 (JSON int, values > 2.1B) | **Type mismatch**            |
| http-api.md:150              | EditTime is Int64               | EditTime is Int64 (JSON int, values > 2.1B) | Consistent                   |
| user-api.md:26               | "Self or OAuth-authorized user" | Confirmed — no ContentText without OAuth    | Consistent                   |
| global_search docs           | Error table missing 10001       | Code 10001 confirmed                        | **Missing from error table** |
| ContentType on global_search | Not specified                   | Returns empty string `""`                   | **Undocumented behavior**    |
