import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { CreateFlagDto } from './create-flag.dto'
import { FLAG_VALUE_MAX_LENGTH } from './limits'
import { ToggleFlagDto } from './toggle-flag.dto'
import { UpdateFlagValueDto } from './update-flag-value.dto'

function errorsOf<T extends object>(cls: new () => T, body: object) {
  return validateSync(plainToInstance(cls, body), {
    whitelist: true,
  }).map((e) => e.property)
}

describe('flag DTO validation', () => {
  it('UpdateFlagValueDto accepts ObjectId brand ids and null', () => {
    expect(
      errorsOf(UpdateFlagValueDto, { brandId: '64a000000000000000000050' })
    ).toEqual([])
    expect(errorsOf(UpdateFlagValueDto, { brandId: null })).toEqual([])
  })

  it('UpdateFlagValueDto rejects non-ObjectId brand ids (incl. UUIDs)', () => {
    expect(
      errorsOf(UpdateFlagValueDto, {
        brandId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      })
    ).toEqual(['brandId'])
  })

  it('UpdateFlagValueDto bounds the value size', () => {
    expect(
      errorsOf(UpdateFlagValueDto, {
        value: 'x'.repeat(FLAG_VALUE_MAX_LENGTH + 1),
      })
    ).toEqual(['value'])
  })

  it('ToggleFlagDto requires an ObjectId environmentId', () => {
    expect(errorsOf(ToggleFlagDto, { environmentId: 'prod' })).toEqual([
      'environmentId',
    ])
    expect(
      errorsOf(ToggleFlagDto, { environmentId: '64a000000000000000000040' })
    ).toEqual([])
  })

  it('CreateFlagDto validates initialValues entries', () => {
    const base = { name: 'n', key: 'k', type: 'BOOLEAN' }
    expect(
      errorsOf(CreateFlagDto, {
        ...base,
        initialValues: { production: { enabled: true, value: 'true' } },
      })
    ).toEqual([])
    expect(
      errorsOf(CreateFlagDto, {
        ...base,
        initialValues: { production: { enabled: 'yes', value: { $gt: '' } } },
      })
    ).toEqual(['initialValues'])
    expect(
      errorsOf(CreateFlagDto, {
        ...base,
        initialValues: {
          production: { value: 'x'.repeat(FLAG_VALUE_MAX_LENGTH + 1) },
        },
      })
    ).toEqual(['initialValues'])
  })
})
