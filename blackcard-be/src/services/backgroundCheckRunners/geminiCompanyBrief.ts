/**
 * Company research for the Google background check, using Gemini (gemini-4-argon)
 * with Google Search.
 *
 * Ported from mca-tool's company brief, with two differences:
 *
 * - It works from the application details only (name, address, EIN, website,
 *   owner). It never sees statement figures, so it has no statement-health
 *   section; the AI Analysis tab already covers that.
 *
 * - It runs in two steps. Step one searches with Google and writes plain
 *   findings; Google returns the pages it actually read. Step two turns those
 *   findings into the fixed brief, with no search. A negative finding cites a
 *   source by its number in step one's list, and anything citing a number that
 *   is not on the list is dropped. So every link in the brief is a page Google
 *   really returned. The model never types a URL, so it cannot invent one.
 *   (Asking for search and a fixed JSON shape in one call is reported to come
 *   back without its source list on some Gemini models; two steps avoids that.)
 *
 * The brief reports findings and never recommends funding, declining or an
 * amount. The underwriter still sets the check's result.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function getGeminiBriefConfig() {
    return {
        apiKey: (process.env.GEMINI_API_KEY || '').trim(),
        model: (process.env.GEMINI_BRIEF_MODEL || 'gemini-4-argon').trim(),
        // Research makes several searches and reads what comes back.
        timeoutMs: Number(process.env.GEMINI_BRIEF_TIMEOUT_MS || 240000),
    };
}

export const isGeminiBriefConfigured = () => Boolean(getGeminiBriefConfig().apiKey);

export type CompanyResearchIdentity = {
    businessName: string;
    address: string;
    ein?: string;
    website?: string;
    ownerName?: string;
};

export type CompanyBriefSource = { title: string; url: string };

export type CompanyBrief = {
    identityConfidence: 'confirmed' | 'probable' | 'uncertain' | 'not_found';
    companyProfile: string;
    onlinePresence: string;
    reviewSummary: string;
    negativeFindings: { point: string; url: string; title?: string }[];
    pros: string[];
    cons: string[];
    bottomLine: string;
};

export class CompanyResearchError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 502) {
        super(message);
        this.statusCode = statusCode;
    }
}

const BRIEF_SCHEMA = {
    type: 'object',
    properties: {
        identityConfidence: {
            type: 'string',
            enum: ['confirmed', 'probable', 'uncertain', 'not_found'],
            description:
                "How sure the research is that the company found is the one on the application. 'confirmed' needs the address or website to match.",
        },
        companyProfile: {
            type: 'string',
            description:
                'What the business does, where it operates, roughly how long it has traded, size if known. 2-4 sentences.',
        },
        onlinePresence: {
            type: 'string',
            description:
                'Website, listings, social presence, or the absence of them. 1-3 sentences.',
        },
        reviewSummary: {
            type: 'string',
            description:
                'The overall tenor of customer reviews and roughly how many. 1-3 sentences. Say so if there are none.',
        },
        negativeFindings: {
            type: 'array',
            description:
                'Specific negative items: complaint patterns, lawsuits, liens, regulatory actions, closure notices. Empty if none.',
            items: {
                type: 'object',
                properties: {
                    point: { type: 'string', description: 'One specific finding, in a sentence.' },
                    sourceNumber: {
                        type: 'integer',
                        description: 'The number of the source in the SOURCES list that supports it.',
                    },
                },
                required: ['point', 'sourceNumber'],
            },
        },
        pros: {
            type: 'array',
            description: 'What the research supports. Short phrases, strongest first.',
            items: { type: 'string' },
        },
        cons: {
            type: 'array',
            description: 'What the research argues against. Short phrases, most serious first.',
            items: { type: 'string' },
        },
        bottomLine: {
            type: 'string',
            description:
                'What the research adds up to, in 1-3 sentences. Never recommend funding, declining, or an amount.',
        },
    },
    required: [
        'identityConfidence',
        'companyProfile',
        'onlinePresence',
        'reviewSummary',
        'negativeFindings',
        'pros',
        'cons',
        'bottomLine',
    ],
};

const RESEARCH_INSTRUCTIONS = `You are researching a business for an MCA (merchant cash advance) underwriting file.

Search for the business by the name and address given. Look for: what it actually does, how long it has traded, its size, its website and listings, customer reviews, and anything on the public record: lawsuits, liens, judgments, regulatory actions, complaint patterns, closure or relocation notices.

- Only report what the pages you found say. Never state something from memory.
- Business names repeat. Say clearly whether the address, website or owner match what you were given. If you are working from a name alone, say so.
- If you find nothing about the business, say so plainly. A trading business with no online trace is itself worth noting.
- Report what sources say, attributed: write "BBB lists three unresolved complaints", not "this company does not resolve complaints".
- Do not repeat an allegation as established fact. A filed lawsuit is a filed lawsuit, not a finding of wrongdoing.
- Do not recommend funding, declining or an amount.

Write plain findings in short paragraphs, grouped as: identity match, profile, online presence, reviews, negative items.`;

const FORMAT_INSTRUCTIONS = `You turn research notes about a business into the brief an MCA underwriter reads before pricing.

- Use ONLY the research notes given. Add nothing of your own.
- Every negative finding must cite the number of the source that supports it, from the SOURCES list. If no listed source supports it, leave it out.
- identityConfidence: "confirmed" only when the address or website matches what was given. "probable" or "uncertain" when it is a name match only. "not_found" when the research found nothing.
- Never write that something was "not found" or "not checked" in the findings. If it was not found, it does not appear. identityConfidence is the one exception.
- Pros and cons: short phrases. Do not pad to make the lists even.
- Plain, direct sentences. No hedging, no filler.
- Do not recommend funding, declining or an amount. The underwriter decides.`;

function identityText(identity: CompanyResearchIdentity): string {
    const lines = [`Business name: ${identity.businessName}`, `Business address: ${identity.address}`];
    if (identity.website) lines.push(`Website on the application: ${identity.website}`);
    if (identity.ein) lines.push(`EIN: ${identity.ein}`);
    if (identity.ownerName) lines.push(`Owner: ${identity.ownerName}`);
    return lines.join('\n');
}

async function callGemini(
    cfg: ReturnType<typeof getGeminiBriefConfig>,
    body: Record<string, unknown>,
    signal: AbortSignal,
): Promise<any> {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(cfg.model)}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': cfg.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
    });
    const text = await res.text();
    if (!res.ok) {
        let message = `Gemini returned ${res.status}.`;
        try {
            message = JSON.parse(text)?.error?.message || message;
        } catch {
            /* keep the status message */
        }
        throw new CompanyResearchError(message, res.status === 429 ? 429 : 502);
    }
    return JSON.parse(text);
}

