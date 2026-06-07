import { describe, it, expect } from 'vitest'
import { IdentityError } from '@tide/spec'
import { shbdnImageIdentity } from './identity'

describe('sahibinden identity', () => {
  it('image filename', () => {
    expect(
      shbdnImageIdentity({
        url: 'https://i0.shbdn.com/photos/12/34/56/x5_1234567890abc.jpg',
      }),
    ).toBe('1234567890abc')
  })

  it('throws when no identity can be derived', () => {
    expect(() =>
      shbdnImageIdentity({ url: 'https://example.com/no-match' }),
    ).toThrow(IdentityError)
  })
})
