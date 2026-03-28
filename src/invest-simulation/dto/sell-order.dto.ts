import { IsNumber, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SellOrderDto {
  @IsString()
  assetId: string;

  @IsNumber()
  @Min(0, { message: 'Quantity must be greater than 0' })
  @Type(() => Number)
  quantity: number;
}
