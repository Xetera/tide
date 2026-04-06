const cloudflareChallengeSelectors = [
  'script[src^="https://challenges.cloudflare.com/cdn-cgi/challenge-platform"]',
  'script[src^="https://challenges.cloudflare.com/turnstile/"]',
  'script[src^="/cdn-cgi/challenge-platform/"]',
]

export function isCloudflareChallengePage(document: Document): boolean {
  const isChallenge = cloudflareChallengeSelectors.some(
    (challenge) => document.querySelector(challenge) !== null,
  )
  return isChallenge
}
