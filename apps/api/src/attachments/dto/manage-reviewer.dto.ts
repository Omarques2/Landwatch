import { IsNotEmpty, IsUUID } from 'class-validator';

export class ManageReviewerDto {
  @IsUUID()
  @IsNotEmpty()
  userId!: string;
}
