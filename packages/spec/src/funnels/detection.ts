const perimeterXChallengeSelectors = [
  'script[src^="https://client.px-cloud.net"]'
]

const cloudflareChallengeSelectors = [
  'script[src^="https://challenges.cloudflare.com/cdn-cgi/challenge-platform"]',
  'script[src^="https://challenges.cloudflare.com/turnstile/"]',
  'link[href^="/cdn-cgi/challenge-platform/"]',
]

export function isCloudflareChallengePage(document: Document): boolean {
  return cloudflareChallengeSelectors.some(
    (challenge) => document.querySelector(challenge) !== null,
  )
}

export function isPerimeterXChallengePage(document: Document) {
  return perimeterXChallengeSelectors.some(
    challenge => document.querySelector(challenge) !== null
  )
}
