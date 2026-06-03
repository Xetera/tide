// import { originToUrl } from '~/funnels/url'

// const CF_CLEARANCE = 'cf_clearance'

// async function disableChips(cookie: chrome.cookies.Cookie, origin: string) {
//   const url = `https://${origin}`
//   chrome.cookies.remove({
//     name: cookie.name,
//     url: originToUrl(cookie.domain),
//     storeId: cookie.storeId,
//     partitionKey: { topLevelSite: url },
//   })
//   chrome.cookies.set(
//     {
//       name: cookie.name,
//       httpOnly: cookie.httpOnly,
//       domain: cookie.domain,
//       expirationDate: cookie.expirationDate,
//       sameSite: cookie.sameSite,
//       secure: cookie.secure,
//       value: cookie.value,
//       path: cookie.path,
//       url: originToUrl(cookie.domain),
//     },
//     (cookie) => {
//       if (!cookie) {
//         console.log(chrome.runtime.lastError)
//       }
//     },
//   )
// }

// export async function addDisableChipsListener(origins: string[]) {
//   for (const origin of origins) {
//     chrome.cookies.getAll(
//       {
//         name: CF_CLEARANCE,
//         partitionKey: { topLevelSite: `https://${origin}` },
//       },
//       (cookies) => {
//         if (cookies.length > 0) {
//           console.log('got cookies', cookies)
//           const cookie = cookies[0] as chrome.cookies.Cookie
//           disableChips(cookie, origin)
//         }
//       },
//     )
//   }
//   chrome.cookies.onChanged.addListener(async (changeInfo) => {
//     if (changeInfo.cookie.name !== CF_CLEARANCE || changeInfo.removed) {
//       return
//     }
//     if (
//       origins.some((origin) => origin.includes(changeInfo.cookie.domain)) &&
//       'partitionKey' in changeInfo.cookie
//     ) {
//       console.log('got partitioningninasin ania fn', changeInfo)
//       disableChips(changeInfo.cookie, changeInfo.cookie.domain)
//     }
//   })
// }
