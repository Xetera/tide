import { describe, expect, it } from 'vitest'
import { JsonataExpression } from '~/extraction/jsonata-bindings'
import { EntityValidator } from '~/extraction/entity-validator'
import { instagramSite } from '~/sites/instagram'
import expression from './request.jsonata?raw'
import validRequest from './validRequest.json'
import notFound from './notFound.json'

const validator = new EntityValidator([instagramSite])

describe('instagram mediaInfo loader', () => {
  it('parses valid response entities against schema', async () => {
    const entities = await new JsonataExpression(expression, {
      request: validRequest.request,
      response: validRequest.response as any,
    }).entities(validRequest.response.body)

    const post = entities.find((e) => e._entity === '@instagram/post')
    const user = entities.find((e) => e._entity === '@instagram/user')

    expect(post).toBeDefined()
    expect(user).toBeDefined()
    expect(() => validator.parse('@instagram/post', post)).not.toThrow()
    expect(() => validator.parse('@instagram/user', user)).not.toThrow()
  })

  it('returns no entities for not found response', async () => {
    const entities = await new JsonataExpression(expression, {
      request: notFound.request,
      response: notFound.response as any,
    }).entities(notFound.response.body)

    expect(entities).toHaveLength(0)
  })
})