const candidateText = (payload: any): string =>
    (payload?.candidates?.[0]?.content?.parts || [])
        .map((p: any) => (typeof p?.text === 'string' && !p?.thought ? p.text : ''))
        .join('')
        .trim();

/**
 * Google returns its sources as redirect links (vertexaisearch.cloud.google.com/...).
 * Follow each one once to store the real page address, so a saved brief still
 * points somewhere useful after the redirect expires. Falls back to the redirect.
 */
async function resolveSourceUrl(url: string): Promise<string> {
    if (!/grounding-api-redirect/.test(url)) return url;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        const res = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: controller.signal });
        const location = res.headers.get('location');
        return location && /^https?:\/\//i.test(location) ? location : url;
    } catch {
        return url;
    } finally {
        clearTimeout(timer);
    }
}

async function sourcesFrom(payload: any): Promise<CompanyBriefSource[]> {
    const chunks: any[] = payload?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const raw = chunks
        .map((c) => ({ title: String(c?.web?.title || '').trim(), url: String(c?.web?.uri || '').trim() }))
        .filter((s) => s.url);
    const resolved = await Promise.all(
        raw.map(async (s) => ({ title: s.title, url: await resolveSourceUrl(s.url) })),
    );
    // The same page can come back more than once; keep the first.
    const seen = new Set<string>();
    return resolved.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}

