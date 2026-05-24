/* @refresh reload */
import { render } from 'solid-js/web'
import Page from './page'
import './app.css'

const root =
  document.querySelector('#crx-root') ??
  (() => {
    const root = document.createElement('div')
    root.id = 'crx-root'
    document.body.append(root)
    return root
  })()

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  )
}

render(() => <Page />, root)
