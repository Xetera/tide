export function iframeScrape(src: string, jobId: string): HTMLIFrameElement {
  const iframe = document.createElement('iframe')
  chrome.storage.local.set({ currentJobId: jobId })
  iframe.src = src
  iframe.height = '1080px'
  iframe.width = '1920px'
  iframe.style.opacity = '0'
  iframe.style.position = 'fixed'
  iframe.style.zIndex = '-1'
  document.body.appendChild(iframe)
  return iframe
}
