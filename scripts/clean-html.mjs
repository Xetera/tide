#!/usr/bin/env node
import { JSDOM } from '../node_modules/jsdom/lib/api.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REMOVE_TAGS = [
  'script',
  'style',
  'link',
  'meta',
  'noscript',
  'object',
  'embed',
  'applet',
  'head',
]

const REMOVE_ATTRS = [
  'style',
  'onclick',
  'onerror',
  'onload',
  'onmouseover',
  'onmouseout',
  'onkeydown',
  'onkeyup',
  'onkeypress',
  'onfocus',
  'onblur',
  'onchange',
  'onsubmit',
  'onreset',
  'jscontroller',
  'jsaction',
  'jsdata',
  'jsmodel',
  'c-wiz',
  'data-ved',
  'data-hveid',
  'data-rc',
  'ping',
  'nonce',
  'integrity',
]

const KEEP_ATTRS = new Set([
  'href',
  'src',
  'alt',
  'title',
  'id',
  'name',
  'type',
  'value',
  'placeholder',
  'action',
  'method',
  'for',
  'rel',
  'target',
  'lang',
  'dir',
  'role',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'aria-hidden',
  'datetime',
  'content',
  'property',
  'charset',
  'http-equiv',
])

const path = process.argv[2]
if (!path) {
  console.error('Usage: node scripts/clean-html.mjs <file.html>')
  process.exit(1)
}

const raw = readFileSync(resolve(path), 'utf8')
const html = raw.replace(/<style[\s\S]*?<\/style>/gi, '')
const dom = new JSDOM(html)
const doc = dom.window.document

for (const tag of REMOVE_TAGS) {
  for (const el of doc.querySelectorAll(tag)) {
    el.remove()
  }
}

for (const el of doc.querySelectorAll('*')) {
  const attrs = Array.from(el.attributes)
  for (const attr of attrs) {
    if (!KEEP_ATTRS.has(attr.name) && !attr.name.startsWith('data-')) {
      el.removeAttribute(attr.name)
    } else if (REMOVE_ATTRS.includes(attr.name)) {
      el.removeAttribute(attr.name)
    }
  }

  if (el.tagName === 'A' && !el.hasAttribute('href')) {
    el.replaceWith(...el.childNodes)
  }
}

function collapse(node) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 8) {
      child.remove()
      continue
    }
    if (child.nodeType === 3) {
      if (!child.textContent.trim()) {
        child.remove()
      }
      continue
    }
    collapse(child)
  }
}

collapse(doc.body ?? doc.documentElement)

const body = doc.body ?? doc.documentElement
console.log(body.outerHTML.replace(/\n{3,}/g, '\n\n').trim())
