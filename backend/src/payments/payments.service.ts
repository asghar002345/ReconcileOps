import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import type { PaymentListItem, PaymentPage } from './payments.types.js';

export type ListPaymentsArgs = {
  workspaceId: string;
  page: number;
  pageSize: number;
  cursorPaidAt?: string;
  cursorSourcePaymentId?: string;
};

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPayments(args: ListPaymentsArgs): Promise<PaymentPage> {
    const useKeyset =
      Boolean(args.cursorPaidAt) && Boolean(args.cursorSourcePaymentId);

    if (useKeyset) {
      return this.listKeyset(
        args.workspaceId,
        args.pageSize,
        new Date(args.cursorPaidAt!),
        args.cursorSourcePaymentId!,
      );
    }

    return this.listOffset(args.workspaceId, args.page, args.pageSize);
  }

  private async listOffset(
    workspaceId: string,
    page: number,
    pageSize: number,
  ): Promise<PaymentPage> {
    const where = { workspaceId };
    const skip = (page - 1) * pageSize;

    const [totalItems, rows] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        orderBy: [{ paidAt: 'asc' }, { sourcePaymentId: 'asc' }],
        skip,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => this.toItem(row)),
      page,
      pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
      mode: 'offset',
    };
  }

  private async listKeyset(
    workspaceId: string,
    pageSize: number,
    cursorPaidAt: Date,
    cursorSourcePaymentId: string,
  ): Promise<PaymentPage> {
    const where: Prisma.PaymentWhereInput = {
      workspaceId,
      OR: [
        { paidAt: { gt: cursorPaidAt } },
        {
          paidAt: cursorPaidAt,
          sourcePaymentId: { gt: cursorSourcePaymentId },
        },
      ],
    };

    const rows = await this.prisma.payment.findMany({
      where,
      orderBy: [{ paidAt: 'asc' }, { sourcePaymentId: 'asc' }],
      take: pageSize,
    });

    const last = rows[rows.length - 1];
    return {
      items: rows.map((row) => this.toItem(row)),
      page: 1,
      pageSize,
      totalItems: -1,
      totalPages: -1,
      nextCursor: last
        ? {
            paidAt: last.paidAt.toISOString(),
            sourcePaymentId: last.sourcePaymentId,
          }
        : null,
      mode: 'keyset',
    };
  }

  private toItem(row: {
    id: string;
    workspaceId: string;
    providerAccountId: string;
    sourcePaymentId: string;
    referenceOriginal: string;
    referenceNormalized: string;
    grossAmountFils: bigint;
    feeAmountFils: bigint;
    currency: string;
    paidAt: Date;
  }): PaymentListItem {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      providerAccountId: row.providerAccountId,
      sourcePaymentId: row.sourcePaymentId,
      referenceOriginal: row.referenceOriginal,
      referenceNormalized: row.referenceNormalized,
      grossAmountFils: row.grossAmountFils.toString(),
      feeAmountFils: row.feeAmountFils.toString(),
      currency: row.currency,
      paidAt: row.paidAt.toISOString(),
    };
  }
}
