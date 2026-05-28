const RULE_ID_RESPONSE_HEADERS = 1
const RULE_ID_REQUEST_HEADERS = 2

export function disableIframeSecurity(origins: string[]) {
  console.log('[security] disabling security for %s domains', origins.length)

  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID_RESPONSE_HEADERS, RULE_ID_REQUEST_HEADERS],
    addRules: [
      {
        // response headers
        id: RULE_ID_RESPONSE_HEADERS,
        priority: 1,
        condition: {
          resourceTypes: ['sub_frame'],
          requestDomains: origins,
        },
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            {
              operation: 'remove',
              header: 'X-Frame-Options',
            },
            {
              operation: 'remove',
              header: 'Content-Security-Policy',
            },
          ],
        },
      },
      {
        // request headers
        id: RULE_ID_REQUEST_HEADERS,
        priority: 1,
        condition: {
          resourceTypes: ['sub_frame'],
          requestDomains: origins,
        },
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            {
              operation: 'set',
              header: 'Sec-Fetch-Site',
              value: 'none',
            },
            {
              operation: 'remove',
              header: 'Referer',
            },
            {
              operation: 'set',
              header: 'Sec-Fetch-Dest',
              value: 'document',
            },
          ],
        },
      },
    ],
  })
  chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(console.log)
}

const RULE_ID_ENTITY_PAGE_CORP = 100

export function allowCrossOriginForEntityPage() {
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID_ENTITY_PAGE_CORP],
    addRules: [
      {
        id: RULE_ID_ENTITY_PAGE_CORP,
        priority: 2,
        condition: {
          initiatorDomains: ['localhost', PROD_URL],
          resourceTypes: ['image', 'media'],
        },
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            {
              operation: 'set',
              header: 'Cross-Origin-Resource-Policy',
              value: 'cross-origin',
            },
          ],
        },
      },
    ],
  })
  chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(console.log)
}

export function addIframeSecurityListener() {
  chrome.permissions.onAdded.addListener((permission) => {
    if (permission.origins) {
      console.log('disabling iframe security for new domains')
      disableIframeSecurity(permission.origins)
    }
  })
}
