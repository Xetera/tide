export function disableIframeSecurity(origins: string[]) {
  console.log('[security] disabling security for %s domains', origins.length)
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1, 2],
    addRules: [
      {
        // response headers
        id: 1,
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
        id: 2,
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

export function addIframeSecurityListener() {
  chrome.permissions.onAdded.addListener((permission) => {
    if (permission.origins) {
      console.log('disabling iframe security for new domains')
      disableIframeSecurity(permission.origins)
    }
  })
}
