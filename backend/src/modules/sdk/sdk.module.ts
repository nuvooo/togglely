import { Module } from '@nestjs/common'
import { SdkService } from './sdk.service'
import { EvaluationService } from './evaluation.service'
import { HashingService } from './hashing.service'

@Module({
  providers: [SdkService, EvaluationService, HashingService],
  exports: [SdkService, EvaluationService, HashingService],
})
export class SdkModule {}
