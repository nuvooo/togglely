import { Module } from '@nestjs/common'
import { SdkService } from './sdk.service'
import { EvaluationService } from './evaluation.service'

@Module({
  providers: [SdkService, EvaluationService],
  exports: [SdkService, EvaluationService],
})
export class SdkModule {}
