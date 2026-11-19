import type { Request, Response } from 'express';
import prisma from '../config/prismaClient';
import type { AuthenticatedUser } from '../services/applicationService';
import {
    buildOwnerCreateData,
    buildPrimaryOwnerFlatFields,
    mapClientToApi,
    normalizeOwnerOnlyInput,
    normalizeOwnersInput,
    resolveOwnersForCreate,
} from '../utils/clientMapper';
import {
    syncClientDisplayNameToApplications,
    syncClientToContractPrefill,
} from '../services/clientContractPrefillSync';

const getAuthenticatedUser = (req: Request): AuthenticatedUser | null => {
    const user = req.user;
    if (!user) return null;
    return {
        id: user.id,
        role: user.role as AuthenticatedUser['role'],
    };
};

const isAgentRole = (role: string | null | undefined): boolean =>
    String(role ?? '')
        .trim()
        .toUpperCase()
        .replace(/-/g, '_') === 'AGENT';

const CLIENT_INCLUDE = {
    createdBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
    },
    assignedTo: {
        select: { id: true, firstName: true, lastName: true, email: true },
    },
    owners: {
        orderBy: { sortOrder: 'asc' as const },
    },
};

const collectOwnerSsns = (owners: ReturnType<typeof normalizeOwnersInput>) =>
    owners
        .map((owner) => (owner.ssn ? String(owner.ssn).trim() : ''))
        .filter(Boolean);

const findDuplicateSsnClient = async (ssns: string[], excludeClientId?: string) => {
    if (!ssns.length) return null;

    const ownerMatch = await prisma.clientOwner.findFirst({
        where: {
            ssn: { in: ssns },
            ...(excludeClientId ? { clientId: { not: excludeClientId } } : {}),
        },
        include: { client: { select: { clientId: true } } },
    });

    if (ownerMatch) return ownerMatch.client;

    return prisma.client.findFirst({
        where: {
            ownerSsn: { in: ssns },
            ...(excludeClientId ? { NOT: { id: excludeClientId } } : {}),
        },
    });
};

