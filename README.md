# Tide

Almost all distributed scraping today is done through HTTPS proxies <sup>[citation pending]</sup> that allow hammering a website with different IPs all at once to circumvent certain kinds of blocks. A good chunk of those proxies are compromised machines (which is pretty unethical to use) or are people who foolishly open their network up to abuse.

But sometimes you don't need to blast a server with requests for instant change detection, you might only need slow and respectful data collection over time, and a way to do so without thinking about defeating complex bot protection. Sometimes that bot protection can be defeated with a handful of friends browsing the site and infrequently solving captchas.

Tide allows you to do this through real users' browser with a browser extension, interacting with a backend that declares all the resources it needs, and scrapes matching pages accordingly. The server optionally describes the structure of the data declaratively, instead of having the client proxy shady requests or run arbitrary code.

| Feature                     | Headless Browser + Proxy | Tide |
| --------------------------- | ------------------------ | ---- |
| Circumvents Bot Protection  | ❌                       | ✅   |
| Undetectable                | ❌                       | ✅   |
| Unblockable                 | ❌                       | ✅   |
| Secure for Proxy Owner      | ❌                       | ✅   |
| URL Based Access Control    | ❌                       | ✅   |
| Minimal Extra Load on Sites | ❌                       | ✅   |
| Free                        | ❌                       | ✅   |
| [Scalable](#scaling-tide)   | ✅                       | ✅   |
| Highly Available            | ✅                       | 🤔   |
| Flexible                    | ✅                       | 🤔   |
| [Zero Trust](#trust)        | ✅                       | ❌   |
| Convenient                  | ✅                       | ❌   |
| Fast                        | ✅                       | ❌   |

## How it works

Tide is expected to be able to work with [Shoal](https://joinshoal.org), a tide-relay-as-a-service I'm working on. The public API is declared [in the Swagger docs](https://joinshoal.org/api/openapi).

`src/sites` defines a list of all entities that can be extracted from supported sites like:

- Posts on instagram `@instagram/post`
- Twitter profiles `@twitter/user`
- ...and others for any number of sites

These entities get compiled to a JSON spec any consumer can validate requests against. Tide supports 2 different funnels for turning data sent to the user's browser into those declared formats.

### JSONata

[JSONata](https://jsonata.org/) is used to transform responses to HTTP requests into entity formats by reading responses to known requests. Imagine a fake response like:

```json
{
  "user": {
    "name": "xetera",
    "userId": 1241512,
    "stats": {
      "postCount": 100,
      "likeCount": 200
    },
    "accountCreation": "2020-01-01"
  }
}
```

a JSONata file can transform it into a known entity format

```
[
  user.{
    "_entity": "@site/user",
    "_id": userId,
    "username": name,
    "postsLiked": stats.likeCount,
    "_createdAt": accountCreation
  }
]
```

### HTMLegy

This is the HTML equivalent of JSONata, built exclusively for Tide. It's used for extracting data from pages the user loads. Unlike HTTP responses, a page mutates and updates in real time, so HTMLegy is designed in a way where it can react to changes to the DOM. Take this example:

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

It can be parsed using something like:

```json
[
  watch $$(.users li) {
    "name": $(p) | text,
    "isVerified": $(.verified) | exists,
    "image": $(img) | media,
    "link": $(a) | attr(href) | url
  }
]
```

whenever the list of characters changes because of infinite scroll or some other reason, it'll re-emit the changed list.

## Passive vs Active Scraping

Peers have the power to pick how much they want to contribute to the data collection efforts of servers they add. By default, they only do passive scraping which makes sure there's 0 extra requests being done on behalf of the user.

### Active mode

There's also the option of active scraping (WIP), where the client polls an endpoint regularly to receive new jobs from the connected pool. Upon receiving a new job, the extension will quietly open an iframe in a random page to the target to fulfill the scraping job on the URL sent.

#### Security

The extension edits `X-Frame-Options`, and `Content-Security-Policy` of iframe responses to allow iframes on **all** websites, and changes `Sec-Fetch-Dest` to `document` to make the iframe page load identical to a regular page load so it can't be blocked.

There's inevitably a security implication to turning off iframe protections. Currently, the extension strips ALL CSP headers which is definitely overkill and will be addressed in the future. In theory, there's a way to make sure these protections are only turned off for the specific iframe requests to minimize the risk as much as possible.

#### Cookies 🍪

When you have active mode turned on, tide will try to open iframes in tabs matching the domains of jobs it receives. This means if you're on `a.com` and you receive a job for scraping `a.com/coffee`, it will try to open an iframe in the same origin. But if you don't have a matching domain and use firefox or brave, you might encounter errors if you block 3rd party cookies, which these browsers do by default. Unfortunately there's no work around for this and you have to enable it.

## Undetectability

Browsers have a vested interest in making sure sites can't profile users by looking up the extensions they have installed in order to prevent fingerprinting. To do this they make sure to hide any proof of the existence of extensions, including running the Javascript in different "worlds" which turns out to be very convenient for this project. There are techncially ways to fingerprint this specific extension, if people are looking for it.

## Trust

Even though the Tide + Shoal solves the problem of the client trusting the server by giving the client tools to narrow down the scope of what the server can interact with, it doesn't solve the problem of the server trusting the client. The authenticity of the data coming from the client can't be proven the way it could be with an HTTPS proxy.

A client can, in theory, submit any data it wants and the protocol doesn't have anything builtin to make sure the data is legitimate. Any authenticity checks have to be done out-of-band. Possibly comparing answers between clients.

If you're using Shoal you have to onboard your own workers for this reason, or you can pay for our own vetted pool of workers in the near future.
