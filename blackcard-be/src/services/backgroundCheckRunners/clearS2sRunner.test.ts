import { createClearS2sRunner } from './clearS2sRunner';

describe('createClearS2sRunner', () => {
    it('searches every owner and flags the item when any owner has matches', async () => {
        const search = jest
            .fn()
            .mockResolvedValueOnce({
                environment: 'beta',
                statusCode: '200',
                groupCount: 0,
                groupIds: [],
                personEntityIds: [],
            })
            .mockResolvedValueOnce({
                environment: 'beta',
                statusCode: '200',
                groupCount: 2,
                resultId: 'result-2',
                groupIds: ['group-1', 'group-2'],
                personEntityIds: [],
            });
        const runner = createClearS2sRunner(search);

        const result = await runner.runCheck({
            checkType: 'TLO',
            applicationId: 'application-1',
            subjects: [
                { firstName: 'Jane', lastName: 'One' },
                { firstName: 'John', lastName: 'Two' },
            ],
        });

        expect(search).toHaveBeenCalledTimes(2);
        expect(result.result).toBe('FLAG');
        expect(result.notes).toMatch(/0 possible business matches.*2 possible owner matches/i);
        expect(result.raw).toEqual(
            expect.objectContaining({ ownerCount: 2, groupCount: 2 }),
        );
    });

    it('runs Business Search and includes business matches in the aggregate', async () => {
        const searchPerson = jest.fn().mockResolvedValue({
            environment: 'beta',
            statusCode: '200',
            groupCount: 0,
            groupIds: [],
            personEntityIds: [],
        });
        const searchBusiness = jest.fn().mockResolvedValue({
            environment: 'beta',
            statusCode: '200',
            groupCount: 1,
            resultId: 'business-result',
            groupIds: ['business-group'],
            companyEntityIds: ['company-1'],
        });
        const runner = createClearS2sRunner(searchPerson, searchBusiness);

        const result = await runner.runCheck({
            checkType: 'TLO',
            applicationId: 'application-1',
            businessSubject: { businessName: 'Example LLC' },
            subjects: [{ firstName: 'Jane', lastName: 'Owner' }],
        });

        expect(searchBusiness).toHaveBeenCalledTimes(1);
        expect(searchPerson).toHaveBeenCalledTimes(1);
        expect(result.result).toBe('FLAG');
        expect(result.notes).toMatch(/1 possible business match/i);
    });
});
