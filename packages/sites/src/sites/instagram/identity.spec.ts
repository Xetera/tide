import { describe, it, expect } from 'vitest'
import { IdentityError } from '@tide/spec'
import { instagramImageIdentity, instagramVideoIdentity } from './identity'

const efg =
  'eyJ2ZW5jb2RlX3RhZyI6ImlnLXhwdmRzLmNsaXBzLmMyLUMzLmRhc2hfbG5faGVhYWNfdmJyM19hdWRpbyIsInZpZGVvX2lkIjpudWxsLCJvaWxfdXJsZ2VuX2FwcF9pZCI6OTM2NjE5NzQzMzkyNDU5LCJjbGllbnRfbmFtZSI6ImlnIiwieHB2X2Fzc2V0X2lkIjoxODU4MTIxNTM0ODA0NTI2MywiYXNzZXRfYWdlX2RheXMiOjAsInZpX3VzZWNhc2VfaWQiOjEwMDk5LCJkdXJhdGlvbl9zIjoxMCwiYml0cmF0ZSI6NjI5MzgsInVybGdlbl9zb3VyY2UiOiJ3d3cifQ%3D%3D'

describe('instagram identity', () => {
  it('image cache_key', () => {
    expect(
      instagramImageIdentity({
        url: 'https://scontent-fra5-2.cdninstagram.com/v/t51.82787-15/673114346_18169372003411061_3042644601223639018_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=106&ig_cache_key=Mzg3OTM5NTMzOTIyODcyNzM0MQ%3D%3D.3-ccb7-5&ccb=7-5',
      }),
    ).toBe('3879395339228727341')
  })

  it('image filename', () => {
    expect(
      instagramImageIdentity({
        url: 'https://scontent-fra3-1.cdninstagram.com/v/t51.82787-19/540957724_17860675005471675_3845123663603315892_n.jpg?stp=dst-jpg_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby45NzQuYzIifQ&_nc_ht=scontent-fra3-1.cdninstagram.com&_nc_cat=103',
      }),
    ).toBe('540957724_17860675005471675_3845123663603315892')
  })

  it('video efg', () => {
    expect(
      instagramVideoIdentity({
        url:
          'https://scontent-fra5-2.cdninstagram.com/o1/v/t2/f2/m78/AQOA6ca-ZX.mp4?efg=' +
          efg,
      }),
    ).toBe('18581215348045263')
  })

  it('video xpids fallback to cache_key', () => {
    expect(
      instagramVideoIdentity({
        url: 'https://scontent-fra3-2.cdninstagram.com/v/t51.82787-15/686034203_18587398558060835_6602580425114512254_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=1&ig_cache_key=Mzg4ODQ0NTkyMDU0Nzg0MDEyNA%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjEzMjB4MjM0Ni5zZHIuQzMifQ%3D%3D',
      }),
    ).toBe('3888445920547840124')
  })

  it('video id2', () => {
    expect(
      instagramVideoIdentity({
        url: 'https://scontent-fra5-2.cdninstagram.com/o1/v/t2/f2/m86/AQP-Af1udnhBerzHhsdsN3H5verWeJd_EP7lb1aflFKXFAWvTL7JjR80HdgLzzJG_pimwlIJ1UJGHuY829E8_gXzsn3kFOnrHZuJm8w.mp4?_nc_cat=107&_nc_sid=5e9851&_nc_ht=scontent-fra5-2.cdninstagram.com&_nc_ohc=D_xyk3BtiMYQ7kNvwGeCgnD&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNzIwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MTg1ODA5ODg2MjYwMDExOTcsImFzc2V0X2FnZV9kYXlzIjoyOSwidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjE3LCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&vs=8e9a4808eb8a5079',
      }),
    ).toBe('18580988626001197')
  })

  it('throws when no identity can be derived', () => {
    expect(() =>
      instagramImageIdentity({ url: 'https://example.com/no-match' }),
    ).toThrow(IdentityError)
  })
})
