import { IsMongoId, IsString, MaxLength, MinLength } from 'class-validator'

/**
 * Body for `POST /environments/project/:projectId`.
 * `organizationId` is intentionally absent: it is derived server-side from
 * the project so a caller cannot attach an environment to a foreign tenant.
 */
export class CreateEnvironmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  key: string
}

/** Body for `POST /environments` (projectId supplied in the body). */
export class CreateEnvironmentWithProjectDto extends CreateEnvironmentDto {
  @IsMongoId()
  projectId: string
}
