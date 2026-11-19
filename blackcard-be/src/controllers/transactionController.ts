// @ts-nocheck
import type { Request, Response } from 'express';
import prisma from '../config/prismaClient';

const mapTransactionToApi = (txn: any) => {
    if (!txn) return txn;

    const { id, monthId, month, category, amount, notes, createdAt, updatedAt, ...rest } = txn;

    const mappedMonth =
        month &&
        ({
            _id: month.id,
            id: month.id,
            monthName: month.monthName,
            date: month.date,
            amount: month.amount,
            application: month.applicationId,
        } as any);

    return {
        ...rest,
        _id: id,
        id,
        monthId: mappedMonth || monthId,
        category,
        amount,
        notes,
        createdAt,
        updatedAt,
    };
};

class TransactionController {
    // Add a single transaction
    async addTransaction(req: Request, res: Response) {
        try {
            const { monthId, category, amount, notes } = req.body;

            // Validate required fields
            if (!monthId || !category || amount === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'monthId, category, and amount are required',
                });
            }

            // Verify month exists
            const monthExists = await prisma.month.findUnique({ where: { id: monthId } });
            if (!monthExists) {
                return res.status(404).json({
                    success: false,
                    message: 'Month not found',
                });
            }

            // Parse amount to number
            const amountNum = typeof amount === 'string' 
                ? parseFloat(amount.replace(/[^0-9.-]+/g, '')) 
                : Number(amount);

