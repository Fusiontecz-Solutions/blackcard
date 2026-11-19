# Thomson Reuters CLEAR S2S configuration

The runtime reads credentials from environment variables. Do not commit user
passwords, certificate passwords, or `.pfx` files.

```dotenv
CLEAR_S2S_ENV=beta
CLEAR_S2S_USERNAME=
CLEAR_S2S_PASSWORD=
CLEAR_S2S_CERT_PATH=src/utils/CLEAR_Connection_Info/Quality_S2S_Beta.pfx
CLEAR_S2S_CERT_PASSWORD=
CLEAR_S2S_GLB_PURPOSE=
CLEAR_S2S_DPPA_PURPOSE=
CLEAR_S2S_VOTER_PURPOSE=
CLEAR_S2S_TIMEOUT_MS=30000
```

The three permissible-purpose values must match the organization's approved
use and Thomson Reuters agreement; the application deliberately has no
defaults for them. Production must use the production user, password, and
certificate together.

The integration calls:

1. `POST /v2/business/searchResults` (criteria: business name + FEIN/EIN only)
2. `GET /v2/business/searchResults/{id}?resultType=xml`
3. `POST /v3/person/searchResults` for each application owner (criteria: first + last + SSN only)
4. `GET /v3/person/searchResults/{id}?resultType=xml`
5. `POST /v2/businessReport/reportResults` (first business `GroupID`, when present)
6. `GET /v2/businessReport/reportResults/{id}?reportType=pdf`
7. `GET /v2/businessReport/reportResults/{id}?reportType=xml` (best-effort Lien/Judgment parse)
8. `POST /v2/personReport/reportResults` (up to 3 unique person `GroupID`s)
9. `GET /v2/personReport/reportResults/{id}?reportType=pdf`
10. `GET /v2/personReport/reportResults/{id}?reportType=xml` (best-effort Lien/Judgment parse → CLEAR panel)

Report requests use namespace `http://clear.thomsonreuters.com/api/report/2.0`,
person criteria `com/thomsonreuters/schemas/person-report`, business criteria
`com/thomsonreuters/schemas/company-report`, `ReportChoice` `Business` /
`Individual`, person sections (including `WorkAffiliationSection` and
`CorporateSection`; Thomson Reuters confirmed Individual + CorporateSection
is valid), business `CorporateSection`, and `WorldCheckSection` set to
`false`. Do not send `UCCFilingsSection` on business reports — the company-report
XSD rejects it with `400` / `40002`. PDF GETs poll through interim XML statuses
`204` (with no sub-status) and `70001` (not ready) for about 60 seconds; a `204`
carrying an error sub-status such as `40002` is terminal, not pending.

A business search hit can be too thin to back a report (`204` / `40002`, "The
results you have selected does not provide enough information to order a
report") — name-only hits with no address are rejected. Business results also
nest `GroupId` on the parent group element rather than inside each result, so
hits are zipped back to their group IDs in document order. Report candidates are
then ordered by how much address detail CLEAR returned, and we try up to three,
moving to the next one only on that specific error. Report
API failures (including 403 entitlement) do not fail the CLEAR search run;
errors are stored on the item under `metadata.reports` and noted for review.
Successful PDFs are uploaded to Cloudinary (`ih-crm/background-checks`) and
attached to the TLO background-check item.

To capture a full Person Report request/response for Thomson Reuters support,
run `scripts/probe-clear-person-report-corporate.ts` from an **approved US
egress host only** (never from an Indian / unapproved IP). The script refuses
to call CLEAR unless `CLEAR_PROBE_ALLOW_LOCAL=1` is set.

Authentication uses HTTP Basic Auth and the Thomson Reuters-issued PKCS#12
client certificate (mutual TLS). The application stores only result counts and
identifiers, not raw CLEAR XML or submitted SSNs.
