const browser = {
  runtime: {
    onConnect: { addListener: () => {} },
    onMessage: { addListener: () => {} },
    sendMessage: () => Promise.resolve(),
    connect: () => ({ onMessage: { addListener: () => {} }, postMessage: () => {} }),
  },
  tabs: {
    onActivated: { addListener: () => {} },
    onRemoved: { addListener: () => {} },
  },
}

export default browser
