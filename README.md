# Shoal

Almost all distributed scraping today is done through HTTPS proxies <sup>[citation pending]</sup> that allow hammering a website with different IPs all at once to circumvent certain kinds of blocks. A good chunk of those proxies are compromised machines (which is pretty unethical to use) or are people who foolishly open their network up to abuse.

But sometimes you don't need to blast a server with requests for instant change detection, you might only need slow and respectful data collection over time, and a way to do so without thinking about defeating complex bot protection. Sometimes that bot protection can be defeated with a handful of friends browsing the site and infrequently solving captchas.

The shoal protocol allows you to do this through real users' browser with a browser extension (Tide), interacting with a backend that declares all the resources it needs, and scrapes matching pages accordingly. The server describes the structure of the data declaratively, instead of having the client proxy shady requests or run arbitrary code.

| Feature                       | Headless Browser + Proxy | Shoal |
| ----------------------------- | ------------------------ | -------- |
| Circumvents Bot Protection    | ❌                       | ✅       |
| Undetectable                  | ❌                       | ✅       |
| Unblockable                   | ❌                       | ✅       |
| Secure for Proxy Owner        | ❌                       | ✅       |
| URL Based Access Control      | ❌                       | ✅       |
| Minimal Extra Load on Sites   | ❌                       | ✅       |
| Free                          | ❌                       | ✅       |
| [Scalable](#scaling-shoal) | ✅                       | ✅       |
| Highly Available              | ✅                       | 🤔       |
| Flexible                      | ✅                       | 🤔       |
| [Zero Trust](#trust)          | ✅                       | ❌       |
| Convenient                    | ✅                       | ❌       |
| Fast                          | ✅                       | ❌       |

As you can see, Shoal isn't the "Revolutionary future of scraping." It's just an alternative for data collection that can be done when speed isn't very important. You won't be buying yourself new limited edition shoes with this any time soon. It's not going to work for everybody, especially if there's nobody they know organically using the sites they want to scrape.

## How it works

The protocol expects your backend to define the following HTTPS endpoints:

- `GET  /resources`
- `GET  /worker/jobs`
- `POST /worker/jobs`

It allows you to define static rules for selecting, extracting and transforming data from the HTML the user sees. As the user navigates the site organically, if they load pages that match a resource url, the extension will automatically parse the HTML and send it back to the server. This can be optionally augmented to be done on-demand by assigning tasks to users which they will carry out if they're opted in to do [active scraping](#passive-vs-active-scraping).

Let's imagine we want to scrape this specific HTML fragment on `https://simpsons.com/characters`:

```html
<ul id="users">
  <li>
    <p>Homer</p>
    <span class="verified">✓</span>
    <a href="/characters/homer-simpson">Read more</a>
  </li>
  <li>
    <p>Bart</p>
    <img src="bart.jpg" />
    <a href="/characters/bartholomew-simpson">Read more</a>
  </li>
  <li>
    <p>Principal Skinner</p>
    <a href="/characters/armin-tamzarian">Read more</a>
  </li>
</ul>
```

Our server will declare its `GET /resource` endpoint like this to tell the client what to look for and how to transform it.

```js
{
  $id: "simpsons_characters",
  $hostname: "simpsons.com",
  $urlPattern: "/characters",
  $fields: {
    people: {
      $selectorEach: "#users li",
      $fields: {
        page: {
          $selector: "a",
          $extractor: { $extractor: "attribute", $attribute: "href" }
        },
        image: {
          $selector: "img",
          $ifMissing: {
            $strategy: "omit"
          },
          $extractor: { $extractor: "media" }
        },
        nickname: {
          $selector: "p",
          $extractor: { $extractor: "text" }
        },
        isVerified: {
          $selector: "span.verified",
          $extractor: { $extractor: "exists" }
        }
      }
    }
  }
}
```

Tide will parse data out when the user navigates to the page, and hit up `POST /worker/jobs` to submit a valid payload for the resource. All of this is done under the hood as an organic user, without `simpsons.com` knowing anything.

```json
{
  "resource_id": "simpsons_characters",
  "job": { "kind": "passive" },
  "payload": {
    "people": [
      {
        "nickname": "Homer",
        "page": "https://simpsons.com/characters/homer-simpson",
        "isVerified": true
      },
      {
        "nickname": "Bart",
        "page": "https://simpsons.com/characters/bartholomew-simpson",
        "image": {
          "url": "https://simpsons.com/characters/bart.jpg",
          "id": "<<shortid>>",
          "sha256hash": "<<imagehash>>"
        },
        "isVerified": false
      },
      {
        "nickname": "Principal Skinner",
        "page": "https://simpsons.com/characters/armin-tamzarian",
        "isVerified": false
      }
    ]
  }
}
```

More information on the specifics of the protocol and complex logic like extracting from HTML attributes and matching with regex can be found in the [Typescript source code](./src/protocol/shoal.ts).

## Passive vs Active Scraping

Peers have the power to pick how much they want to contribute to the data collection efforts of servers they add. By default, they only do passive scraping which makes sure there's 0 extra requests being done on behalf of the user.

### Passive mode

Scraping is only done from pages the user loads on their browser. No extra requests that the user wouldn't otherwise send while browsing are made. 100% undetectable and unblockable, but contributes no data if the user isn't already visiting those pages.

Useful if tide is being used in conjunction with another extension that augments the user's experience on that site in specific.

### Active mode

The client polls `POST /worker/jobs` regularly to receive new jobs. Upon receiving a new job, the extension will quietly open an iframe in a random page to the target to fulfill the scraping job on the URL sent.

#### Security

The extension edits `X-Frame-Options`, and `Content-Security-Policy` of iframe responses to allow iframes on **all** websites, and changes `Sec-Fetch-Dest` to `document` to make the iframe page load identical to a regular page load so it can't be blocked.

There's inevitably a security implication to turning off iframe protections. Currently, the extension strips ALL CSP headers which is definitely overkill and will be addressed in the future. In theory, there's a way to make sure these protections are only turned off for the specific iframe requests to minimize the risk as much as possible.

#### Cookies 🍪

When you have active mode turned on, tide will try to open iframes in tabs matching the domains of jobs it receives. This means if you're on `a.com` and you receive a job for scraping `a.com/coffee`, it will try to open an iframe in the same origin. But if you don't have a matching domain and use firefox or brave, you might encounter errors if you block 3rd party cookies, which these browsers do by default. Unfortunately there's no work around for this and you have to enable it.

## Undetectability

Browsers have a vested interest in making sure sites can't profile users by looking up the extensions they have installed in order to prevent fingerprinting. To do this they make sure to hide any proof of the existence of extensions, including running the Javascript in different "worlds" which turns out to be very convenient for this project. There's simply no way to detect or stop passive scraping in ways that wouldn't also introduce hurdles for real users.

Active scraping is potentially possible to detect with a `MutationObserver` looking for spurious iframes when doing same-origin scraping. But it's not possible to stop without regular checks that would annoy real users as well. If this project ever takes off however, there could be a separate cat and mouse game being played to stop active scraping in specific.

## Trust

Even though the Shoal protocol solves the problem of the client trusting the server by giving the client tools to narrow down the scope of what the server can interact with, it doesn't solve the problem of the server trusting the client. The authenticity of the data coming from the client can't be proven the way it could be with an HTTPS proxy.

A client can, in theory, submit any data it wants and the protocol doesn't have anything builtin to make sure the data is legitimate. Any authenticity checks have to be done out-of-band. Possibly comparing answers between clients.

## Scaling Shoal

One of the main things that holds this approach back is that you need real users to be able to process more data. One of those approaches can be to build a side product for the site you gather data on that you only enable for users who also install shoal.

## Roadmap

- [ ] Enabling and disabling specific resources
- [ ] Support for multiple servers
- [ ] Toggling passive and active mode for servers
- [ ] Better logging for events
- [ ] Setting resource
- [ ] Enable logins
- [ ] Exporting data from one machine to the other
