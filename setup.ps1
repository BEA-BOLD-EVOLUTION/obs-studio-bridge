[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 20 or newer is required. Install it from https://nodejs.org/ and run setup.ps1 again.'
}

$NodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($NodeMajor -lt 20) {
    throw "Node.js 20 or newer is required; found $(node --version)."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm was not found. Reinstall Node.js with npm included.'
}

if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
    Write-Host 'Created .env from .env.example.' -ForegroundColor Green
}

npx --yes pnpm@10 install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }

npm run build
if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed.' }

Write-Host ''ÎxâÚ$z{-®éÜj×   resolution: {integrity: sha512-VCjCNfgMsby3tTdo02nbjtM/ewra6jPHmpThenkTYh8pG9ucZ/1P8So4u4FGBek/BjpOVsDCMoLA/iuBKIFXRA==}
    engines: {node: '>= 0.4'}

  side-channel-weakmap@1.0.2:
    resolution: {integrity: sha512-WPS/HvHQTYnHisLo9McqBHOJk2FkHO/tlpvldyrnem4aeQp4hai3gythswg6p01oSoTl58rcpiFAjF2br2Ak2A==}
    engines: {node: '>= 0.4'}

  side-channel@1.1.1:
    resolution: {integrity: sha512-6x6dK6zJdpTzF4sQeNYxwtvBzf6Eg4GtlesS94HOvTudUeyK2WXAaIfmDgsyslYrRBeFIlsi54AYsFGUuhmvrQ==}
    engines: {node: '>= 0.4'}

  statuses@2.0.2:
    resolution: {integrity: sha512-DvEy55V3DB7uknRo+4iOGT5fP1slR8wQohVdknigZPMpMstaKJQWhwiYBACJE3Ul2pTnATihhBYnRhZQHGBiRw==}
    engines: {node: '>= 0.8'}

  toidentifier@1.0.1:
    resolution: {integrity: sha512-o5sSPKEkg/DIQNmH43V0/uerLrpzVedkUh8tGNvaeXpfpuwjKenlSox/2O/BTlZUtEe+JG7s5YhEz608PlAHRA==}
    engines: {node: '>=0.6'}

  type-fest@3.13.1:
    resolution: {integrity: sha512-tLq3bSNx+xSpwvAJnzrK0Ep5CLNWjvFTOp71URMaAEWBfRb9nnJiBoUe0tF8bI4ZFO3omgBR6NvnbzVUT3Ly4g==}
    engines: {node: '>=14.16'}

  type-is@2.1.0:
    resolution: {integrity: sha512-faYHw0anBbc/kWF3zFTEnxSFOAGUX9GFbOBthvDdLsIlEoWOFOtS0zgCiQYwIskL9iGXZL3kAXD8OoZ4GmMATA==}
    engines: {node: '>= 18'}

  typescript@5.9.3:
    resolution: {integrity: sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==}
    engines: {node: '>=14.17'}
    hasBin: true

  undici-types@7.18.2:
    resolution: {integrity: sha512-AsuCzffGHJybSaRrmr5eHr81mwJU3kjw6M+uprWvCXiNeN9SOGwQ3Jn8jb8m3Z6izVgknn1R0FTCEAP2QrLY/w==}

  unpipe@1.0.0:
    resolution: {integrity: sha512-pjy2bYhSsufwWlKwPc+l3cN7+wuJlK6uz0YdJEOlQDbl6jo/YlPi4mb8agUkVC8BF7V8NuzeyPNqRksA3hztKQ==}
    engines: {node: '>= 0.8'}

  vary@1.1.2:
    resolution: {integrity: sha512-BNGbWLfd0eUPabhkXUVm0j8uuvREyTh5ovRa/dyow/BqAbZJyC+5fU+IzQOzmAKzYqYRAISoRhdQr3eIZ/PXqg==}
    engines: {node: '>= 0.8'}

  which@2.0.2:
    resolution: {integrity: sha512-BLI3Tl1TW3Pvl70l3yq3Y64i+awpwXqsGBYWkkqMtnbXgrMD+yj7rhW0kuEDxzJaYXGjEW5ogapKNMEKNMjibA==}
    engines: {node: '>= 8'}
    hasBin: true

  wrappy@1.0.2:
    resolution: {integrity: sha512-l4Sp/DRseor9wL6EvV2+TuQn63dMkPjZ/sp9XkghTEbV9KlPS1xUsZ3u7/IQO4wxtcFB4bgpQPRcR3QCvezPcQ==}

  ws@8.21.1:
    resolution: {integrity: sha512-+0NTnW77fFN/DjQi6k/Sq/Yvk4Sgajw7urW8V+asjXnRgDs9gyGkdb7EzgfhA4goXsRIZKE28fzIXBHEzhuiWw==}
    engines: {node: '>=10.0.0'}
    peerDependencies:
      bufferutil: ^4.0.1
      utf-8-validate: '>=5.0.2'
    peerDependenciesMeta:
      bufferutil:
        optional: true
      utf-8-validate:
        optional: true

  zod-to-json-schema@3.25.2:
    resolution: {integrity: sha512-O/PgfnpT1xKSDeQYSCfRI5Gy3hPf91mKVDuYLUHZJMiDFptvP41MSnWofm8dnCm0256ZNfZIM7DSzuSMAFnjHA==}
    peerDependencies:
      zod: ^3.25.28 || ^4

  zod@4.4.3:
    resolution: {integrity: sha512-ytENFjIJFl2UwYglde2jchW2Hwm4GJFLDiSXWdTrJQBIN9Fcyp7n4DhxJEiWNAJMV1/BqWfW/kkg71UDcHJyTQ==}

snapshots:

  '@hono/node-server@2.0.12(hono@4.12.33)':
    dependencies:
      hono: 4.12.33

  '@modelcontextprotocol/sdk@1.30.0(zod@4.4.3)':
    dependencies:
      '@hono/node-server': 2.0.12(hono@4.12.33)
      ajv: 8.20.0
      ajv-formats: 3.0.1(ajv@8.20.0)
      content-type: 1.0.5
      cors: 2.8.6
      cross-spawn: 7.0.6
      eventsource: 3.0.7
      eventsource-parser: 3.1.0
      express: 5.2.1
      express-rate-limit: 8.6.1(express@5.2.1)
      hono: 4.12.33
      jose: 6.2.6
      json-schema-typed: 8.0.2
      pkce-challenge: 5.0.1
      raw-body: 3.0.2
      zod: 4.4.3
      zod-to-json-schema: 3.25.2(zod@4.4.3)
    transitivePeerDependencies:
      - supports-color

  '@msgpack/msgpack@2.8.0': {}

  '@types/body-parser@1.19.6':
    dependencies:
      '@types/connect': 3.4.38
      '@types/node': 24.13.3

  '@types/connect@3.4.38':
    dependencies:
      '@types/node': 24.13.3

  '@types/express-serve-static-core@5.1.3':
    dependencies:
      '@types/node': 24.13.3
      '@types/qs': 6.15.1
      '@types/range-parser': 1.2.7
      '@types/send': 1.2.1

  '@types/express@5.0.6':
    dependencies:
      '@types/body-parser': 1.19.6
      '@types/express-serve-static-core': 5.1.3
      '@types/serve-static': 2.2.0

  '@types/http-errors@2.0.5': {}

  '@types/node@24.13.3':
    dependencies:
      undici-types: 7.18.2

  '@types/qs@6.15.1': {}

  '@types/range-parser@1.2.7': {}

  '@types/send@1.2.1':
    dependencies:
      '@types/node': 24.13.3

  '@types/serve-static@2.2.0':
    dependencies:
      '@types/http-errors': 2.0.5
      '@types/node': 24.13.3

  accepts@2.0.0:
    dependencies:
      mime-types: 3.0.2
      negotiator: 1.0.0

  ajv-formats@3.0.1(ajv@8.20.0):
    optionalDependencies:
      ajv: 8.20.0

  ajv@8.20.0:
    dependencies:
      fast-deep-equal: 3.1.3
      fast-uri: 3.1.5
      json-schema-traverse: 1.0.0
      require-from-string: 2.0.2

  body-parser@2.3.0:
    dependencies:
      bytes: 3.1.2
      content-type: 2.0.0
      debug: 4.4.3
      http-errors: 2.0.1
      iconv-lite: 0.7.3
      on-finished: 2.4.1
      qs: 6.15.3
      raw-body: 3.0.2
      type-is: 2.1.0
    transitivePeerDependencies:
      - supports-color

  bytes@3.1.2: {}

  call-bind-apply-helpers@1.0.2:
    dependencies:
      es-errors: 1.3.0
      function-bind: 1.1.2

  call-bound@1.0.4:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      get-intrinsic: 1.3.0

  content-disposition@1.1.0: {}

  content-type@1.0.5: {}

  content-type@2.0.0: {}

  cookie-signature@1.2.2: {}

  cookie@0.7.2: {}

  cors@2.8.6:
    dependencies:
      object-assign: 4.1.1
      vary: 1.1.2

  cross-spawn@7.0.6:
    dependencies:
      path-key: 3.1.1
      shebang-command: 2.0.0
      which: 2.0.2

  crypto-js@4.2.0: {}

  debug@4.4.3:
    dependencies:
      ms: 2.1.3

  depd@2.0.0: {}

  dotenv@17.4.2: {}

  dunder-proto@1.0.1:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      es-errors: 1.3.0
      gopd: 1.2.0

  ee-first@1.1.1: {}

  encodeurl@2.0.0: {}

  es-define-property@1.0.1: {}

  es-errors@1.3.0: {}

  es-object-atoms@1.1.2:
    dependencies:
      es-errors: 1.3.0

  escape-html@1.0.3: {}

  etag@1.8.1: {}

  eventemitter3@5.0.4: {}

  eventsource-parser@3.1.0: {}

  eventsource@3.0.7:
    dependencies:
      eventsource-parser: 3.1.0

  express-rate-limit@8.6.1(express@5.2.1):
    dependencies:
      debug: 4.4.3
      express: 5.2.1
      ip-address: 10.4.0
    transitivePeerDependencies:
      - supports-color

  express@5.2.1:
    dependencies:
      accepts: 2.0.0
      body-parser: 2.3.0
      content-disposition: 1.1.0
      content-type: 1.0.5
      cookie: 0.7.2
      cookie-signature: 1.2.2
      debug: 4.4.3
      depd: 2.0.0
      encodeurl: 2.0.0
      escape-html: 1.0.3
      etag: 1.8.1
      finalhandler: 2.1.1
      fresh: 2.0.0
      http-errors: 2.0.1
      merge-descriptors: 2.0.0
      mime-types: 3.0.2
      on-finished: 2.4.1
      once: 1.4.0
      parseurl: 1.3.3
      proxy-addr: 2.0.7
      qs: 6.15.3
      range-parser: 1.3.0
      router: 2.2.0
      send: 1.2.1
      serve-static: 2.2.1
      statuses: 2.0.2
      type-is: 2.1.0
      vary: 1.1.2
    transitivePeerDependencies:
      - supports-color

  fast-deep-equal@3.1.3: {}

  fast-uri@3.1.5: {}

  finalhandler@2.1.1:
    dependencies:
      debug: 4.4.3
      encodeurl: 2.0.0
      escape-html: 1.0.3
      on-finished: 2.4.1
      parseurl: 1.3.3
      statuses: 2.0.2
    transitivePeerDependencies:
      - supports-color

  forwarded@0.2.0: {}

  fresh@2.0.0: {}

  function-bind@1.1.2: {}

  get-intrinsic@1.3.0:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      es-define-property: 1.0.1
      es-errors: 1.3.0
      es-object-atoms: 1.1.2
      function-bind: 1.1.2
      get-proto: 1.0.1
      gopd: 1.2.0
      has-symbols: 1.1.0
      hasown: 2.0.4
      math-intrinsics: 1.1.0

  get-proto@1.0.1:
    dependencies:
      dunder-proto: 1.0.1
      es-object-atoms: 1.1.2

  gopd@1.2.0: {}

  has-symbols@1.1.0: {}

  hasown@2.0.4:
    dependencies:
      function-bind: 1.1.2

  hono@4.12.33: {}

  http-errors@2.0.1:
    dependencies:
      depd: 2.0.0
      inherits: 2.0.4
      setprototypeof: 1.2.0
      statuses: 2.0.2
      toidentifier: 1.0.1

  iconv-lite@0.7.3:
    dependencies:
      safer-buffer: 2.1.2

  inherits@2.0.4: {}

  ip-address@10.4.0: {}

  ipaddr.js@1.9.1: {}

  is-promise@4.0.0: {}

  isexe@2.0.0: {}

  isomorphic-ws@5.0.0(ws@8.21.1):
    dependencies:
      ws: 8.21.1

  jose@6.2.6: {}

  json-schema-traverse@1.0.0: {}

  json-schema-typed@8.0.2: {}

  math-intrinsics@1.1.0: {}

  media-typer@1.1.1: {}

  merge-descriptors@2.0.0: {}

  mime-db@1.54.0: {}

  mime-types@3.0.2:
    dependencies:
      mime-db: 1.54.0

  ms@2.1.3: {}

  negotiator@1.0.0: {}

  object-assign@4.1.1: {}

  object-inspect@1.13.4: {}

  obs-websocket-js@5.0.8:
    dependencies:
      '@msgpack/msgpack': 2.8.0
      crypto-js: 4.2.0
      debug: 4.4.3
      eventemitter3: 5.0.4
      isomorphic-ws: 5.0.0(ws@8.21.1)
      type-fest: 3.13.1
      ws: 8.21.1
    transitivePeerDependencies:
      - bufferutil
      - supports-color
      - utf-8-validate

  on-finished@2.4.1:
    dependencies:
      ee-first: 1.1.1

  once@1.4.0:
    dependencies:
      wrappy: 1.0.2

  parseurl@1.3.3: {}

  path-key@3.1.1: {}

  path-to-regexp@8.4.2: {}

  pkce-challenge@5.0.1: {}

  proxy-addr@2.0.7:
    dependencies:
      forwarded: 0.2.0
      ipaddr.js: 1.9.1

  qs@6.15.3:
    dependencies:
      es-define-property: 1.0.1
      side-channel: 1.1.1

  range-parser@1.3.0: {}

  raw-body@3.0.2:
    dependencies:
      bytes: 3.1.2
      http-errors: 2.0.1
      iconv-lite: 0.7.3
      unpipe: 1.0.0

  require-from-string@2.0.2: {}

  router@2.2.0:
    dependencies:
      debug: 4.4.3
      depd: 2.0.0
      is-promise: 4.0.0
      parseurl: 1.3.3
      path-to-regexp: 8.4.2
    transitivePeerDependencies:
      - supports-color

  safer-buffer@2.1.2: {}

  send@1.2.1:
    dependencies:
      debug: 4.4.3
      encodeurl: 2.0.0
      escape-html: 1.0.3
      etag: 1.8.1
      fresh: 2.0.0
      http-errors: 2.0.1
      mime-types: 3.0.2
      ms: 2.1.3
      on-finished: 2.4.1
      range-parser: 1.3.0
      statuses: 2.0.2
    transitivePeerDependencies:
      - supports-color

  serve-static@2.2.1:
    dependencies:
      encodeurl: 2.0.0
      escape-html: 1.0.3
      parseurl: 1.3.3
      send: 1.2.1
    transitivePeerDependencies:
      - supports-color

  setprototypeof@1.2.0: {}

  shebang-command@2.0.0:
    dependencies:
      shebang-regex: 3.0.0

  shebang-regex@3.0.0: {}

  side-channel-list@1.0.1:
    dependencies:
      es-errors: 1.3.0
      object-inspect: 1.13.4

  side-channel-map@1.0.1:
    dependencies:
      call-bound: 1.0.4
      es-errors: 1.3.0
      get-intrinsic: 1.3.0
      object-inspect: 1.13.4

  side-channel-weakmap@1.0.2:
    dependencies:
      call-bound: 1.0.4
      es-errors: 1.3.0
      get-intrinsic: 1.3.0
      object-inspect: 1.13.4
      side-channel-map: 1.0.1

  side-channel@1.1.1:
    dependencies:
      es-errors: 1.3.0
      object-inspect: 1.13.4
      side-channel-list: 1.0.1
      side-channel-map: 1.0.1
      side-channel-weakmap: 1.0.2

  statuses@2.0.2: {}

  toidentifier@1.0.1: {}

  type-fest@3.13.1: {}

  type-is@2.1.0:
    dependencies:
      content-type: 2.0.0
      media-typer: 1.1.1
      mime-types: 3.0.2

  typescript@5.9.3: {}

  undici-types@7.18.2: {}

  unpipe@1.0.0: {}

  vary@1.1.2: {}

  which@2.0.2:
    dependencies:
      isexe: 2.0.0

  wrappy@1.0.2: {}

  ws@8.21.1: {}

  zod-to-json-schema@3.25.2(zod@4.4.3):
    dependencies:
      zod: 4.4.3

  zod@4.4.3: {}
