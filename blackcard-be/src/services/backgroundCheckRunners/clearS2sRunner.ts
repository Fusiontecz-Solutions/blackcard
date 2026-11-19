import {
    ClearBusinessSearchSubject,
    ClearPersonSearchSubject,
    searchClearBusiness,
    searchClearPerson,
} from './clearS2sClient';
import type { BackgroundCheckRunner } from './index';

type ClearRunnerInput = {
    applicationId?: unknown;
    businessSubject?: ClearBusinessSearchSubject;
    subject?: ClearPersonSearchSubject;
    subjects?: ClearPersonSearchSubject[];
};

export function createClearS2sRunner(
    searchPerson: typeof searchClearPerson = searchClearPerson,
    searchBusiness: typeof searchClearBusiness = searchClearBusiness,
): BackgroundCheckRunner {
    return {
        async runCheck(item) {
            const clearItem = item as unknown as ClearRunnerInput;
            const subjects = clearItem.subjects?.length
                ? clearItem.subjects
                : clearItem.subject
                  ? [clearItem.subject]
                  : [];
            if (!subjects.length) {
                throw new Error('CLEAR Person Search subject data is missing.');
            }

            const applicationId = String(clearItem.applicationId ?? 'application');
            const businessResponse = clearItem.businessSubject
                ? await searchBusiness(
                      clearItem.businessSubject,
                      `Ocean ${applicationId} Business`,
                  )
                : undefined;
            const personResponses = [];
            for (const [index, subject] of subjects.entries()) {
                const response = await searchPerson(
                    subject,
                    `Ocean ${applicationId} O${index + 1}`,
                );
                const ownerId = String(subject.ownerId ?? '').trim();
                personResponses.push({
                    ...response,
                    ownerId: ownerId || undefined,
                    ownerIndex: index,
                    ownerName: `${subject.firstName} ${subject.lastName}`.trim(),
                });
            }
            const personGroupCount = personResponses.reduce(
                (total, response) => total + response.groupCount,
                0,
            );
            const businessGroupCount = businessResponse?.groupCount ?? 0;
            const groupCount = businessGroupCount + personGroupCount;
            const hasMatches = groupCount > 0;

            return {
                // A public-record match is never treated as an automatic failure.
                // It is flagged for an underwriter to review.
                result: hasMatches ? 'FLAG' : 'PASS',
                notes: hasMatches
                    ? `CLEAR returned ${businessGroupCount} possible business match${businessGroupCount === 1 ? '' : 'es'} and ${personGroupCount} possible owner match${personGroupCount === 1 ? '' : 'es'}; manual review is required.`
                    : `CLEAR Business Search and Person Search completed for ${subjects.length} owner${subjects.length === 1 ? '' : 's'} with no matching records.`,
                raw: {
                    provider: 'Thomson Reuters CLEAR',
                    operations: ['Business Search v2', 'Person Search v3'],
                    searchedAt: new Date().toISOString(),
                    ownerCount: subjects.length,
                    groupCount,
                    businessSearch: businessResponse,
                    personSearches: personResponses,
                },
            };
        },
    };
}
