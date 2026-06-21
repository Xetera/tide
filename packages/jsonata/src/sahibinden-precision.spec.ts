import { describe, expect, it } from 'vitest'
import { JsonataExpression } from '@tide/jsonata'

async function step(text: string): Promise<number | undefined> {
  const expr = new JsonataExpression(
    `$money(text, {"currency": "TRY", "locale": "tr"}) ~> $sahibinden.precision`,
  )
  const out = (await expr.evaluate({ text })) as {
    amount: number
    precision?: { step: number }
  }
  return out.precision?.step
}

describe('sahibinden.precision', () => {
  it.each([
    ['120 bin', 1_000],
    ['4,12 M', 10_000],
    ['12,5 M', 100_000],
    ['15,2 M', 100_000],
    ['121 M', 1_000_000],
    ['1.213 M', 1_000_000],
  ])('derives step for %s', async (text, expected) => {
    expect(await step(text)).toBe(expected)
  })
})
