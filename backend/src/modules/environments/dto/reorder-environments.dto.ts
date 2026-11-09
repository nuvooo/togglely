import { ArrayMaxSize, IsArray, IsMongoId } from 'class-validator'

export class ReorderEnvironmentsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsMongoId({ each: true })
  environmentIds: string[]
}