class ClientController {
    // Create a new client
    async create(req: Request, res: Response) {
        try {
            const { business, notes, assignedTo } = req.body;
            const owners = resolveOwnersForCreate(req.body);

            if (!business?.name || !owners.length || !owners[0]?.firstName) {
                return res.status(400).json({
                    success: false,
                    message: 'Business name and at least one owner with first name are required',
                });
            }

            const businessAddress = {
                address1: business.address?.address1 || '',
                address2: business.address?.address2 || '',
                city: business.address?.city || '',
                state: business.address?.state || '',
                zipCode: business.address?.zipCode || '',
            };

            const businessData: any = {
                name: business.name,
                email: business.email,
                number: business.number,
                website: business.website,
                incorporationDate: business.incorporationDate
                    ? new Date(business.incorporationDate)
                    : undefined,
                incorporationState: business.incorporationState,
                businessEntityType: business.businessEntityType,
                einNumber: business.einNumber,
                annualRevenue: business.annualRevenue != null ? Number(business.annualRevenue) : undefined,
                monthlyRevenue: business.monthlyRevenue != null ? Number(business.monthlyRevenue) : undefined,
                address: businessAddress,
            };

            const ownerSsns = collectOwnerSsns(owners);
            const duplicateClient = await findDuplicateSsnClient(ownerSsns);
            if (duplicateClient) {
                console.warn(
                    'Duplicate client creation attempt detected for SSN. existing clientId:',
                    duplicateClient.clientId,
                );
                return res.status(409).json({
                    success: false,
                    message: 'Client already exists with this SSN.',
                });
            }

            const authUser = getAuthenticatedUser(req);
            const effectiveAssignedTo =
                assignedTo ||
                (authUser && isAgentRole(authUser.role) ? authUser.id : null);

            const primaryOwnerFields = buildPrimaryOwnerFlatFields(owners[0]);

            const client = await prisma.client.create({
                data: {
                    businessName: businessData.name,
                    businessEmail: businessData.email || null,
                    businessNumber: businessData.number || null,
                    businessWebsite: businessData.website || null,
                    businessIncorporationDate: businessData.incorporationDate || null,
                    businessIncorporationState: businessData.incorporationState || null,
                    businessEntityType: businessData.businessEntityType || null,
                    businessEinNumber: businessData.einNumber || null,
                    businessAnnualRevenue: businessData.annualRevenue ?? null,
                    businessMonthlyRevenue: businessData.monthlyRevenue ?? null,
                    businessAddress1: businessAddress.address1 || null,
                    businessAddress2: businessAddress.address2 || null,
                    businessCity: businessAddress.city || null,
                    businessState: businessAddress.state || null,
                    businessZipCode: businessAddress.zipCode || null,
                    ...primaryOwnerFields,
                    notes: notes || null,
                    assignedToId: effectiveAssignedTo || null,
                    createdById: authUser?.id || null,
                    owners: {
                        create: owners.map((owner, index) => buildOwnerCreateData(owner, index)),
                    },
                },
                include: CLIENT_INCLUDE,
            });

            return res.status(201).json({
                success: true,
                message: 'Client created successfully',
                data: mapClientToApi(client),
            });
        } catch (error: any) {
            console.error('Create client error:', error);
            const code = error?.code;
            if (code === 'P2002') {
                return res.status(409).json({
                    success: false,
                    message: 'Client already exists with this SSN.',
                });
            }
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Get all clients with pagination and filters (all authenticated roles see the full list)
    async getAll(req: Request, res: Response) {
        try {
            const {
                page = 1,
                limit = 10,
                status,
                search,
                sortBy = 'createdAt',
                sortOrder = 'desc',
            } = req.query;

            const pageNum = Number(page);
            const limitNum = Number(limit);
            const skip = (pageNum - 1) * limitNum;

            let where: any = {};

            if (status) {
                where.status = status;
            }

            if (search) {
                const searchStr = String(search);
                where.OR = [
                    { businessName: { contains: searchStr, mode: 'insensitive' } },
                    { businessEmail: { contains: searchStr, mode: 'insensitive' } },
                    { ownerFirstName: { contains: searchStr, mode: 'insensitive' } },
                    { ownerLastName: { contains: searchStr, mode: 'insensitive' } },
                    { ownerEmail: { contains: searchStr, mode: 'insensitive' } },
                    {
                        owners: {
                            some: {
                                OR: [
                                    { firstName: { contains: searchStr, mode: 'insensitive' } },
                                    { lastName: { contains: searchStr, mode: 'insensitive' } },
                                    { email: { contains: searchStr, mode: 'insensitive' } },
                                ],
                            },
                        },
                    },
                ];
            }

            let orderByField: string = 'createdAt';
            if (sortBy === 'createdAt' || sortBy === 'clientId') {
                orderByField = String(sortBy);
            }
            const orderBy: any = { [orderByField]: sortOrder === 'asc' ? 'asc' : 'desc' };

            const [clients, total] = await Promise.all([
                prisma.client.findMany({
                    where,
                    orderBy,
                    skip,
                    take: limitNum,
                    include: {
                        assignedTo: {
                            select: { id: true, firstName: true, lastName: true, email: true },
                        },
                        owners: {
                            orderBy: { sortOrder: 'asc' },
                        },
                    },
                }),
                prisma.client.count({ where }),
            ]);

            return res.status(200).json({
                success: true,
                data: clients.map(mapClientToApi),
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(total / limitNum),
                    totalItems: total,
                    itemsPerPage: limitNum,
                },
            });
        } catch (error) {
            console.error('Get all clients error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Get single client by ID
    async getById(req: Request, res: Response) {
        try {
            const { id } = req.params;

            const client = await prisma.client.findUnique({
                where: { id },
                include: CLIENT_INCLUDE,
            });

            if (!client) {
                return res.status(404).json({
                    success: false,
                    message: 'Client not found',
                });
            }

            return res.status(200).json({
                success: true,
                data: mapClientToApi(client),
            });
        } catch (error) {
            console.error('Get client by ID error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Get client by clientId (numeric ID)
    async getByClientId(req: Request, res: Response) {
        try {
            const { clientId } = req.params;

            const client = await prisma.client.findUnique({
                where: { clientId: Number(clientId) },
                include: CLIENT_INCLUDE,
            });

            if (!client) {
                return res.status(404).json({
                    success: false,
                    message: 'Client not found',
                });
            }

            return res.status(200).json({
                success: true,
                data: mapClientToApi(client),
            });
        } catch (error) {
            console.error('Get client by clientId error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Update client
    async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { business, status, notes, assignedTo } = req.body;
            const owners = normalizeOwnersInput(req.body);
            const ownerOnly = normalizeOwnerOnlyInput(req.body);

            const client = await prisma.client.findUnique({
                where: { id },
                include: {
                    owners: {
                        select: { ssn: true },
                        orderBy: { sortOrder: 'asc' },
                    },
                },
            });

            if (!client) {
                return res.status(404).json({
                    success: false,
                    message: 'Client not found',
                });
            }

            const existingOwnerSsns = new Set(
                [
                    ...((client as { owners?: Array<{ ssn?: string | null }> }).owners || []).map(
                        (o) => String(o.ssn || '').trim(),
                    ),
                    String((client as { ownerSsn?: string | null }).ownerSsn || '').trim(),
                ].filter(Boolean),
            );

            const updateData: any = {};

            if (business) {
                if (business.name !== undefined) updateData.businessName = business.name;
                if (business.email !== undefined) updateData.businessEmail = business.email;
                if (business.number !== undefined) updateData.businessNumber = business.number;
                if (business.website !== undefined) updateData.businessWebsite = business.website;
                if (business.incorporationDate !== undefined) {
                    updateData.businessIncorporationDate = business.incorporationDate
                        ? new Date(business.incorporationDate)
                        : null;
                }
                if (business.incorporationState !== undefined) updateData.businessIncorporationState = business.incorporationState;
                if (business.businessEntityType !== undefined) updateData.businessEntityType = business.businessEntityType;
                if (business.einNumber !== undefined) updateData.businessEinNumber = business.einNumber;
                if (business.annualRevenue !== undefined && String(business.annualRevenue).trim() !== '') {
                    updateData.businessAnnualRevenue = Number(business.annualRevenue);
                }
                if (business.monthlyRevenue !== undefined && String(business.monthlyRevenue).trim() !== '') {
                    updateData.businessMonthlyRevenue = Number(business.monthlyRevenue);
                }

                if (business.address?.address1 !== undefined) updateData.businessAddress1 = business.address.address1;
                if (business.address?.address2 !== undefined) updateData.businessAddress2 = business.address.address2;
                if (business.address?.city !== undefined) updateData.businessCity = business.address.city;
                if (business.address?.state !== undefined) updateData.businessState = business.address.state;
                if (business.address?.zipCode !== undefined) updateData.businessZipCode = business.address.zipCode;
            }

            const applyOwnerSsnGuard = async (owner: { ssn?: string }) => {
                if (owner.ssn === undefined) return true;
                const newSsn = String(owner.ssn).trim();
                if (!newSsn) return true;
                // Unchanged SSN on this client is fine even if another client shares it.
                if (existingOwnerSsns.has(newSsn)) return true;
                const existingWithSsn = await findDuplicateSsnClient([newSsn], id);
                if (!existingWithSsn) return true;
                return false;
            };

            if (owners.length > 0) {
                const changedSsns = collectOwnerSsns(owners).filter(
                    (ssn) => !existingOwnerSsns.has(ssn),
                );
                const duplicateClient = await findDuplicateSsnClient(changedSsns, id);
                if (duplicateClient) {
                    console.warn(
                        'Duplicate client SSN update attempt detected. existing clientId:',
                        duplicateClient.clientId,
                    );
                    return res.status(409).json({
                        success: false,
                        message: 'Client already exists with this SSN.',
                    });
                }

                Object.assign(updateData, buildPrimaryOwnerFlatFields(owners[0]));
            } else if (ownerOnly) {
                const owner = ownerOnly;

                if (!(await applyOwnerSsnGuard(owner))) {
                    return res.status(409).json({
                        success: false,
                        message: 'Client already exists with this SSN.',
                    });
                }

                if (owner.firstName !== undefined) updateData.ownerFirstName = owner.firstName;
                if (owner.middleName !== undefined) updateData.ownerMiddleName = owner.middleName;
                if (owner.lastName !== undefined) updateData.ownerLastName = owner.lastName;
                if (owner.email !== undefined) updateData.ownerEmail = owner.email;
                if (owner.mobileNumber !== undefined) updateData.ownerMobileNumber = owner.mobileNumber;
                if (owner.dateOfBirth !== undefined) {
                    updateData.ownerDateOfBirth = owner.dateOfBirth ? new Date(owner.dateOfBirth) : null;
                }
                if (owner.ssn !== undefined) updateData.ownerSsn = owner.ssn;
                if (owner.ficoScore !== undefined) updateData.ownerFicoScore = Number(owner.ficoScore);
                if (owner.ownershipStartDate !== undefined) {
                    updateData.ownerOwnershipStartDate = owner.ownershipStartDate
                        ? new Date(owner.ownershipStartDate)
                        : null;
                }
                if (owner.ownershipPercentage !== undefined) {
                    updateData.ownerOwnershipPercentage = Number(owner.ownershipPercentage);
                }

                if (owner.address?.address1 !== undefined) updateData.ownerAddress1 = owner.address.address1;
                if (owner.address?.address2 !== undefined) updateData.ownerAddress2 = owner.address.address2;
                if (owner.address?.city !== undefined) updateData.ownerCity = owner.address.city;
                if (owner.address?.state !== undefined) updateData.ownerState = owner.address.state;
                if (owner.address?.zipCode !== undefined) updateData.ownerZipCode = owner.address.zipCode;
            }

            if (status !== undefined) updateData.status = status;
            if (notes !== undefined) updateData.notes = notes;
            if (assignedTo !== undefined) updateData.assignedToId = assignedTo;

            const updatedClient = await prisma.$transaction(async (tx) => {
                if (owners.length > 0) {
                    await tx.clientOwner.deleteMany({ where: { clientId: id } });
                    await tx.clientOwner.createMany({
                        data: owners.map((owner, index) => ({
                            clientId: id,
                            ...buildOwnerCreateData(owner, index),
                        })),
                    });
                } else if (ownerOnly) {
                    const primaryData = buildOwnerCreateData(ownerOnly, 0);
                    const existingPrimary = await tx.clientOwner.findFirst({
                        where: { clientId: id },
                        orderBy: { sortOrder: 'asc' },
                    });
                    if (existingPrimary) {
                        await tx.clientOwner.update({
                            where: { id: existingPrimary.id },
                            data: primaryData,
                        });
                    } else {
                        await tx.clientOwner.create({
                            data: {
                                clientId: id,
                                ...primaryData,
                            },
                        });
                    }
                }

                return tx.client.update({
                    where: { id },
                    data: updateData,
                    include: CLIENT_INCLUDE,
                });
            });

            try {
                await syncClientToContractPrefill(id);
            } catch (syncErr) {
                console.error('syncClientToContractPrefill failed:', syncErr);
            }

            // List "Business Name" prefers Application.dealDisplayName — keep it in lockstep
            // with Client.businessName when Overview / any updateClient path saves.
            if (
                updateData.businessName !== undefined &&
                String(updateData.businessName ?? '').trim()
            ) {
                try {
                    await syncClientDisplayNameToApplications(id);
                } catch (syncErr) {
                    console.error('syncClientDisplayNameToApplications failed:', syncErr);
                }
            }

            return res.status(200).json({
                success: true,
                message: 'Client updated successfully',
                data: mapClientToApi(updatedClient),
            });
        } catch (error) {
            console.error('Update client error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Delete client
    async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;

            const client = await prisma.client.delete({ where: { id } });

            if (!client) {
                return res.status(404).json({
                    success: false,
                    message: 'Client not found',
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Client deleted successfully',
            });
        } catch (error) {
            console.error('Delete client error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Update client status
    async updateStatus(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { status } = req.body;

            if (!status || !['Active', 'Inactive', 'Pending', 'Archived'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid status is required (Active, Inactive, Pending, Archived)',
                });
            }

            const client = await prisma.client.update({
                where: { id },
                data: { status },
                include: CLIENT_INCLUDE,
            });

            if (!client) {
                return res.status(404).json({
                    success: false,
                    message: 'Client not found',
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Client status updated successfully',
                data: mapClientToApi(client),
            });
        } catch (error) {
            console.error('Update client status error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }
}

const clientController = new ClientController();
export default clientController;