const asStringList = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : [];

const CONFIDENCE = ['confirmed', 'probable', 'uncertain', 'not_found'];

export async function writeGeminiCompanyBrief(identity: CompanyResearchIdentity): Promise<{
    brief: CompanyBrief;
    sources: CompanyBriefSource[];
    searchQueries: string[];
    model: string;
}> {
    const cfg = getGeminiBriefConfig();
    if (!cfg.apiKey) {
        throw new CompanyResearchError('Gemini is not configured. Add GEMINI_API_KEY.', 503);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
        // Step one: search with Google and write plain findings.
        const research = await callGemini(
            cfg,
            {
                systemInstruction: { parts: [{ text: RESEARCH_INSTRUCTIONS }] },
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: `Research this business.\n\n${identityText(identity)}` }],
                    },
                ],
                tools: [{ google_search: {} }],
            },
            controller.signal,
        );
        const notes = candidateText(research);
        if (!notes) throw new CompanyResearchError('Gemini returned no research.');
        const sources = await sourcesFrom(research);
        const searchQueries = asStringList(
            research?.candidates?.[0]?.groundingMetadata?.webSearchQueries,
        );

        // Step two: turn the findings into the fixed brief, no search.
        const sourceList = sources.length
            ? sources.map((s, i) => `[${i + 1}] ${s.title || s.url} - ${s.url}`).join('\n')
            : '(none: the search returned no sources, so there can be no negative findings)';
        const formatted = await callGemini(
            cfg,
            {
                systemInstruction: { parts: [{ text: FORMAT_INSTRUCTIONS }] },
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                text:
                                    `The business researched:\n${identityText(identity)}\n\n` +
                                    `RESEARCH NOTES:\n${notes}\n\nSOURCES:\n${sourceList}`,
                            },
                        ],
                    },
                ],
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseJsonSchema: BRIEF_SCHEMA,
                },
            },
            controller.signal,
        );
        const json = candidateText(formatted);
        let parsed: any;
        try {
            parsed = JSON.parse(json);
        } catch {
            throw new CompanyResearchError('Gemini returned a brief that could not be read.');
        }

        // Keep only negative findings that cite a source Google actually returned.
        const negativeFindings = (Array.isArray(parsed?.negativeFindings) ? parsed.negativeFindings : [])
            .map((f: any) => {
                const source = sources[Number(f?.sourceNumber) - 1];
                const point = String(f?.point ?? '').trim();
                return source && point ? { point, url: source.url, title: source.title } : null;
            })
            .filter(Boolean) as CompanyBrief['negativeFindings'];

        const brief: CompanyBrief = {
            identityConfidence: CONFIDENCE.includes(parsed?.identityConfidence)
                ? parsed.identityConfidence
                : 'uncertain',
            companyProfile: String(parsed?.companyProfile ?? '').trim(),
            onlinePresence: String(parsed?.onlinePresence ?? '').trim(),
            reviewSummary: String(parsed?.reviewSummary ?? '').trim(),
            negativeFindings,
            pros: asStringList(parsed?.pros),
            cons: asStringList(parsed?.cons),
            bottomLine: String(parsed?.bottomLine ?? '').trim(),
        };
        return { brief, sources, searchQueries, model: cfg.model };
    } catch (e: any) {
        if (e instanceof CompanyResearchError) throw e;
        if (e?.name === 'AbortError') {
            throw new CompanyResearchError('The research did not finish in time.', 504);
        }
        throw new CompanyResearchError('Could not reach Gemini.', 502);
    } finally {
        clearTimeout(timer);
    }
}
