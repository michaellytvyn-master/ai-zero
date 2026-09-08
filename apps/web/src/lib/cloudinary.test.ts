import { describe, expect, it } from 'vitest'
import { signParams } from './cloudinary'

describe('signParams', () => {
  /** The worked example from Cloudinary's own signature documentation. */
  it('matches the reference signature from the documentation', () => {
    const signature = signParams(
      {
        timestamp: '1315060510',
        public_id: 'sample_image',
        eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
      },
      'abcd',
    )

    expect(signature).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e')
  })

  it('sorts by parameter name, so argument order cannot change the result', () => {
    const a = signParams({ b: '2', a: '1', c: '3' }, 'secret')
    const b = signParams({ c: '3', a: '1', b: '2' }, 'secret')

    expect(a).toBe(b)
  })

  it('changes when the secret changes, which is the whole point', () => {
    expect(signParams({ timestamp: '1' }, 'one')).not.toBe(signParams({ timestamp: '1' }, 'two'))
  })

  it('never contains the secret', () => {
    expect(signParams({ timestamp: '1' }, 'super-secret-value')).not.toContain('super')
  })
})
