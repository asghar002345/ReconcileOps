import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListPaymentsQueryDto {
  @ApiPropertyOptional({
    description: '1-based page number (offset mode). Ignored when cursor is set.',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    description: 'Number of payments per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @ApiPropertyOptional({
    description:
      'Keyset cursor: ISO paidAt of the last row from the previous page (Week 11).',
  })
  @IsOptional()
  @IsDateString()
  cursorPaidAt?: string;

  @ApiPropertyOptional({
    description:
      'Keyset cursor: sourcePaymentId of the last row (tie-break with cursorPaidAt).',
  })
  @IsOptional()
  @IsString()
  cursorSourcePaymentId?: string;
}
