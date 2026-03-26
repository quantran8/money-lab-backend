import { IsInt, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BuyOrderDto {
  @IsString()
  assetId: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;
}
