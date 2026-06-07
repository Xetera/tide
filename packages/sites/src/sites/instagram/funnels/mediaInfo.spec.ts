import { describe, expect, it } from 'vitest'
import { JsonataExpression } from '@tide/jsonata'
import { EntityValidator } from '@tide/spec'
import '../../../funnel-loader.node'
import { instagramSite } from '..'
import { parseFrontmatter } from '@tide/frontmatter'
import type { RawEntityPatch } from '@tide/spec'
import rawExpression from './mediaInfo.jsonata?raw'
import validRequest from './validRequest.json'
import notFound from './notFound.json'

const validator = new EntityValidator([instagramSite])
const { body: expression } = parseFrontmatter(rawExpression)

async function runEntities(
  expr: JsonataExpression,
  input: unknown,
): Promise<RawEntityPatch[]> {
  const result = await expr.evaluate(input)
  if (!Array.isArray(result)) {
    return []
  }
  return result.filter(EntityValidator.isEntityPatch)
}

describe('instagram mediaInfo funnel', () => {
  it('parses valid response entities against schema', async () => {
    const entities = await runEntities(
      JsonataExpression.default(expression),
      validRequest.response.body,
    )

    const post = entities.find((e) => e._entity === '@instagram/post')
    const user = entities.find((e) => e._entity === '@instagram/user')

    expect(post).toBeDefined()
    expect(user).toBeDefined()
    expect(() => validator.parse('@instagram/post', post!)).not.toThrow()
    expect(() => validator.parse('@instagram/user', user!)).not.toThrow()
  })

  it('returns no entities for not found response', async () => {
    const entities = await runEntities(
      new JsonataExpression(expression, {
        request: notFound.request,
        response: notFound.response as any,
      }),
      notFound.response.body,
    )

    expect(entities).toHaveLength(0)
  })
})
