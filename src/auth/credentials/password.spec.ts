import { hashPassword, verifyPassword } from './password'

describe('password storage', () => {
  it('never stores plaintext and verifies securely', async () => {
    const password = 'correct horse battery staple'
    const stored = await hashPassword(password)
    expect(stored).not.toContain(password)
    expect(await verifyPassword(password, stored)).toBe(true)
    expect(await verifyPassword('wrong-password', stored)).toBe(false)
  })
  it('rejects damaged or unknown hashes', async () => {
    expect(await verifyPassword('anything', 'bad')).toBe(false)
  })
})
