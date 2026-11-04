import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import {
  CustomerPerformanceQueryDto,
  ProductPerformanceQueryDto,
  SeriesReportQueryDto,
  FinancialReportQueryDto,
  ReportExportQueryDto,
} from './reporting.dto'
describe('G9 report input contracts (execution G12)', () => {
  it('requires an explicit currency on granular performance and series queries', async () => {
    for (const type of [
      CustomerPerformanceQueryDto,
      ProductPerformanceQueryDto,
      SeriesReportQueryDto,
    ]) {
      expect(
        (await validate(plainToInstance(type, {}))).length,
      ).toBeGreaterThan(0)
      expect(
        await validate(plainToInstance(type, { currency: 'USD' })),
      ).toHaveLength(0)
    }
  })
  it('rejects lowercase currency and caller-controlled export sizing/filename fields', async () => {
    expect(
      (
        await validate(
          plainToInstance(FinancialReportQueryDto, { currency: 'usd' }),
        )
      ).length,
    ).toBeGreaterThan(0)
    const result = await validate(
      plainToInstance(ReportExportQueryDto, {
        currency: 'USD',
        limit: 999999,
        filename: 'evil.csv',
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    )
    expect(result).toHaveLength(2)
  })
})
