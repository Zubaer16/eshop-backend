import { emailConfiguration } from './email.config'
const configured = {
  EMAIL_DELIVERY_MODE: 'controlled',
  EMAIL_SMTP_HOST: 'smtp.example.test',
  EMAIL_SMTP_USER: 'sender@example.test',
  EMAIL_SMTP_PASSWORD: 'test-secret',
  EMAIL_FROM_ADDRESS: 'sender@example.test',
  EMAIL_PUBLIC_ORIGIN: 'https://shop.example.test',
  EMAIL_ADMIN_ORIGIN: 'https://admin.example.test',
  EMAIL_RECIPIENT_ALLOWLIST: 'recipient@example.test',
}
describe('G7 deployment-only email configuration (execution G12)', () => {
  it('defaults disabled; requires complete controlled configuration and explicit recipient list', () => {
    expect(emailConfiguration({}, 'development')).toMatchObject({
      EMAIL_DELIVERY_MODE: 'disabled',
      EMAIL_SMTP_PORT: 465,
    })
    expect(
      emailConfiguration(configured, 'development').EMAIL_DELIVERY_MODE,
    ).toBe('controlled')
    for (const patch of [
      { EMAIL_RECIPIENT_ALLOWLIST: '' },
      { EMAIL_SMTP_PASSWORD: '' },
      { EMAIL_FROM_ADDRESS: 'Name <sender@example.test>' },
      { EMAIL_FROM_NAME: 'bad\r\nBcc: x' },
      { EMAIL_PUBLIC_ORIGIN: 'https://shop.example.test/redirect?next=evil' },
      { EMAIL_SMTP_PORT: 25 },
      { EMAIL_DELIVERY_MODE: 'production' },
    ])
      expect(() =>
        emailConfiguration({ ...configured, ...patch }, 'development'),
      ).toThrow()
  })
  it('requires local-only HTTP development origins and mandatory encrypted SMTP', () => {
    expect(
      emailConfiguration(
        {
          ...configured,
          EMAIL_SMTP_PORT: 587,
          EMAIL_PUBLIC_ORIGIN: 'http://localhost:3000',
        },
        'development',
      ).EMAIL_SMTP_PORT,
    ).toBe(587)
    expect(() =>
      emailConfiguration(
        { ...configured, EMAIL_PUBLIC_ORIGIN: 'http://shop.example.test' },
        'development',
      ),
    ).toThrow()
    expect(() =>
      emailConfiguration(
        { ...configured, EMAIL_PUBLIC_ORIGIN: 'http://localhost:3000' },
        'production',
      ),
    ).toThrow()
  })
  it('rejects primary-password-style Google config and normalizes App Password spacing', () => {
    expect(() =>
      emailConfiguration(
        {
          ...configured,
          EMAIL_SMTP_HOST: 'smtp.gmail.com',
          EMAIL_SMTP_PASSWORD: 'wrong',
        },
        'development',
      ),
    ).toThrow()
    expect(
      emailConfiguration(
        {
          ...configured,
          EMAIL_SMTP_HOST: 'smtp.gmail.com',
          EMAIL_SMTP_PASSWORD: 'abcd efgh ijkl mnop',
        },
        'development',
      ).EMAIL_SMTP_PASSWORD,
    ).toBe('abcdefghijklmnop')
  })
})