            if (isNaN(amountNum)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid amount format',
                });
            }

            const transaction = await prisma.monthlyTransaction.create({
                data: {
                    monthId,
                    category: category.trim(),
                    amount: amountNum,
                    notes: notes ? notes.trim() : '',
                },
                include: {
                    month: {
                        select: { id: true, monthName: true, date: true, amount: true, applicationId: true },
                    },
                },
            });

            const populatedTransaction = mapTransactionToApi(transaction);

            return res.status(201).json({
                success: true,
                message: 'Transaction created successfully',
                data: populatedTransaction,
            });
        } catch (error) {
            console.error('Add transaction error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Bulk add multiple transactions at once
    async bulkAddTransactions(req: Request, res: Response) {
        try {
            const { monthId, transactions } = req.body;

            // Validate required fields
            if (!monthId || !transactions || !Array.isArray(transactions) || transactions.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'monthId and transactions array are required',
                });
            }

            // Verify month exists
            const monthExists = await prisma.month.findUnique({ where: { id: monthId } });
            if (!monthExists) {
                return res.status(404).json({
                    success: false,
                    message: 'Month not found',
                });
            }

            // Validate and prepare transaction data
            const transactionsData = transactions.map((txn: any) => {
                if (!txn.category || txn.amount === undefined) {
                    throw new Error('Each transaction must have category and amount');
                }

                const amountNum = typeof txn.amount === 'string' 
                    ? parseFloat(txn.amount.replace(/[^0-9.-]+/g, '')) 
                    : Number(txn.amount);

                if (isNaN(amountNum)) {
                    throw new Error('Invalid amount format in transactions');
                }

                return {
                    monthId,
                    category: txn.category.trim(),
                    amount: amountNum,
                    notes: txn.notes ? txn.notes.trim() : '',
                };
            });

            // Create all transactions and return them populated
            const createdTransactions = await Promise.all(
                transactionsData.map((data: any) =>
                    prisma.monthlyTransaction.create({
                        data,
                        include: {
                            month: {
                                select: { id: true, monthName: true, date: true, amount: true, applicationId: true },
                            },
                        },
                    }),
                ),
            );

            const populatedTransactions = createdTransactions.map(mapTransactionToApi);

            return res.status(201).json({
                success: true,
                message: `${createdTransactions.length} transaction(s) created successfully`,
                data: populatedTransactions,
            });
        } catch (error: any) {
            console.error('Bulk add transactions error:', error);
            if (error.message && (error.message.includes('must have') || error.message.includes('Invalid amount'))) {
                return res.status(400).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Update a transaction
    async updateTransaction(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { monthId, category, amount, notes } = req.body;

            const transaction = await prisma.monthlyTransaction.findUnique({ where: { id } });

            if (!transaction) {
                return res.status(404).json({
                    success: false,
                    message: 'Transaction not found',
                });
            }

            const data: any = {};

            // Verify month exists if being updated
            if (monthId) {
                const monthExists = await prisma.month.findUnique({ where: { id: monthId } });
                if (!monthExists) {
                    return res.status(404).json({
                        success: false,
                        message: 'Month not found',
                    });
                }
                data.monthId = monthId;
            }

            // Update fields if provided
            if (category !== undefined) {
                data.category = category.trim();
            }
            if (amount !== undefined) {
                const amountNum =
                    typeof amount === 'string'
                        ? parseFloat(amount.replace(/[^0-9.-]+/g, ''))
                        : Number(amount);
                if (isNaN(amountNum)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid amount format',
                    });
                }
                data.amount = amountNum;
            }
            if (notes !== undefined) {
                data.notes = notes.trim();
            }

            const updatedRecord = await prisma.monthlyTransaction.update({
                where: { id },
                data,
                include: {
                    month: {
                        select: { id: true, monthName: true, date: true, amount: true, applicationId: true },
                    },
                },
            });

            const updatedTransaction = mapTransactionToApi(updatedRecord);

            return res.status(200).json({
                success: true,
                message: 'Transaction updated successfully',
                data: updatedTransaction,
            });
        } catch (error) {
            console.error('Update transaction error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Delete a transaction
    async deleteTransaction(req: Request, res: Response) {
        try {
            const { id } = req.params;

            try {
                await prisma.monthlyTransaction.delete({ where: { id } });
            } catch (error: any) {
                if (error.code === 'P2025') {
                    return res.status(404).json({
                        success: false,
                        message: 'Transaction not found',
                    });
                }
                throw error;
            }

            return res.status(200).json({
                success: true,
                message: 'Transaction deleted successfully',
            });
        } catch (error) {
            console.error('Delete transaction error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Get all transactions for a specific month — no role-based filtering; Agent and Scrubbing see same data for the same monthId
    async getTransactionsByMonth(req: Request, res: Response) {
        try {
            const { monthId } = req.query;

            if (!monthId) {
                return res.status(400).json({
                    success: false,
                    message: 'monthId query parameter is required',
                });
            }

            // Verify month exists
            const monthExists = await prisma.month.findUnique({ where: { id: String(monthId) } });
            if (!monthExists) {
                return res.status(404).json({
                    success: false,
                    message: 'Month not found',
                });
            }

            const transactionsRecords = await prisma.monthlyTransaction.findMany({
                where: { monthId: String(monthId) },
                include: {
                    month: {
                        select: { id: true, monthName: true, date: true, amount: true, applicationId: true },
                    },
                },
                orderBy: { createdAt: 'asc' },
            });

            const transactions = transactionsRecords.map(mapTransactionToApi);

            return res.status(200).json({
                success: true,
                data: transactions,
            });
        } catch (error) {
            console.error('Get transactions by month error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Get transaction by ID (bonus method)
    async getTransactionById(req: Request, res: Response) {
        try {
            const { id } = req.params;

            const transactionRecord = await prisma.monthlyTransaction.findUnique({
                where: { id },
                include: {
                    month: {
                        select: { id: true, monthName: true, date: true, amount: true, applicationId: true },
                    },
                },
            });

            if (!transactionRecord) {
                return res.status(404).json({
                    success: false,
                    message: 'Transaction not found',
                });
            }

            return res.status(200).json({
                success: true,
                data: mapTransactionToApi(transactionRecord),
            });
        } catch (error) {
            console.error('Get transaction by id error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }
}

const transactionController = new TransactionController();
export default transactionController;

