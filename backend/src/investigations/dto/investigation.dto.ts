import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateInvestigationDto {
  @IsString()
  @MinLength(1)
  reconciliationResultId!: string;
}

export class VersionedDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class AssignInvestigationDto extends VersionedDto {
  @IsString()
  @MinLength(1)
  assigneeUserId!: string;
}

export class AddNoteDto extends VersionedDto {
  @IsString()
  @MinLength(1)
  body!: string;
}

export class CreateProposalDto extends VersionedDto {
  @IsString()
  @MinLength(1)
  summary!: string;
}

export class DecideProposalDto extends VersionedDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  note?: string;
}
