import { ConflictException } from '@nestjs/common'
import { mediaKeyParts } from './media-path'

const id = 'd177a14c-b6d2-4428-958d-76ea6d1a57ae'
describe('media storage boundaries', () => {
  it('accepts approved nested keys and legacy flat keys in the same namespace', () => {
    expect(
      mediaKeyParts('projects/eshop', 'projects/eshop/' + id).mediaId,
    ).toBe(id)
    expect(
      mediaKeyParts('projects/eshop', 'projects/eshop/banners/' + id).parts,
    ).toEqual(['banners', id])
  })
  it('rejects other projects, traversal, extra levels and non-UUID keys', () => {
    for (const key of [
      'projects/other/banners/' + id,
      'projects/eshop/../' + id,
      'projects/eshop/unknown/' + id,
      'projects/eshop/banners/products/' + id,
      'projects/eshop/banners/file.png',
    ])
      expect(() => mediaKeyParts('projects/eshop', key)).toThrow(
        ConflictException,
      )
  })
})
