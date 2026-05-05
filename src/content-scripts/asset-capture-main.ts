;(function () {
  function eagerLoadVideo(video: HTMLVideoElement) {
    video.preload = 'auto'
    video.play().catch(() => {})
  }

  document.querySelectorAll('video').forEach(eagerLoadVideo)

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) {
          continue
        }
        if (node.tagName === 'VIDEO') {
          eagerLoadVideo(node as HTMLVideoElement)
        }
        node.querySelectorAll('video').forEach(eagerLoadVideo)
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true })

  const originalAddSourceBuffer = MediaSource.prototype.addSourceBuffer
  const originalEndOfStream = MediaSource.prototype.endOfStream

  const audioSegmentsByMediaSource = new WeakMap<MediaSource, boolean>()

  MediaSource.prototype.endOfStream = function (...args) {
    const hasAudio = audioSegmentsByMediaSource.get(this) ?? false

    if (!hasAudio) {
      let resolved = false
      const finish = () => {
        if (resolved) {
          return
        }
        resolved = true
        const result = originalEndOfStream.apply(this, args)
        const allDone = () =>
          Array.from(this.sourceBuffers).every((sb) => !sb.updating)
        const tryEmit = () => {
          if (allDone()) {
            this.dispatchEvent(new Event('__tide:ended'))
          } else {
            for (const sb of Array.from(this.sourceBuffers)) {
              if (sb.updating)
                {sb.addEventListener('updateend', tryEmit, { once: true })}
            }
          }
        }
        tryEmit()
        return result
      }
      this.addEventListener('__tide:audio', finish, { once: true })
      setTimeout(finish, 5000)
      return
    }

    const result = originalEndOfStream.apply(this, args)
    const allDone = () =>
      Array.from(this.sourceBuffers).every((sb) => !sb.updating)
    const tryEmit = () => {
      if (allDone()) {
        this.dispatchEvent(new Event('__tide:ended'))
      } else {
        for (const sb of Array.from(this.sourceBuffers)) {
          if (sb.updating)
            {sb.addEventListener('updateend', tryEmit, { once: true })}
        }
      }
    }
    tryEmit()
    return result
  }

  MediaSource.prototype.addSourceBuffer = function (mimeType) {
    const sourceBuffer = originalAddSourceBuffer.call(this, mimeType)
    const originalAppendBuffer = sourceBuffer.appendBuffer.bind(sourceBuffer)
    const segments: ArrayBuffer[] = []
    let emitted = false

    const emit = () => {
      const first = segments[0]
      if (emitted || !first) {return}
      emitted = true
      const view = new DataView(first)
      const firstBox = String.fromCharCode(
        view.getUint8(4),
        view.getUint8(5),
        view.getUint8(6),
        view.getUint8(7),
      )
      const reconstructable = firstBox === 'ftyp' || firstBox === 'moov'
      window.postMessage(
        {
          __tide: true,
          kind: 'stream-end',
          mimeType,
          segments,
          reconstructable,
        },
        '*',
      )
    }

    const isAudio = mimeType.startsWith('audio/')

    sourceBuffer.appendBuffer = (buffer) => {
      const copy =
        buffer instanceof ArrayBuffer
          ? buffer.slice(0)
          : buffer.buffer.slice(
              buffer.byteOffset,
              buffer.byteOffset + buffer.byteLength,
            )
      segments.push(copy)

      if (isAudio && !audioSegmentsByMediaSource.get(this)) {
        audioSegmentsByMediaSource.set(this, true)
        this.dispatchEvent(new Event('__tide:audio'))
      }

      return originalAppendBuffer(buffer)
    }

    this.addEventListener('__tide:ended', emit, { once: true })

    return sourceBuffer
  }
})()

export default {}
