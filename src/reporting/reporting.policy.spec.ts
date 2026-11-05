import {
  reportWindow,
  csvCell,
  reportCsv,
  literalSearch,
} from './reporting.policy'
const clock = new Date('2026-11-02T12:34:56Z')
describe('reporting reporting date and export boundaries (execution release acceptance)', () => {
  it('defaults to current UTC 30-day window and treats to as exclusive', () => {
    expect(reportWindow({}, clock)).toMatchObject({
      from: '2026-10-04',
      to: '2026-11-03',
      days: 30,
      timeZone: 'UTC',
    })
    expect(
      reportWindow({ from: '2024-02-28', to: '2024-03-01' }, clock).days,
    ).toBe(2)
  })
  it('rejects invalid/partial/unbounded/reversed calendar windows', () => {
    for (const input of [
      { from: '2026-11-01' },
      { to: '2026-11-02' },
      { from: '2026-02-29', to: '2026-03-01' },
      { from: '2026-11-02', to: '2026-11-02' },
      { from: '2026-11-03', to: '2026-11-02' },
      { from: '2024-01-01', to: '2025-01-02' },
    ])
      expect(() => reportWindow(input, clock)).toThrow()
    expect(
      reportWindow({ from: '2024-01-01', to: '2025-01-01' }, clock).days,
    ).toBe(366)
  })
  it('quotes CSV safely and neutralizes user text formulas while preserving exact signed integer amounts', () => {
    for (const value of [
      '=HYPERLINK("x")',
      '+SUM(A1)',
      '-1+2',
      '@SUM(A1)',
      ' \t=1',
      '\r\n=1',
      '＝1',
    ])
      expect(csvCell(value).startsWith(String.fromCharCode(34, 39))).toBe(true)
    expect(csvCell('-900719925474099312345')).toBe('"-900719925474099312345"')
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"')
    expect(reportCsv(['name'], [['text']])).toBe('\uFEFF"name"\r\n"text"\r\n')
  })
  it('treats LIKE wildcards as literal search data, not query operators', () => {
    expect(literalSearch('a%_b')).toBe('%a\\%\\_b%')
    expect(() => literalSearch('x\u0000')).toThrow()
  })
})
