jest.mock('../config/prismaClient', () => ({
    __esModule: true,
    default: {},
}));

jest.mock('./underwriterRoutingService', () => ({
    __esModule: true,
    getCachedDesignatedUnderwriterIds: jest.fn(() => [] as string[]),
}));

import {
    buildUnderwriterApplicationVisibilityWhere,
    canUserAccessApplication,
} from './applicationService';
import { getCachedDesignatedUnderwriterIds } from './underwriterRoutingService';

const mockDesignated = getCachedDesignatedUnderwriterIds as jest.MockedFunction<
    typeof getCachedDesignatedUnderwriterIds
>;

const VIEWER = 'viewer-uw';
const DESIGNATED = 'designated-uw';
const SECOND_DESIGNATED = 'second-designated-uw';

const unassignedDeal = {
    referringAgentId: null,
    createdById: null,
    currentQueue: 'Underwriter',
    approvedByUnderwriterId: null,
    assignedUnderwriterId: null,
};

describe('underwriter visibility with Super Admin routing', () => {
    beforeEach(() => {
        mockDesignated.mockReset();
        mockDesignated.mockReturnValue([]);
    });

    it('keeps the default scope when nobody is designated', () => {
        const where = buildUnderwriterApplicationVisibilityWhere(VIEWER);
        expect(where.AND).toBeDefined();
        expect(canUserAccessApplication(unassignedDeal, { id: VIEWER, role: 'UNDERWRITER' })).toBe(
            true,
        );
    });

    it('narrows other underwriters to their own assigned deals', () => {
        mockDesignated.mockReturnValue([DESIGNATED]);
        expect(buildUnderwriterApplicationVisibilityWhere(VIEWER)).toEqual({
            assignedUnderwriterId: VIEWER,
        });
        expect(canUserAccessApplication(unassignedDeal, { id: VIEWER, role: 'UNDERWRITER' })).toBe(
            false,
        );
        expect(
            canUserAccessApplication(
                { ...unassignedDeal, assignedUnderwriterId: VIEWER },
                { id: VIEWER, role: 'UNDERWRITER' },
            ),
        ).toBe(true);
    });

    it('leaves the designated underwriter with the default scope', () => {
        mockDesignated.mockReturnValue([DESIGNATED]);
        const where = buildUnderwriterApplicationVisibilityWhere(DESIGNATED);
        expect(where.AND).toBeDefined();
        expect(
            canUserAccessApplication(unassignedDeal, { id: DESIGNATED, role: 'UNDERWRITER' }),
        ).toBe(true);
    });

    it('gives every underwriter in a multi-selection the default scope', () => {
        mockDesignated.mockReturnValue([DESIGNATED, SECOND_DESIGNATED]);

        for (const id of [DESIGNATED, SECOND_DESIGNATED]) {
            expect(buildUnderwriterApplicationVisibilityWhere(id).AND).toBeDefined();
            expect(canUserAccessApplication(unassignedDeal, { id, role: 'UNDERWRITER' })).toBe(
                true,
            );
        }

        expect(buildUnderwriterApplicationVisibilityWhere(VIEWER)).toEqual({
            assignedUnderwriterId: VIEWER,
        });
        expect(canUserAccessApplication(unassignedDeal, { id: VIEWER, role: 'UNDERWRITER' })).toBe(
            false,
        );
    });
});
