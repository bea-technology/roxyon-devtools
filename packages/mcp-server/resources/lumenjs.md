# LumenJS — Complete Reference for AI Models

> **Audience note for the reader (human or AI):** this document assumes you already know Vue and/or React well, and explains LumenJS **by contrast**. Wherever LumenJS syntax visually resembles Vue or React, assume it behaves like Vue/React **unless this document explicitly says otherwise** — the differences are usually small but breaking (e.g. `:if` looks like Vue's shorthand-bind but is actually Vue's `v-if`).

> **Target version: LumenJS V1.** Everything in this document describes V1,
> which is what the Rahimoun app and the Console are written in. V1 requires
> explicit `bind=` declarations for reactivity (§5.1) and `var` for every bound
> variable. A later V2 removes `bind` in favour of automatic reactivity — do not
> mix V2 idioms into V1 code.

**Sources used to compile this document:**
- The live `lumenjs.com` docs-site checkout (sparse — only a loops guide and a header widget survive in the current working copy).
- A fuller historical archive of the same docs site (`_ws17/lumenjs.com`, `lumenjs.com_bu`), which contains ~50 additional guide pages not present in the current checkout (routing, modals, storage, drag/sort, events, uploader, realtime API, etc).
- The compiled framework engine itself (`Rahimoun/src/js/bea.js`), reverse-read for directive names and exact runtime behavior.
- A large real production app (**Rahimoun**, a charity-management SPA) for real-world usage patterns across ~150 `.view` files.

Where the docs-site prose and the engine source disagreed or a feature was undocumented, the engine source (i.e. actual runtime behavior) was treated as authoritative.

---

## 1. What LumenJS is

LumenJS is a small, **no-build, no-virtual-DOM** reactive framework created by a company called BEA (also the name behind `beacdn.com`, `beaapis.com`, `bea.sa`). It ships as a single client-side script (historically loaded from a CDN, e.g. `https://s.beacdn.com/e/`, plus a local compiled copy such as `bea.js`) built on top of jQuery. There is no compilation step for the framework itself — `.view` files are plain HTML+JS+CSS files fetched and interpreted directly in the browser.

It is paired with a companion CSS framework called **Mobius CSS**, which supplies the utility classes (`w50`, `p20`, `round`, `fs16`, `c`, `l`, `r`, etc.) and a handful of custom elements used purely for layout (`<tbl_nm>`, `<rw>`, `<cl>`, `<grid>`, `<grid_nm>`). **These layout tags are not LumenJS directives** — they're Mobius CSS's flexbox/table abstraction, analogous to Bootstrap's `<div class="row">`/`<div class="col">`. This document does not attempt to be a Mobius CSS reference; only the LumenJS-authored parts of markup are documented in full.

There is also a companion CLI (`@lmjs/cli`, invoked as `lm`, `lu`, or `lumen`) that scaffolds and serves projects.

### Mental model, contrasted with Vue/React up front

| Concept | Vue / React | LumenJS |
|---|---|---|
| Compilation | Vue SFCs / JSX compile to render functions | **None.** `.view` files are HTML fetched over the network and diffed/patched live by the runtime |
| Component identity | Explicit component classes/functions with lifecycle | A "view" is just an HTML file; a "component" (`comp=`) and a "template" (`tpl=`) are two *other*, different kinds of reusable HTML files — see §4 |
| State declaration | `data()`/`ref()`/`useState()` | **`var` (never `let`/`const`) in a `<script>` tag inside the view.** A variable becomes reactive only when named in `bind="varName"` on an ancestor element — see §5.1 |
| Routing | A router library (vue-router, react-router) with route config | **URL path segments map directly to nested view files on disk.** No route config; `nodes[n]` gives you the URL segments at runtime (§9) |
| Global store | Vuex/Pinia/Redux/Context | A single global `globals` object, auto-persisted to `localStorage` |
| List rendering | `v-for` / `.map()` | `:for` — similar syntax, very different semantics (arrays *or* a plain number to repeat N times) — see §6.1 |
| Conditional rendering | `v-if`/`v-else-if`/`v-else` or ternaries/`&&` | `:if` / `:else-if` / `:else` — **same names as Vue minus the `v-` prefix**, and mostly the same semantics |
| Two-way form binding | `v-model` | **No `:model` equivalent exists.** Forms are handled wholesale via `o-sub`/`b-sub` on the `<form>` (§7) |
| Event binding | `@click` (Vue) / `onClick` (React) | `@click` — **same syntax as Vue**, but the event catalog is much larger (touch/swipe/drag/sort/scroll — §6.3) and handlers receive `(ev, el)` where `el` is a **jQuery-wrapped** element, not a native DOM node |
| HTTP client | fetch/axios + your own code | Built-in global `API.get/post/put/delete/patch(path, data, headers, api_index)`, configured via `config.json` |
| Watchers | `watch()`/`useEffect()` | A single global `watch = { varName: fn }` object (§5.3) |

---

## 2. Project anatomy

A LumenJS project (scaffolded by `lm create`) has this shape (from the real `Rahimoun` app):

```
src/
  index.js            # Reactor() bootstrap — the only mandatory JS entry point
  index.html           # shell HTML: <script> tags + <div main></div> mount point
  config.json           # API base URLs/headers + local dev server + (optionally) FTP deploy config
  css/                  # plain CSS
  js/                   # bea.js (the compiled engine) + any extra scripts
  views/                 # every .view file = one URL route (see §9)
    home.view
    login.view
    account/
      admin/
        dashboard.view          -> /account/admin/dashboard
        modals/
          user.view              -> opened as a modal, not a route
      widgets/
        header.view              -> shared chrome, not a route
  tpls/                  # .tpl files: list-item / row templates rendered via `tpl="name"` (see §4.3)
  comps/                 # .tpl files: reusable "components" rendered via `comp="name"` (see §4.2)
```

There is no `dist/` step required during development; `lm build` produces a deployable bundle (optionally `--serverless`) and `lm build --deploy` / `lm build --serverless --deploy` push it directly.

### 2.1 Which files in THIS repo are production (important)

Most of this repo is **old UI kept for reference only**. Do not treat a stale file
as evidence of current conventions, schema, or stack.

**Production-ready:**

| Path | Notes |
|---|---|
| `src/views/_dashboards/cloudhosting/**` | all files; finalized, Hetzner-Console-style UI |
| `src/views/_forms/` | only `pay.view`, `domains_create.view`, `cloudhosting_create.view` |
| `src/views/_lists/` | all |
| `src/views/modals/` | only `pay`, `done`, `confirm_payment` |
| `src/views/_account/` | `invoices`, `members`, `profile`, `settings` |
| `src/views/*.view` | top-level routing shells: `account`, `cloudhosting`, `domains`, `auth`, `dashboard` |

**Everything else is stale reference.** Notably `src/views/modals/add_domain.view`
is NOT production — its "System (Apache) Page" strings contradict the real stack.

### 2.2 Platform facts

- Web server is **nginx**. There is no `.htaccess`; per-site rules are generated
  nginx config plus a reload.
- Each hosting subscription is an **Incus container** ("Roxyon Secure Isolation
  Layer"), so per-account CPU/memory/process/inode metrics are obtainable.
- The realtime backend is **Swoole over WebSocket**.
- Production code calls the backend through the app wrappers **`rx.*` / `engine.*`**,
  not the generic `API.*` global documented in §10.

### CLI commands (exhaustive, from the docs)

```bash
npm i @lmjs/cli -g       # install the CLI
lm create My First Project  # scaffold a new project
lm run                  # or: lm serve — dev server
lm create -v myview      # scaffold a new top-level view
lm create -s mysubview   # scaffold a sub-view
lm create -t mytpl       # scaffold a template (tpls/ file)
lm purge                 # purge offline cache (PWA-style)
lm build                 # production build + Node.js server
lm build --deploy        # ...and deploy
lm build --serverless    # production build, no server
lm build --serverless --deploy   # ...and deploy
```

---

## 3. Bootstrapping: `Reactor(...)`

`index.js` calls a single global function, `Reactor`, once:

```js
Reactor({
  App: "[main]",          // name of the main view component (mount target)
  defaultView: "home",     // view shown at "/"
  authView: "login",       // view shown when `auth()` returns false
  init: function () {
    // runs once, before first render — do async bootstrap fetches here
  },
  tick: function () {
    // runs after EVERY re-render (any reactive variable change), like a
    // global post-render hook. No dependency array — it just always fires.
  },
  auth: function () {
    return true; // gate for any view whose <settings> declares requireAuth: true
  },
});
```

Contrast with Vue/React: there is no equivalent of `createApp().mount()` with a component tree — `Reactor()` *is* the entire app definition. `tick` has no React/Vue analogue; it is closest to a global, un-scoped `useEffect` with no dependency array that runs after *every* DOM patch anywhere in the app.

`Reactor` also exposes methods for programmatic control: `render`, `navigate`, `authorize`, `deauthorize` (documented but usage examples were not recovered from the archives).

---

## 4. Three kinds of reusable HTML: views, components, templates

LumenJS has **three distinct file kinds**, easy to conflate with Vue/React "components" — they are not interchangeable:

| Kind | Folder | Invoked with | Maps to a URL? | Analogue |
|---|---|---|---|---|
| **View** | `views/` | automatically, by URL path, or `view="path/to/file"` | Yes (top-level) / No (sub-view) | Vue/React "page" component |
| **Component** | `comps/` | `<div comp="name" :data="varName"></div>` | Never | A reusable Vue/React component |
| **Template** | `tpls/` | `<div tpl="name">` — almost always paired with `:for` to render one template per array item | Never | A Vue `<slot>`-less render-prop / list-item partial |

### 4.1 Views and sub-views

A `.view` file can freely mix HTML, a `<script>` block, and a `<style>` block — order doesn't matter, and there's no single-file-component wrapper syntax (no `<template>` tag like Vue SFCs — the whole file body up to `<script>`/`<style>` *is* the template).

```html
<div class="textColor" bind="text">
    This is your text: {{text}}
</div>
<script>
    var text = "Hello World !";
</script>
<style>
    .textColor { color: green; }
</style>
```

A **sub-view** is just another view file nested inside a parent via the `view` attribute:

```html
<div view="child"></div>
```

Pass data down to it with `:data` (the child must `bind` the same variable name to render it):

```html
<div bind="text,childName">
    This is your text: {{text}}
    <div view="child" :data="childName"></div>
</div>
<script>
    var text = "Hello World !";
    var childName = "Mike";
</script>
```

Inside `child.view`, the passed value shows up as a same-named variable (bound implicitly) — there is no `props` object for views the way there is for components (see below) or modals (see §8).

**Per-view settings** — a `<settings>` block (JSON) controls chrome and auth:

```html
<settings>
{
    "hasNav": false,
    "hasHeader": false,
    "hasFooter": false,
    "requireAuth": false
}
</settings>
```
`hasNav`/`hasHeader`/`hasFooter` accept `true`, `false`, or a string path to a custom widget view. `requireAuth: true` routes unauthenticated visitors to `authView` (via the `Reactor` `auth()` callback).

### 4.2 Components (`comps/*.tpl`, invoked with `comp=`)

```html
<!-- comps/comp.tpl -->
<div bind="compName">
    Hello I'm a Component called ~ {{compName}} ~
</div>
```
```html
<!-- calling view -->
<div bind="compName">
    Below is a Component
    <div comp="comp" :data="compName"></div>
</div>
<script>
    var compName = "Mike";
</script>
```
Functionally very similar to a sub-view invoked with `view=` — the docs themselves describe components as "a multi-used item," e.g. a card used in several places. In practice, real code (Rahimoun) leans on `tpl=` far more than `comp=` for this purpose.

### 4.3 Templates (`tpls/*.tpl`, invoked with `tpl=`)

Templates are almost always combined with `:for` to render one instance per collection item, with the loop item's own scope available inside — this is the real workhorse for list rows/cards in production code:

```html
<!-- tpls/item.tpl -->
<tbl_nm class="" fixed>
    <rw>
        <cl :for="lstOpts['columns'] as key,cl" :for-if="!cl['hide']">
            <div :if="key=='Status'">{{ statuses[item[key]].name }}</div>
            <div :else>{{ item[key] }}</div>
        </cl>
    </rw>
</tbl_nm>
```
```html
<!-- calling view/template -->
<li :for="lstOpts['items'] as item; lok" tpl="item"></li>
```

`tpl` also accepts an **inline attribute-value template literal** convention used pervasively for computed class strings — see §6.5.

### 4.4 The built-in list components: `<lst>` and `<lmlst>`

Two engine-provided custom elements exist purely to render paginated/data-bound lists without hand-rolled `:for` markup, seen throughout Rahimoun:

```html
<lst class="clear" tpl="list" :data="lstOpts"></lst>
```
```html
<lmlst @query="queryList" :config="myConfig" />
```
`<lst>` renders via a `tpls/list.tpl` template you supply (itself using `:for`/`:for-if`/`tpl="item"` internally, plus a `<lst-footer>` pager block driven by `lstOpts.page`/`lstOpts.pages`). `<lmlst>` is a newer/alternate variant driven by a `:config` object and a `@query` event instead of a pre-fetched `lstOpts` object. Neither has a public options reference recovered from the docs archive — treat them as app-level list-rendering sugar built on the primitives documented below, not a documented public API surface.

---

## 5. Reactivity

### 5.1 `bind` — declaring what's reactive

**This is the single biggest conceptual difference from Vue/React**, and the one most likely to trip up a model that "fills the gap with Vue by default":

- In Vue, *any* variable returned from `setup()`/`data()` is reactive everywhere it's used, automatically.
- In LumenJS, a variable in a view's `<script>` is **not tracked for re-rendering unless some ancestor element carries `bind="thatVariableName"`**.

```html
<div bind="name">
    <p>My name is: {{name}}</p>
</div>
<script>
    var name = "Raouf";
</script>
```

#### Rule 1 — reactive state is declared with `var`, never `let` or `const`

Any variable named in a `bind=` attribute **must** be declared with `var` in the
view's `<script>`. This is not a style preference; `let` and `const` are
block-scoped and are not visible to the runtime's expression evaluator, so a
`bind`-ed `let` silently never renders and never updates. There is no error.

```html
<!-- CORRECT -->
<script>
    var items   = [];
    var loading = false;
</script>

<!-- BROKEN — renders nothing, reports nothing -->
<script>
    let items    = [];
    const loading = false;
</script>
```

`let`/`const` are fine for variables that are **never** named in a `bind=` and
never appear in `{{ }}` — loop counters inside a function body, intermediate
values, and so on. The moment a variable is rendered or bound, it must be `var`.

#### Rule 1b — `bind` renders DESCENDANTS only, never its own element

The element carrying `bind` does **not** get its own attributes interpolated —
only the subtree beneath it. So `bind` always goes on the **parent** of whatever
needs rendering.

```html
<!-- BROKEN — renders the literal {{nodes[1]}} into the href -->
<a href="/cloudhosting/{{nodes[1]}}/advanced" bind="nodes">Back</a>

<!-- CORRECT — bind on the parent -->
<flx bind="nodes">
    <a href="/cloudhosting/{{nodes[1]}}/advanced">Back</a>
</flx>
```

The bind list controls **when** to re-render, not what is resolvable: a subtree
under `bind="globals"` can still interpolate `{{nodes[1]}}` fine.

#### Rule 1c — never nest a `bind` inside another `bind`

A `bind` on a descendant of another `bind` silently stops the subtree rendering;
interpolations come out empty with no error. Use **sibling** binds for independent
regions, never nested ones. One bind per region is enough.

#### Rule 1d — put `bind` on the lowest element that needs it

A bound subtree is re-rendered **wholesale**, so everything inside is rebuilt:
a Select2 control is re-initialised, an input the user is typing into is emptied,
a `<select>` loses its selection. Keep static or stateful controls **outside** the
bound region, and bind only the part that actually changes.

#### Rule 1e — `:if` goes on a CHILD of the bound element

Never on the bound element itself (any depth below is fine):

```html
<div bind="alerts">
    <flx :if="alerts.length > 0"> … </flx>
</div>
```

Give such a wrapper `display: contents` so it does not become a flex item and
introduce a stray gap.

#### Rule 2 — every rendered variable needs a `bind` ancestor

`bind` takes a **comma-separated list** of variable names: `bind="items,index"`.
Nothing is inferred from usage inside `{{ }}` — every top-level variable you
mutate and expect to re-render must be listed explicitly on an enclosing
element.

Omitting `bind` is the single most common failure mode when writing LumenJS
with Vue habits: the initial value renders once and then never updates again,
with no console error and no visible symptom until a user reports stale data.
If a value appears in `{{ }}` or drives a `:if` / `:for`, it belongs in a
`bind`.

One `bind` on a wrapper covering the whole reactive region is idiomatic;
scattering many small `bind`s is not:

```html
<div bind="items,loading,filters">
    <div :if="loading">Loading…</div>
    <div :for="items as item">{{ item.Name }}</div>
</div>
```

Contrast with Vue: there is no reactive-proxy wrapping of the variable itself —
mutating `items.push(x)` works because LumenJS re-diffs the DOM subtree under
the nearest `bind` ancestor, not because the array became a Proxy. Equally,
**reassigning** the whole variable (`items = newArray`) is fine and is the
normal pattern after a fetch; Vue's `.value` / immutable-update rules do not
apply.

### 5.2 `{{ }}` interpolation, and the backtick variant

Standard interpolation is `{{ expression }}` — this works in text nodes and (unlike Vue) directly inside quoted attribute values:

```html
<p>My name is: {{ Ourarray[`Ourindex`] }}</p>
```
Note the inner variable-in-a-variable syntax: to index an array/object with another *variable's* value inside `{{ }}`, wrap the index variable in backticks: `{{ Ourarray[\`Ourindex\`] }}`. This is **not** a JS template literal — it's LumenJS's own escape hatch inside the moustache parser to disambiguate "the literal key `Ourindex`" from "the value of the variable `Ourindex`."

A **second, different** backtick convention shows up in real production attribute values — wrapping an *entire* `{{ }}` expression (not just a sub-key) in backticks, seen extensively for computed class/style strings:

```html
<cl class="`{{lstOpts['columns'][key]['_mini'] ? 'lst-cl-mini' : 'lst-cl'}}`">
```
This is the safe way to interpolate an expression that itself contains quotes (ternaries with string literals) into an already-quoted attribute — plain `{{ }}` works for simple attribute interpolation, but reach for the backtick-wrapped form once the expression contains its own `'single quotes'`.

### 5.2b Function calls inside `{{ }}` are not re-evaluated

A function call in a moustache renders once and then goes **stale** — it is not
re-run when the subtree re-renders. Compute into a plain `var` and render that,
recomputing wherever the state changes:

```html
<!-- stale after the first render -->
<pre>{{buildNginx()}}</pre>

<!-- correct -->
<pre>{{confText}}</pre>
```
```js
function commit() {
    rules = rules.slice();
    confText = buildNginx();   // recompute on every mutation
}
```

### 5.3 `watch` — the global watcher object

There is no per-component `watch()` call. There is exactly **one** global object, `watch`, keyed by variable name:

```js
watch = {
    myVariable: function () {
        // fires whenever `myVariable`'s value changes (deep — including nested object mutation)
    },
};
```
**Gotcha (explicitly called out in the docs):** `watch = {...}` is a plain object *assignment*, so declaring it twice **overwrites** the first set of watchers entirely — there's no merging. Two safe patterns:
```js
// 1. one object literal, multiple keys
watch = {
    myKey: function () { /* ... */ },
    myKey2: function () { /* ... */ },
};
// 2. property assignment, anywhere, any number of times
watch["myKey3"] = function () { /* ... */ };
```
This is a sharp edge with no Vue/React equivalent — Vue's `watch: {}` option and multiple `watch()` calls never clobber each other like this.

### 5.4 `tick()` — global post-render hook

Declared once, inside `Reactor({...})` (§3). Fires after *every* re-render anywhere in the app — there's no scoping, no dependency array, and no per-component equivalent.

### 5.5 `nodes` — the URL, pre-split

```js
alert(nodes); // e.g. ["guide", "global-variables", "nodes"]
```
`nodes` is the URL path split on `/`. **`nodes[0]` is always the main/top-level view name.** Nested sub-view routing (e.g. `views/_guide/*.view` dispatching on `nodes[1]`) is done by hand, by `bind`-ing `nodes` and rendering `<div view="_guide/{{nodes[1]}}/{{nodes[2]}}"></div>` with a default fallback:
```html
<div bind="nodes">
    <div view="_guide/{{nodes[1]}}/{{nodes[2]}}"></div>
</div>
<script>
    if (!nodes[2]) nodes[2] = "structure";
</script>
```
This is the entirety of LumenJS's router — **there is no route-config file, no `<Route>` component, no `useParams()`.** Nesting is just string-building a `view=` path out of `nodes[n]` segments yourself.

### 5.6 `globalWatch()` — re-scanning DOM you inserted yourself

When you build HTML as a string and drop it in with `$(sel).html(...)`, `.append(...)`,
`el.insertAdjacentHTML(...)` etc., LumenJS **does not know it happened**. The engine
only scans on its own render passes. Anything in that fragment that relies on the
engine wiring something up stays dead until you call the global **`globalWatch()`**.

`globalWatch()` (defined in `bea.js`) runs, in order: re-executes any
`<script type="beajs">` blocks → binds every `[bind]:not(.binded)` → then
`renderViewsTpls()` (`[view]` / `[tpl]` / `[comp]`) → `renderPlugins()` → `loadPics()`
(`[lazy]`) → `reloads()` → `tick()`.

`renderPlugins()` is the important one — it is what initialises:

| selector | becomes |
|---|---|
| `[sl]:not(.select2-hidden-accessible)` | a Select2 control |
| `form:not(.binded,[norm])` | an `o-sub` / `b-sub` intercepted form |
| `[crslf]:not(.flickity-enabled)` / `[crsl]:not(.crsl-initialized)` | a carousel |
| `[up]:not([upid])` | a file-drop uploader (injects the hidden `<input type=file>`) |

Every one of those has a `:not(...)` guard, so **`globalWatch()` is idempotent** —
calling it again never double-initialises what's already live. Call it once, after
the DOM insert:

```js
$('.host').html('<select sl sl-prt="self" name="zone">' + opts + '</select>');
globalWatch();                       // now it's a Select2, not a bare <select>
```

**What does NOT need `globalWatch()`:** `@click` / `@change` / other `@event`
directives in injected HTML already work — the engine delegates events from
`document`, so a handler on a `<span @click="fn">` fires even though the span was
added after render (this also survives Iconify swapping the `<span class="iconify">`
for an `<svg>`). It is only the *plugin-wrapping* attributes above, plus `[bind]`
and `{{ }}` interpolation, that need the re-scan.

**Iconify** specifically: `<span class="iconify" data-icon="…">` is picked up by
Iconify's own `MutationObserver`, so it usually renders on its own — but after a big
`innerHTML`/`outerHTML` swap call `Iconify.scan()` (guarded: `window.Iconify && Iconify.scan()`)
if an icon fails to appear. **Do not `addClass`/`removeClass` an iconify element to change
its state** (e.g. a green "on" class): Iconify replaces the `<span>` with a freshly built
`<svg>` and re-copies the *placeholder's original* class string, so a class you added a tick
earlier is silently dropped. Toggle the class on a non-iconify wrapper, or use a plain
element for the stateful control (a CSS pill switch, etc.).

---

## 6. Directives — exhaustive reference

Attribute-directive syntax uses two prefixes, both borrowed visually from Vue: `:` for data/structural bindings, `@` for events. **Do not assume Vue semantics beyond the name** — cross-reference every entry below.

### 6.1 `:for` — loops (contrast: Vue `v-for`)

| Vue `v-for` | LumenJS `:for` |
|---|---|
| `v-for="item in items"` | `:for="items as item"` |
| `v-for="(item, i) in items"` | `:for="items as item; i"` (custom index name after `;`) |
| `v-for="(val, key) in obj"` | `:for="myObject as key, value"` |
| `v-for="n in 5"` (Vue supports N too) | `:for="5"` |
| implicit loop var `item` name required | **default item/index names exist**: bare `:for="items"` (no `as`) still gives you `{{ number }}`-style item fields directly in scope, plus a magic `index` variable, with no `as` clause at all |
| key required (`:key`) | no key attribute exists or is needed |

Forms, exhaustively:
```html
<li :for="items">The number is: {{number}}</li>              <!-- array of objects, no alias -->
<div :for="3">Item {{index}}</div>                            <!-- fixed repeat count, no data -->
<li :for="cartItems as item">{{ item }}</li>                  <!-- array, aliased -->
<rw :for="myData as item">...</rw>                             <!-- array of objects, aliased -->
<li :for="myObject as key, value">{{ key }}: {{ value }}</li>  <!-- object iteration -->
<li :for="newItems as item">{{ index + 1 }}. {{ item }}</li>   <!-- magic `index`, 0-based -->
<li :for="newItems as item; myIndex">{{ myIndex + 1 }}. {{ item }}</li> <!-- custom index name -->
```

**Attributes on the `:for` element itself need backticks.** Interpolation in an
attribute of the looping element only resolves when the moustache is wrapped in
backticks — that is what tells the engine to evaluate it in loop scope. Object-key
iteration uses **double** backticks:

```html
<div :for="arrayOfElements as kuku" data-id="`{{kuku + ' ' + index}}`">
<div :for="ObjectData as k,v"       data-id="``{{k}}``">
```

Without the backticks the attribute renders empty. (Descendants of the loop element
interpolate normally, so the alternative is to put the loop on a bare wrapper and
the interpolated attributes on an inner element.)

**Never put `:for` inside a form control or anything holding live state.** A V1
re-render rebuilds the subtree and destroys that state — a `<select>` loses its
selection, and an input the user is mid-way through typing into is emptied. Build
those options as an HTML string in JS and inject them with `.html()`, or write them
out literally in the markup:

```js
// idiomatic: see modals/email_create.view
$('select[name="Domain"]').html(opts.join(''));
```

**Nested `:for` does not resolve the inner loop variable.** An inner loop inside an
outer one renders the right number of rows but every interpolation comes out empty
(the DOM shows `clone="x"` with blank values). Build nested structures as an HTML
string in JS and inject them, as `sites.view`'s `gridRender` and
`applications.view` do.

`:for` is also **slow for large loops** in V1 — prefer building rows as an HTML
string (as `lmlst`'s `gridRender` does) for anything long.

A `:for` array does **not** need to be in a `bind` unless it changes; bind it so the
DOM updates when it does.

**Loop modifiers** (siblings of `:for` on the same element — no Vue equivalent at all):
```html
<li :for="items2 as item"
    :for-limit="5"     <!-- render at most 5 -->
    :for-offset="2"    <!-- skip the first 2 -->
    :for-if="item.value > 10"> <!-- per-item conditional filter, applied before limit/offset -->
    {{ item.key }}: {{ item.value }}
</li>
```

### 6.2 `:if` / `:else-if` / `:else` — conditionals (contrast: Vue `v-if`/`v-else-if`/`v-else`)

Naming and chaining semantics are essentially identical to Vue (adjacent-sibling chain, first true branch wins, `:else` has no value):
```html
<button :if="!isLoggedIn">Login</button>
<p :if="age < 18">...</p>
<p :else-if="age < 21">...</p>
<p :else>...</p>
```
Unlike React's `{cond && <X/>}` or `? :`, and like Vue, these are DOM-structural — the element (and, per the engine's `refItem`/`getRefTree` logic, matching `:for` blocks) is only materialized when true, not merely hidden.

### 6.3 Events — `@eventName="handler"` (contrast: Vue `@click`, React `onClick`)

Syntax matches Vue exactly: `@event="functionName"` (calls a global function) or `@event="inline js expression"`. **Handler signature differs from both Vue and React**: every handler receives `(ev, el)`:
- `ev` — the native-ish event object (`ev.type` tells you which concrete event fired for multiplexed handlers like drag/scroll/sort, see below).
- `el` — **a jQuery-wrapped element**, not a raw DOM node and not a component-ref. Use `el.css(...)`, `el.data(...)`, `el.val()`, etc. Get the raw DOM node with `el[0]`.

```html
<button @click="handleButtonClick">Click me</button>
<script>
function handleButtonClick(ev, el) { alert("clicked"); }
</script>
```

**Full event catalogue** (exhaustive, gathered from docs + engine):

*Click/tap:*
`@click`, `@dblclick`, `@clickhold`, `@click2` (two-finger click), `@click2hold`, `@singleclick` (debounced single click), `@tap`, `@dbltap`, `@taphold`, `@tap2`, `@tap2hold`, `@singletap`

*Swipe / orientation:*
`@swipe`, `@swipe-left`, `@swipe-right`, `@swipe-up`, `@swipe-down`, `orientationchange` (window-level, not per-element)

*Mouse:*
`@mouse-over`, `@mouse-enter`, `@mouse-move`, `@mouse-leave`, `@mouse-out`, `@mouse-up`, `@mouse-down` — note the **hyphenated** form (not `@mouseover` camelCase like a native DOM listener, and not Vue's `@mouseover`)

*Scroll:*
`@scroll`, `@scroll-start`, `@scroll-end`, `@scroll-bottom`, `@scroll-top`, `@scroll-right`, `@scroll-left` (the last four fire once when the scroll container hits that edge)

*Drag (requires the `drag` attribute on the element, see §6.4):*
`@drag` (continuous, while dragging), `@drag-start`, `@drag-stop`

*Sort (requires the `sort` attribute on the container, see §6.4):*
`@sort` (fires per reorder), `@sort-start`, `@sort-stop`, `@sort-change` (live, during drag), `@sort-update` (final, on drop) — handlers for the `-start/-stop/-change/-update` variants receive a third argument `ui` with `ui.originalPosition.{left,top}`

*Forms:* standard `@change`, `@blur`, `@focus`, `@keydown`, `@keyup`, `@keypress` (native-named, unlike the hyphenated mouse events)

*File drop / upload (see §6.6):* `@drop`, `@file-removed`, `@file-uploaded`, `@files-added`, `@upload-progress`

*Modal (see §8):* `@modal-open`, `@modal-close`, `@modal-beforeclose`

*Select2 wrapper (see §6.7):* `@sl-select`, `@sl-unselect`

*Custom list widget:* `@query` (used by `<lmlst>`, §4.4)

### 6.4 Draggable / sortable

No attribute value is required to turn on the behavior — presence of the bare attribute is enough:
```html
<div drag class="grab">Drag me</div>
<div drag drag-revert="false">Drag me!</div>   <!-- default true: snaps back after drop -->

<ul sort>
    <li :for="4">{{index+1}}</li>
</ul>
```
Combine with the drag/sort events from §6.3 to react to movement.

### 6.5 Modals

See §8 for the full write-up; attribute summary:
`modal="path/to/subview"`, `modal-class="css-class"`, `modal-title="..."`, `modal-description="..."`, `close-modal` (bare attribute on any element inside the modal, closes it like the X button).

CSS targeting hooks for the modal chrome (Mobius CSS classes, not directives, but only meaningful in this context): `pop-c` (content), `pop-x` (close X), `pop-h` (header), `pop-t` (title), `pop-d` (description), `pop-b` (body).

### 6.6 Forms — `o-sub`, `b-sub`, `norm`

**There is no `:model`/`v-model` two-way-binding directive in LumenJS.** Forms are handled wholesale on submit, not field-by-field:

| Attribute | Behavior |
|---|---|
| *(none — default)* | Submitting navigates to `action` (if present) or stays on the same view; input values land in `View.props` (or `View.params` if `method="get"`, as a query string) of the target view. Works with zero JS. |
| `o-sub="fnName"` | Fires `fnName(f, d)` **on submit**, where `f` is the form node and `d` is an object of `{name: value}` for every input. **Mutually exclusive with `action`/`method`/`target`** — combine with `pushURL(...)` inside the handler to navigate (see §9.2). |
| `b-sub="fnName"` | Fires `fnName(f, d)` **before** submit; `return false` cancels the submission (validation gate) — otherwise behaves like a normal form (respects `action`). |
| `norm` (bare) | Opts the `<form>` back out of all LumenJS interception — plain full-page-reload HTML form behavior. |

```html
<form o-sub="onSubmit">
    <input type="text" name="name">
    <input type="submit" value="submit">
</form>
<script>
function onSubmit(f, d) {
    pushURL("/view-example", { "data": d });
}
</script>
```

Field-level validation: add `:required` to an `<input>`/`<select>`/`<textarea>` — the engine adds a `.required` class to the closest `<label>` and blocks submission (adding a `.validation-error` class to the form) if empty. This is the closest thing to Vue/React form validation primitives that exists — there's no per-field custom-validator directive beyond this boolean required check plus your own `b-sub` logic.

### 6.7 Select2 wrapper (`sl-*`)

A large family of attributes wraps the Select2 jQuery plugin onto `<select>`-like elements. Confirmed from the engine: `sl-id`, `sl-value` (preselect a value), `sl-text`, `sl-query` (name of a global function used as a custom async data source), `sl-class`, `sl-dir`, `sl-min`/`sl-mins` (`minimumResultsForSearch`, default 10 — set high to hide the search box), `sl-nrmsg` (no-results message), `sl-ntgs` (allow free-text tags), `sl-prt` (dropdown parent selector, or `"self"` → the select's `.parent()`; default `"body"`), `sl-nosrch`/`nosearch` (disable search box), plus events `@sl-select`/`@sl-unselect`. Treat this family as "Select2 configuration surface," not core reactivity — there is no dedicated guide page recovered for it; behavior above is reconstructed from the compiled engine.

**Verified from the compiled wrapper (`bea.js`):**

- The init selector is `$("[sl]:not(.select2-hidden-accessible)")`, run inside
  `renderPlugins()`. A `[sl]` select you inject with jQuery/vanilla stays a raw
  browser control until the next `globalWatch()` (§5.6) — or init it by hand,
  `$(sel).select2({ dropdownParent: $(sel).parent(), ... })`, guarded by the same
  `:not(.select2-hidden-accessible)` check.
- **Clear button is opt-in via the bare `clear` attribute** (changed 2026-08-31;
  was hardcoded `allowClear:true` before). `<select sl>` → no clear ×;
  `<select sl clear>` → shows it, styled in the Console as a solid dark-red (`#900`)
  square button (`styles.css`, `.select2-selection__clear`). Only add `clear` when
  an empty/unset value is actually meaningful for that field.
- After replacing a select's `<option>`s with `$(sel).html(opts)`, call
  `$(sel).trigger('change')` so the Select2 display re-reads them.

### 6.8 DOM utility / class-toggle directives (no Vue/React equivalent at all)

These exist because LumenJS has no component-local state for simple UI toggles (open/closed menus, active tabs) — instead you point one element at another by CSS selector:

| Attribute | Behavior |
|---|---|
| `t="<selector>"` + `tcn="<class>"` | On click/touch of the element carrying `t`, **toggle** class `tcn` (default `"active"`) on the element(s) matched by the selector in `t`. Also toggles `.toggled` on the trigger itself. Seen used for mobile-menu hamburgers: `<div t=".mobileMenu,.header__btnmenu" tcn="active">`. |
| `acl="<selector>"` + `aclcn="<class>"` (add-class), `rcl="<selector>"` + `rclcn="<class>"` (remove-class) | Same idea, but split into an explicit add-target and remove-target instead of a single toggle target — used when opening one panel must simultaneously close a different one. |
| `actv` (value = selector or empty) | On click, removes `.active` from the selector's matches (if given) and adds `.active` to itself. A crude "only one of these is active" pattern with **no data model backing it** — purely a DOM class effect. |
| `actvt` (value = selector or empty) | Same as `actv` but *toggles* rather than unconditionally activating (won't re-activate an already-active element). |
| `stop` (bare) | Calls `event.stopPropagation()` for the triggering interaction — an escape hatch for nested `t`/`acl`/`actv` elements. |
| `confirm="message"` / `econfirm="js expr"` | Native `confirm()` gate before the element's action proceeds; `econfirm` evaluates a JS expression instead of a literal string. |

### 6.9 Navigation active-state matching: `n0`, `n1`, `n2`, …

```html
<a href="/guide" n0="guide">Guide</a>
```
The numeric suffix corresponds to the `nodes[n]` depth (§5.5) — the engine compares `nodes[N]` against the attribute's value to decide whether to mark that link/nav-item as the active one. This is LumenJS's entire "active nav link" story; there's no `<router-link active-class>` — you hand-annotate every link with which URL segment and value it corresponds to.

### 6.10 Misc single-purpose attributes

| Attribute | Behavior |
|---|---|
| `lazy` + `data-src="url"` | Lazy-loads a background/image source once in viewport (also `data-srcset`, `data-sizes` for responsive variants). |
| `tip="text"`, `tip-pos="top\|...`, `tip-class="..."` | Built-in tooltip. |
| `pinnable`, `pinnable-offset-up`, `pinnable-offset-down` | Sticky/pin-on-scroll behavior with configurable trigger offsets. |
| `crslf` + `crslf-opts='{...}'` | Turns a container into a carousel (Flickity-based). Options object (all optional, defaults noted): `draggable` (true), `freeScroll` (false), `wrapAround` (false), `groupCells` (1), `autoPlay` (false), `fullscreen` (false), `fade` (false), `adaptiveHeight` (false), `cellAlign` ("center"), `contain` (false), `rightToLeft` (true), `prevNextButtons` (true), `pageDots` (true). |
| `up` (bare, on a container) + `up-accept="mime/types"` | Marks a container as a file-uploader drop zone (auto-injects a hidden `<input type="file">`); pair with the `@drop`/`@files-added`/`@file-uploaded`/`@file-removed`/`@upload-progress` events (§6.3). |
| `:hover="css-declarations"` | Applies raw inline CSS text (`"color:red;font-weight:bold;"`) on hover/touch-move, removes it on leave — a directive-level substitute for a CSS `:hover` pseudoclass, used because scoped `<style>` inheritance across sub-views is otherwise all-or-nothing. |
| `:required` | See §6.6. |
| `:data` | See §4.1/§4.2 — passes a variable to a sub-view/component. |
| `:config` | Passes a config object, used by `<lmlst>` (§4.4). |
| `:props`, `:props-bind`, `:lookup-callback` | Present in the engine's attribute table; no worked examples survive in the docs archive. Likely component-prop-declaration and custom-datasource-callback hooks respectively — flagged here for completeness, use with caution/verify against engine behavior before relying on them. |

---

## 7. Global built-in objects and functions

None of these need an import — they are ambient globals, available in every view's `<script>` block.

| Name | What it is |
|---|---|
| `globals` | A plain object, **auto-persisted to `localStorage`** and reactive when `bind`-ed. Add/edit: `globals.data = {...}`. Delete: `delete globals.data`. This is LumenJS's entire global-store story — no actions/mutations/reducers, just direct property assignment. |
| `session` | Same API surface as `globals` (`session.key = value`, `delete session.key`), backed by `sessionStorage` instead of `localStorage` (cleared when the tab/browser closes). |
| `cookies` | Cookie helper object: `cookies.setItem(key, value, expiry, path, domain, secure)`, `cookies.getItem(key)`, `cookies.removeItem(key)`, `cookies.hasItem(key)`, `cookies.keys()`. |
| `nodes` | URL path split on `/`, see §5.5. |
| `View.params` | Query-string data (from `<a href="/x?name=Hana">` or `method="get"` forms) available in the *target* view. |
| `View.props` | Data pushed via `pushURL(url, data)` or a submitted `o-sub`/`b-sub`/default form, available in the target view. |
| `pushURL(path, data?)` | Programmatic SPA navigation (no full reload). Second argument populates `View.props` on arrival. This plus `<a href>` and `<form>` are the **entire routing API** — see §9. |
| `watch` | Global watcher object, §5.3. |
| `API.get/post/put/delete/patch(path, data, headers, api_index, opts)` | Built-in HTTP client, see §10. |
| `LIVE` | Global WebSocket client (`new _Live("wss://...")`) with an `_emit(event, payload, isBinary)` method returning a promise — used internally for realtime features (e.g. live production counters on lumenjs.com itself, and chunked file uploads) and available for app-level realtime channels. No public guide page for it survived in the archives; treat it as an advanced/internal-facing API. |
| `cl(...)` | Seen throughout real code as a `console.log` shorthand — appears to be a project/engine convenience, not `console.log` itself. |

---

## 8. Modals in depth

A modal renders a sub-view's body inside a popup, without a route change or losing the parent view's state.

```html
<button modal="modal_view"
        modal-class="my-modal"
        modal-title="Title Here"
        modal-description="Optional subtitle">
    Open
</button>
```
Any element (not just buttons) with a `modal` attribute opens that popup on click. Structure (targetable via Mobius classes, not directives): content `pop-c`, close-X `pop-x`, header `pop-h`, title `pop-t` (default text "New Modal"), description `pop-d`, body `pop-b`.

Close it from inside with a bare `close-modal` attribute on any descendant element, equivalent to clicking the X.

**Multiple/nested modals**: give each trigger its own `modal-class` to scope CSS (`.my-modal-a pop-c { ... }`); a modal's own body can contain further `modal=` triggers, opening a second modal stacked on the first.

**Events**: `@modal-open`, `@modal-close`, `@modal-beforeclose` on the *trigger* element. Handlers receive `(ev, el, modal)`. `@modal-beforeclose` can be used to gate closing (e.g. prompt-before-discard).

**Passing data parent → modal**: return an object from the `@modal-open` handler; inside the modal view, retrieve it via `view.scope`:
```js
// parent view
function myFunc(ev, el, modal) {
    return { key1: "hello", key2: 1234 };
}
```
```js
// modal view
var myData;
view.scope(function (view, props) {
    myData = props.modal.key2;
});
```
**Passing data modal → parent**: mutate `props.modal` from inside the modal's `view.scope` callback — new keys you add become visible to the parent's context.

This `view.scope(function(view, props){...})` pattern is the closest LumenJS gets to a component "props" object — it is **only** used for modals, not for ordinary sub-views (§4.1) or components (§4.2), which instead rely on implicit same-name variable binding via `:data`.

---

## 9. Routing

There is no router library, no route-config file, and no `<Route>`/`useNavigate()` — routing is three primitives, all covered above:

1. **`<a href="/path?query=val">`** — plain anchor; LumenJS intercepts the click, swaps the view without a full reload. Query-string data lands in the target view's `View.params`.
2. **`pushURL(path, data?)`** — programmatic equivalent; `data` lands in `View.props` (not `View.params`) on arrival.
3. **`<form>`** — see §6.6 for the full `o-sub`/`b-sub`/`norm` matrix; default (no special attribute) behavior still avoids a full reload and populates `View.props`/`View.params` on the target view.

File-system nesting: a URL like `/account/admin/dashboard` maps directly to `views/account/admin/dashboard.view` — there is no separate manifest mapping URLs to files (except where a view deliberately re-dispatches on `nodes[n]` itself, §5.5, for guide-style catch-all sections).

---

## 10. HTTP / data fetching

Configured once in `config.json`:
```json
{
    "node": { "host": "127.0.0.1", "port": "3000" },
    "apis": [
        {
            "baseURL": "YOUR_API_URL",
            "headers": {
                "X-BEA-Application-ID": "YOUR_APPLICATION_ID",
                "X-BEA-Authorization": "YOUR_REST_API_KEY"
            }
        }
    ]
}
```
Then, anywhere, the global `API` object:
```js
API.get("path", data, headers, api_index)
    .then((data) => { /* ... */ })
    .catch((err) => { /* ... */ });

API.post("path", data, headers, api_index).then(...).catch(...);
API.put("path/" + objectId, data, headers, api_index).then(...).catch(...);
API.delete("path/" + objectId, data, headers, api_index).then(...).catch(...);
```
- `path` — a full URL, or just a table/resource name if `config.json` already has a matching `baseURL` configured.
- `data` — request body / query object.
- `headers` — normally omitted (pulled from `config.json`); override per-call if needed.
- `api_index` — which entry in the `apis[]` array to use, if you configured more than one backend.

In real production code (Rahimoun), apps commonly wrap a second, app-specific HTTP client (there called `engine`, an instance of a BEA-provided `Engine` class configured with app/API keys) alongside or instead of the generic `API` global — `API` is the documented, generic primitive; `engine`/`Engine` is that particular backend's SDK layered on top, not a LumenJS core concept.

---

## 10b. The Roxyon BaaS query DSL

Everything in §10 covers *how* to make a request. This section covers the
**request body**, which is where nearly all real Console/Rahimoun page logic
lives.

> **Do not invent query syntax.** This DSL is not Parse, not Firebase, not
> MongoDB, and not SQL — it resembles all of them in places and differs in the
> details. Every operator, key, and idiom below is exhaustive for the common
> path; if something you want is not listed here, it probably does not exist,
> and inventing it produces a query that returns *plausible wrong data* rather
> than an error.

### 10b.1 Mental model

A **class** is a MySQL table; an **object** is a row. `objectId` is a Hashids
string, never the raw integer. There are **no foreign keys** — a pointer column
holds the target row's `objectId` as a plain string, and the relationship only
exists in the schema metadata.

```js
API.get("/Patients", { fields: "objectId,firstName,lastName", limit: 50 })
```

The response is always:

```js
{ results: [ {...}, {...} ] }        // plus "count" when count:1 is set
```

### 10b.2 Body keys

| Key | Purpose |
|---|---|
| `fields` | Comma-separated columns to select. Supports aggregates: `"Count(*) as c,Gender"` |
| `where` | Filter object — see §10b.3 |
| `limit` | Row cap. **`-1` does NOT mean unlimited — it means 1000.** Omitting it defaults to 10 |
| `offset` | Skip N rows (pagination) |
| `order` | `"createdAt"` ascending, `"-createdAt"` descending |
| `groupby` | Comma-separated columns; `"none"` collapses to a single aggregate row |
| `having` | Filter on aggregate results |
| `count` | `1` adds a `count` key to the response. Pair with `limit: 0` for a count with no rows |
| `include` | Resolve a pointer to its target row — see §10b.4 |
| `locale` | `"en,ar"` to pull localized columns |
| `media` | `"images"`, `"files"` — attach media sub-records |
| `crops` | `"ax300,ax600"` — which image crop sizes to return |
| `_then` | Chain a follow-up request — see §10b.6 |
| `on_duplicate` | On POST: what to do if the row already exists — see §10b.6 |

### 10b.3 `where` and its operators

A bare value means equality:

```js
where: { Status: "completed" }
```

An object means explicit operators:

```js
where: {
    Status:    { in: "new,inreview" },
    createdAt: { gte: "2026-07-01", lte: "2026-07-31" },
    Name:      { contains: "حسن" }
}
```

**The complete operator list.** Anything not here does not exist:

| Operator | Meaning |
|---|---|
| `eq` / `ne` | equals / not equals (aliases: `equals`, `notequals`, `neq`) |
| `gt` `gte` `lt` `lte` | numeric and date comparison |
| `in` / `nin` | in / not in a comma-separated list |
| `contains` / `notcontains` | substring match |
| `startswith` / `notstartswith` | prefix match |
| `endswith` / `notendswith` | suffix match |
| `regex` (alias `REGEXP`) | regular expression |
| `month` / `year` | match a date part; accepts the literal `"current"` |
| `exists` | pointer is / is not set |
| `arrayKeyIn` / `arrayKeyAll` | match inside a `pointerArray` / `array` column |

Relative dates have dedicated operators — prefer them over building a literal
range, because they cannot go stale:

```js
where: { createdAt: { month: "current" } }     // this month
where: { createdAt: { year:  "current" } }     // this year
```

#### OR groups

```js
where: {
    or: [
        { Status: "new" },
        { Severity: "urgent" }
    ]
}
```

#### Subqueries (`select`)

The equivalent of SQL's `WHERE x IN (SELECT ...)`. This is how you filter one
class by a condition on another:

```js
where: {
    Application: {
        select: {
            query: {
                className: "Applications",
                where: { Type: "hospital" }
            },
            field: "objectId"
        }
    }
}
```

#### The `published` idiom

**Every query silently appends `eye='1' AND published='1'` unless the `where`
mentions those keys.** Rows are soft-deleted by setting `published = 0`, so a
normal query never sees them. To include unpublished rows you must say so:

```js
where: { published: { REGEXP: "0|1" } }        // include both states
```

This looks strange and is easy to mistake for dead code. It is not — omitting
it is why a query "loses" rows that visibly exist in the database.

### 10b.4 `include` — resolving pointers

A pointer column holds an `objectId` string. `include` fetches the target row
and attaches it as `_<ClassName>`:

```js
API.get("/Patients", {
    fields: "objectId,firstName,Branch",
    limit: 50,
    include: {
        className: "Branches",
        field:     "Branch",         // the pointer column on Patients
        fields:    "Name"
    }
})
```

Each result row then carries:

```js
{ objectId: "...", firstName: "...", Branch: "9GQJl7MZKm",
  _Branch: { results: [ { objectId: "9GQJl7MZKm", Name: "فرع طرابلس" } ] } }
```

Note the shape: **`_<Field>.results[0]`**, an array, not a bare object. Real
code almost always flattens it immediately:

```js
for (var i = 0; i < r.results.length; i++) {
    var row = r.results[i];
    row.Branch = row._Branch.results[0];
}
```

`include` may be a single object or an **array** of objects, and may nest.

#### Reverse includes

To query from the class being pointed *at*, add `reverse: true`. This lists each
branch together with its patients:

```js
API.get("/Branches", {
    fields: "Name",
    limit: 50,
    include: {
        className: "Patients",
        field:     "Branch",        // the pointer column on Patients
        reverse:   true,
        fields:    "firstName,lastName",
        where:     { Gender: "female" }
    }
})
```

A class may have several pointers to the same target, and may point at itself
(`Domains.ParentDomain -> Domains`) — both work.

**Where the result lands.** Each include is returned on the parent row under
`_ClassName`, always as `{ results: [...] }`, never as a bare array — so it is
`row._Pricing.results[0]`, and an empty `results` is a row with no children
rather than a missing key:

```js
let pricing = pln._Pricing.results[0];      // reverse include
let service = pln._Service.results[0];      // forward include
```

**Reverse includes nest.** An include inside a reverse include resolves against
the child rows, which is how one request can reach a grandchild. This fetches
every application with its processes, its routes, and the name of each route's
domain — replacing four sequential round trips with one:

```js
rx.get("/Applications", {
    fields: "objectId,Name,Status,SourcePath,ConfigRevision,AppliedRevision",
    limit: -1,
    where: { Subscription: sub },
    include: [
        { className: "ApplicationProcesses", field: "Application",
          fields: "objectId,Type,Command,Status", reverse: 1 },
        { className: "ApplicationRoutes",    field: "Application",
          fields: "objectId,Domain,Path,Enabled", reverse: 1,
          include: { className: "Domains", field: "Domain",
                     fields: "objectId,Name" } }
    ]
})
// app._ApplicationRoutes.results[0]._Domain.results[0].Name
```

`field` is always the pointer column on the *child* class, in both directions.

#### The wire format, when calling the API by hand

`rx.get()` and `AsyncHttpClient::get()` serialise the query with
`http_build_query`, so nested parameters go out as PHP bracket notation, not as
JSON:

```
include[0][className]=ApplicationProcesses&include[0][field]=Application
&include[0][reverse]=1&include[1][include][className]=Domains
```

A hand-built request that JSON-encodes `include` or `where` into the query
string is silently misread: `include` comes back as `Invalid Field Name`, and a
JSON `where` is **dropped entirely** — the query then returns arbitrary rows
rather than failing, which is how a `where` on `objectId` once returned a
different record. Build query strings with `http_build_query` (PHP) or
`urlencode` over bracketed keys (anything else), or go through `rx`.

#### Adding columns: what `/Schemas` accepts

`PUT /Schemas/{Class}` adds `data`, `options`, `integer`, `boolean` and string
columns, and rejects anything beyond the minimum keys — `options` fields fail if
given `dbcol`/`default_value`/`editable`, so send only `name`, `type` and
`options`.

**Pointers use the nested shape** — the same one `POST /schemas/{Class}` takes
when the class is first created:

```php
"User" => [
    "name"     => "User",
    "type"     => "pointer",
    "pointer"  => [
        "field"     => "Email",              // column to display
        "className" => "users",              // the class KEY (lowercase, = dbtbl)
        "objectId"  => $class_users->objectId // objectId of the class pointed AT
    ],
    "required" => 1
]
```

Note this differs from how a pointer is *read back*: `GET /schemas` returns it
flattened, as `pointer: "users"` plus `pointerClassId` and `pointer_col`. Do not
send it back in the shape you read it.

**Adding a pointer to an existing class via `PUT` did not work.** Every attempt
returned `code 117, "Class Doesn't Exists"`, including the shape above with and
without `required`, and with the pointed class's own objectId. `createFields()`
in the BaaS clearly does understand pointers, so the capability exists and the
rejection is happening somewhere earlier — the cause was not identified. The
error names the class rather than the field, which sends you looking at the
wrong thing. Declare pointers when the class is created, or use the schema UI.

Two details from the BaaS source worth knowing when hand-writing a field spec:
the default value is read from `default`, **not** `default_value` (which is what
`GET /schemas` returns it as), and `options` fields reject the extra keys a read
returns — send only `name`, `type` and `options`.

### 10b.5 Aggregates and grouping

Aggregates go in `fields`, not a separate key:

```js
API.get("/Patients", {
    fields:  "Count(*) as c,Gender",
    groupby: "Gender",
    limit:   100
})
// -> [ { c: "3859", Gender: "male" }, { c: "5284", Gender: "female" } ]
```

Available functions: `Count`, `Sum`, `Avg`, `Min`, `Max`.

Three things that catch people out:

1. **Aggregate values come back as strings**, not numbers. `parseFloat()` before
   arithmetic; concatenating them by accident is a common bug.
2. **`groupby: "none"`** removes grouping entirely and returns one aggregate row.
   Without any `groupby`, the engine defaults to grouping by `_pos`, i.e. per
   row.
3. With `groupby` set, `count: 1` returns the **number of groups**, not the
   number of rows.

`objectId`, `createdAt` and `updatedAt` are injected into every select
automatically. In a grouped query they hold an arbitrary member of each group
and are meaningless — ignore them rather than displaying them.

### 10b.6 Chaining and upserts

#### `_then` — a follow-up request

Runs after the first query, with `row(FIELD)` interpolating values from the
first result set:

```js
API.get("/Subscriptions", {
    fields: "objectId,Plan",
    limit:  20,
    count:  1,
    _then: [
        {
            path: "/Domains",
            method: "get",
            body: {
                count: 1,
                limit: 0,
                where: { Subscription: "row(objectId)" }
            }
        }
    ]
})
```

`row(oType)` may also interpolate into the **path** (`"path": "/row(oType)"`)
for polymorphic pointers.

#### `on_duplicate` — insert-or-update

On POST, if the row already exists, run this instead. Combined with the atomic
increment string `"+=1"`, this is how the platform allocates sequential
reference numbers:

```js
API.post("/Stats", {
    Year: 2026, Month: 8, Type: "patient", Count: 1,
    on_duplicate: {
        method: "PUT",
        path:   "/Stats",
        body: {
            where: { Year: 2026, Month: 8, Type: "patient" },
            Count: "+=1"
        }
    },
    _then: {
        method: "GET",
        path:   "/Stats",
        body: { limit: 1, fields: "*",
                where: { Year: 2026, Month: 8, Type: "patient" } }
    }
})
```

### 10b.7 `/batch` — several queries in one round trip

```js
var reqs = {
    requests: [
        { path: "/Patients",     method: "GET", body: { count: 1, limit: 0 } },
        { path: "/Applications", method: "GET",
          body: { fields: "Count(*) as c,Status", groupby: "Status", limit: 100 } }
    ]
};

API.post("/batch", reqs).then(function (r) {
    var patientCount = r[0].count;
    var byStatus     = r[1].results;
});
```

The response is an **array** positionally matching `requests` — not an object.

### 10b.8 Field types and what comes back

| Schema type | JS value returned |
|---|---|
| `string`, `longText`, `email`, `key`, `color` | string |
| `integer`, `number` | string (parse before arithmetic) |
| `boolean` | `0` / `1` |
| `date`, `datetime`, `time`, `year` | ISO-ish string |
| `options` | string, one of the declared values |
| `pointer` | `objectId` string, plus `_<Field>.results[]` when included |
| `pointerArray`, `array` | comma-separated string of `objectId`s |
| `data` | **a JSON string — call `JSON.parse()` yourself** |

The `data` type is the one that bites: it looks like an object in the schema and
arrives as a string.

#### `Plans.Limits` and `Plans.Features` — the real shapes

`Limits` is the **internal, machine-readable** column (snake_case). The complete
real shape, with storage values in **MB**:

```json
{"max_processes":20,"memory_limit":512,"inodes":50000,
 "web_storage":40960,"mail_storage":61440}
```

There is **no CPU key and no bandwidth key**. Do not invent `memory`, `cpu_cores`,
`max_sites`, `max_databases` or `max_emails` — none exist. Read a limit with a
documented fallback, and ask before assuming a new key.

`Features` is the **user-facing** column: nested display strings, marketing copy,
never parse it for real limits.

```js
Features['Websites & Storage']['Disk Space']   // "40 GB NVMe"
Features['Email & Databases'].Databases        // 10
```

Both are `data` columns, so `JSON.parse()` them (`_dashboards/cloudhosting.view`
does this once and shares `Limits` with every tab).

Related real fields: `Datacenters` carry `Name`, `Region`, `Flag`, `Identifier`.
`globals.phpversions` is keyed by version string (`"8.3"`) with `objectId`,
`ReleaseDate` and `EOLDate` inside each record — so resolving a `PHPVersion`
pointer needs a reverse scan, not a lookup. `EOLDate` is `ReleaseDate + 2 years`,
i.e. **end of active support**; PHP gives a further year of security fixes, so do
not label a version "end of life" from that date alone.

```js
var plan = r.results[0];
plan.Limits   = JSON.parse(plan.Limits);
plan.Features = JSON.parse(plan.Features);
```

### 10b.9 Writing

```js
API.post("/Patients", { firstName: "...", Branch: branchObjectId });
API.put("/Patients/" + objectId, { Mobile: "..." });
API.delete("/Patients/" + objectId);
```

Deletion is normally **soft** — set `published: 0` rather than issuing a
`DELETE`, so the row stays recoverable and drops out of every normal query
automatically.

### 10b.9b Writes fail WITHOUT rejecting

The API resolves on a failed write instead of rejecting, so `.catch()` never runs
and a failure looks exactly like success to a `.then()` handler:

```js
// success
{"results":[{"objectId":"9GQJl7MZKm"}]}
// failure — still a RESOLVED promise
{"results":[{"code":1054,"error":"Unknown column 'X' in 'SET'","type":"DBQueryError"}]}
// top-level failures happen too
{"code":105,"error":"Invalid Field Name","type":"InvalidFieldName"}
```

Always run a write's response through `rxError(r)` (in `index.js`) before telling
the user it saved — it returns the message, or `''` on success:

```js
rx.put("/Domains", {...}).then(function (r) {
    var err = rxError(r);
    if (err) { /* surface it */ return; }
    /* only now is it actually saved */
});
```

One exception worth knowing: `db_create.view` relies on code **1062** (duplicate key)
being returned for its `on_duplicate` flow, so it checks for that case before
treating an error as fatal.

### 10b.9c A `select` subquery inside an `or` group crashes the API

`or` works, and `select` works, but a subquery nested inside an `or` returns an
empty response (a server error). Resolve the ids in a first query, then use `in`:

```js
// step 1: ids of the parents whose subdomains match
// step 2:
where: { Subscription: sub, Type: "primary",
         or: [ { Name: { contains: kw } }, { objectId: { in: ids.join(',') } } ] }
```

### 10b.9d `/Schemas` — reading and changing the schema

`rx.get("/Schemas")` returns every class with its fields, types, pointers and
options — the authoritative source for what exists. Use it instead of guessing at
field names.

**Create a class** — `POST /schemas/{ClassName}`:

```js
rx.post("/schemas/Ports", {
    className: "Ports",
    classType: "custom",
    fields: {
        Port:   { name: "Port",   type: "integer", required: 1 },
        Status: { name: "Status", type: "options", required: 1,
                  options: "available,reserved,allocated", default: "reserved" },
        Subscription: {
            name: "Subscription", type: "pointer", required: 0,
            // objectId is the TARGET CLASS's objectId, read from /Schemas
            pointer: { field: "Name", className: "subscriptions", objectId: "aPbxP39VeL" }
        }
    },
    indexes: {
        Port:   { name: "Port", field: "Port", unique: 1 },
        Status: { name: "Status", field: "Status" }
    },
    options: { images:0, videos:0, files:0, audios:0, variants:0, specs:0,
               categories:0, feature:0, MailOnAdd:0, MailOnEdit:0, locale:["en"] }
});
```

**Add a column** — `PUT /Schemas/{ClassName}` carrying only the new field(s):

```js
rx.put("/Schemas/Applications", {
    className: "Applications",
    fields: { Env: { name: "Env", type: "data", required: 0, unique: 0 } }
});
```

Field `type` values in use: `string`, `longText`, `integer`, `number`, `boolean`,
`email`, `date`, `datetime`, `time`, `year`, `options`, `color`, `key`, `data`,
`pointer`, `pointerArray`. A `pointer` needs `pointer: { className, field, objectId }`
where `objectId` identifies the target **class** and `field` is the column to display.

**Gotcha:** the `indexes` block reads back **empty** from `/Schemas` even when the
index exists and MySQL is enforcing it. Verify a unique index by attempting a
duplicate insert and checking for code **1062**, not by reading the schema.

### 10b.10 Debugging

`debug_query: 1` in the body returns the generated SQL alongside the results.
Use it when a query returns something unexpected; do not ship it.

---

## 11. A minimal complete example

```html
<!-- views/patients.view -->
<div bind="items,loading,total">
    <h2>Patients ({{ total }})</h2>

    <div :if="loading">Loading…</div>

    <div :else :for="items as item; i">
        {{ i + 1 }}. {{ item.firstName }} {{ item.lastName }}
        — {{ item._Branch.results[0].Name }}
    </div>
</div>

<script>
    // every bound variable is `var`, never let/const  (§5.1)
    var items   = [];
    var loading = true;
    var total   = 0;

    API.get("/Patients", {
        fields: "objectId,firstName,lastName,Branch",
        where:  { Gender: "female" },
        order:  "-createdAt",
        limit:  50,
        count:  1,
        include: {
            className: "Branches",
            field:     "Branch",
            fields:    "Name"
        }
    }).then(function (r) {
        items   = r.results;          // reassignment is fine and idiomatic
        total   = r.count;
        loading = false;
    }).catch(function (err) {
        loading = false;
        cl("patients load failed", err);
    });
</script>

<style>
    h2 { color: teal; }
</style>

<settings>
{ "hasNav": true, "hasHeader": true, "hasFooter": true, "requireAuth": false }
</settings>
```

---

## 12. Full syntax-contrast table (Vue / React → LumenJS)

| Looks like… | In Vue/React it means | In LumenJS it actually means |
|---|---|---|
| `:for="items as item"` | (not valid Vue syntax, but visually close to `v-for`) | Loop directive; **also** accepts a bare integer (`:for="5"`) to repeat N times with no backing array — no Vue/React equivalent |
| `:if` / `:else-if` / `:else` | N/A literally, but reads as `v-if` minus the `v-` | Same chaining semantics as Vue's `v-if`/`v-else-if`/`v-else` — this one **does** transfer cleanly |
| `{{ expr }}` | Vue interpolation (text-only in Vue) | Works in text **and directly inside quoted HTML attributes** — Vue requires `:attr="expr"` for the latter; LumenJS does not distinguish |
| `` `{{ expr }}` `` (backticks around the moustache) | Nothing — not valid Vue/React | LumenJS-specific "raw/safe" interpolation form for attribute values whose expression contains its own quotes (§5.2) |
| `@click="handler"` | Vue: calls `handler($event)`; DOM `event` only | Calls `handler(ev, el)` — **second argument `el` is always a jQuery object**, not the native node and not a Vue/React synthetic-event target |
| `@mouseover` | Native DOM event name | LumenJS spells it `@mouse-over` (hyphenated) — the un-hyphenated native form is not the documented directive name |
| `v-model` / controlled `<input value={} onChange={}>` | Two-way field binding | **Does not exist.** Nearest equivalent is whole-form `o-sub`/`b-sub` handlers receiving a `d` object of all field values at submit time (§6.6) |
| `bind="x"` | Looks like Vue's `v-bind` shorthand (`:x`) — **it is not that** | Declares `x` as a reactive variable for this subtree; unrelated to attribute binding. Required — without it the value renders once and never updates, silently |
| `let x = ...` / `const x = ...` for state | Standard modern JS, works fine | **Breaks reactivity silently.** Bound variables must be `var` (§5.1) |
| `:data="x"` | Looks like a Vue prop binding | Passes variable `x` into a sub-view/component by same-name convention, not a named-prop API |
| `view="path"` | N/A | Renders another `.view` file inline — closest Vue analogue is `<component :is="...">`, but resolved against the filesystem, not a component registry |
| `comp="name"` | N/A | Renders a file from `comps/` — a second, separate "component" concept from both views and templates |
| `tpl="name"` | N/A | Renders a file from `tpls/`, almost always alongside `:for` — a third, separate reusable-HTML concept |
| Component props object | `props` (Vue/React) | Only exists for **modals**, via `view.scope(function(view, props){...})` (§8) — ordinary sub-views/components use implicit same-name variable binding instead |
| `watch: {...}` (Vue option) / `watch()`/`useEffect()` | Per-component, additive, dependency-scoped | One **global** `watch` object; reassigning it wholesale **overwrites** previously-registered watchers (§5.3) |
| Router (`vue-router`/`react-router`) with a route table | Declarative route config | No route table at all — URL segments map 1:1 to nested view files on disk; deeper dispatch is hand-written against `nodes[n]` (§5.5, §9) |
| Global store (Pinia/Redux) | Actions/mutations/reducers, often with devtools | Direct mutation of a single `globals` object, auto-mirrored to `localStorage` — no action layer |
| `key` prop in lists | Required for diffing correctness | No `key` attribute exists on `:for` |
| CSS scoping (`<style scoped>`) | Compiler-enforced style isolation per component | No compiler, so no true scoping — styles in a parent view's `<style>` block are inherited by sub-views rendered inside it; the `:hover` *directive* (§6.10) exists specifically to work around the lack of scoped `:hover` pseudo-class control |

---

## 13. Corrections and additions from live verification (2026-08-29, "Talabat" BaaS project)

Everything below was checked against a real, freshly-created BaaS project
(not read from docs or reverse-engineered from an old app) while provisioning
a schema for a new client. Two things in §10b.9d turned out to be wrong or
incomplete; everything else here is new material the earlier sections didn't
cover. Source: `_Talabat/schema/README.md` and `_Talabat/schema/provision.js`
in this BEACDN tree have the full worked example.

### 13.1 `GET /Schemas`'s real response shape (corrects §10b.9d)

§10b.9d says `/Schemas` "returns every class with its fields, types,
pointers and options" without specifying the envelope. The real shape is
**one row per app**, not one row per class:

```js
{ "results": [
    { "objectId": "2OaQrLGxeq", "appName": "Talabat", "classes": { /* ... */ } }
] }
```

`classes` is an object keyed by the **lowercase `dbtbl` name**, not an array:

```js
classes.restaurants = {
  objectId: "e2L8WE7V07",       // <- use this as a pointer's target objectId
  className: "Restaurants",      // display name, original casing
  dbtbl: "restaurants",
  Options: { images: 1, videos: 0, /* ... */ locale: ["en"] },
  fields: {
    Name: { objectId, name, dbcol, type: "string", required: "1", /* ... */ },
    Restaurant: {                 // a pointer field, once one exists
      type: "pointer",
      pointer: "restaurants",     // target's dbtbl (lowercase)
      pointerClassId: "e2L8WE7V07", // target's objectId
      pointer_col: "Name",        // the target's display field
    },
  },
};
```

A brand-new project's `classes` is `{}` — there is no default/built-in entry
for anything, including `Users` (§13.2).

### 13.2 There is no pre-existing built-in `Users` class

On a fresh project, `/Users` doesn't exist (`GET /Users` → `code 103,
"Invalid Class Name"`), and `POST /Auth/register` fails with
`{"code":110,"error":"Invalid Class Request Method","type":"InvalidMethod"}`
until a `Users` class is created **exactly like any other custom class**
via `POST /schemas/Users`. Minimum viable shape that makes `/Auth/register`,
`/Auth/login`, and `/Auth/me` work: `firstName`, `lastName`, `Email` (type
`email`, required), `Password`, plus whatever else the app needs
(`Mobile`, `authType`, `emailVerified`, `image`, ...).

### 13.3 The full `/Auth` flow, confirmed end-to-end

This is the sequence that actually works, with real responses:

```js
// 1. App-level token exchange — Application ID + the mobile CLIENT KEY
//    (the console's "client key (for iOS/Android/Flutter)", a distinct
//    credential from the "js key (for JavaScript clients)" and the
//    "REST API key"), sent as X-BEA-JavaScript-Key regardless of the
//    "js"-sounding header name:
POST /Auth
  X-BEA-Application-ID: <app id>
  X-BEA-JavaScript-Key: <CLIENT key, not the js key, for a mobile client>
  body: {"scope":"public"}
→ {"access_token":"<jwt>","refresh_token":"<jwt>","token_type":"Bearer","expires_in":3700}

// 2. Register — needs the app access token from step 1, as x-bea-access-token:
POST /Auth/register
  x-bea-access-token: <access_token from step 1>
  body: {"Email":"...", "Password":"...", "firstName":"...", "lastName":"...", "authType":"normal"}
→ {"results":[{"objectId":"...", "createdAt":"...", "updatedAt":"..."}]}

// 3. Login — same auth as register, different response shape (flat, no `results`):
POST /Auth/login
  x-bea-access-token: <access_token>
  body: {"Email":"...", "Password":"..."}
→ {"session_token":"<jwt>","refresh_token":"<jwt>","token_type":"Bearer","expires_in":3700}
// wrong credentials:
→ {"Server":"...", "code":121, "error":"Invalid Email Or Password", "type":"InvalidUserData"}

// 4. Current user — use the SESSION token from login, not the access token:
POST /Auth/me
  x-bea-session-token: <session_token from step 3>
  body: {}
→ {"objectId":"...", "firstName":"...", "lastName":"...", "Email":"...",
    "Password":"...",   // <- comes back in PLAINTEXT; do not log/display this response as-is
    "Mobile":"", "authType":"normal", "emailVerified":0, "image":""}

// 5. Logout:
POST /Auth/logout
  x-bea-session-token: <session_token>
→ {"success": true}
```

**Critical gotcha, found by accident, not by reading anything**: calling
`/Auth/register`, `/Auth/login`, or `/Auth/me` with the **static REST API
key** (`X-BEA-Authorization` + `X-BEA-Application-ID`, the §10 `API`-global
auth style) instead of an access/session token does **not** error. It
returns HTTP 200 with a **fresh, unrelated app token** (the same shape as
step 1) and silently ignores the request body entirely — no error, no
rejection, and it is easy to mistake for a successful call since the shape
looks plausible. `/Auth/*` endpoints must be driven by the access/session
token flow above, never the REST API key.

### 13.4 §10b.9d's "adding a pointer to an existing class via PUT doesn't
work" is not a blanket rule

§10b.9d documents `PUT /Schemas/{Class}` failing with `code 117, "Class
Doesn't Exists"` when adding a pointer field to a class that already has
data. Retested this exact operation live, twice, on two different
already-existing classes with real rows in them:

```js
PUT /Schemas/Restaurants
  body: { "className": "Restaurants", "fields": {
    "Location": { "name":"Location", "type":"pointer", "required":0,
      "pointer": { "field":"Name", "className":"locations", "objectId":"<Locations objectId>" } }
  }}
→ {"results":{"fields":{"success":1,"message":"Fields updated successfully"}, "localization":false}}
```

Confirmed genuinely applied (not a false-success — see §10b.9b's warning
that success messages can lie) by reading it back via `GET /Schemas`: the
field appeared with the correct `pointerClassId`. Did this twice
(`Restaurants` and `Addresses`), both succeeded. Whatever caused the
documented failure, it is not a standing rule on this project as of
2026-08-29 — don't treat §10b.9d's warning as gospel without retesting
against the project you're actually working with; do treat a `PUT`
"success" as worth a read-back check regardless, per §10b.9b.

### 13.5 The built-in media/images subsystem — not documented anywhere in
this file until now

Turning on a class's `images` option (`PUT /Schemas/{Class}` with
`{"options": {"images": 1}}`) does **not** add a schema field — confirmed by
reading the schema back before and after (field list unchanged). It
activates a separate media subsystem: a dedicated sub-resource keyed by the
record's own `objectId`, not a field in the record's body. Confirmed by
reading real production code (`Rahimoun/src/views/account/admin/
userprofile.view`), not by guessing from the option's name:

```js
// Upload — note the body is an ARRAY, not an object:
POST /{ClassName}/{objectId}/images
  body: [ { "title": "...", "album": "untitled", "file": "<dataURL string>" } ]

// Read — media:"images" (+ optional crops:"ax300,ax600") on a single-object GET:
GET /{ClassName}/{objectId}?media=images
→ { "results": [ { ..., "images": { "untitled": [
      { "objectId": "...", "dir": "...", "imageax600": "...", /* one imageax<N> per requested crop */ }
    ] } } ] }
// build a URL as: entry.dir + entry.imageax600

// Delete:
DELETE /{ClassName}/{objectId}/images/{imageObjectId}
```

`album` groups images under a name (`"untitled"` is what production code
defaults to) — a class can have more than one album. This is a *different*
endpoint/shape than the list-query `media`/`crops` params in §10b.2 applied
per-row in a multi-row response; this one is scoped to a single object.

### 13.6 Real confirmed write-failure and `where`-serialization examples

Concrete, from-the-wire versions of what §10b.3 and §10b.9b describe in the
abstract:

```js
// Bad column name — resolves (HTTP 200), doesn't reject, per §10b.9b:
POST /Restaurants { "NoSuchColumn": "x" }
→ {"results":[{"code":1054,"error":"Unknown column 'NoSuchColumn' in 'INSERT INTO'","type":"DBQueryError"}]}
```

`where` bracket-notation vs. JSON-encoding (§10b.4's wire-format warning),
confirmed side by side against two real rows named "Probe Diner" and
"Second Spot":

```
GET /Restaurants?fields=objectId,Name&where=%7B%22Name%22%3A%22Probe+Diner%22%7D   (JSON-encoded)
→ returns BOTH rows — the where clause was silently ignored, not an error

GET /Restaurants?fields=objectId,Name&where[Name]=Probe%20Diner                     (bracket notation)
→ returns only "Probe Diner"
```

One implementation detail worth knowing for anyone building a Dart/Flutter
(or other Dio-based) client: **Dio's default `queryParameters` handling
already serializes a nested `Map` value as bracket notation** — passing
`{"where": {"Name": "Probe Diner"}}` as `queryParameters` produces
`where%5BName%5D=Probe+Diner` on the wire with no extra code, confirmed by
inspecting the actual outgoing request URI. Don't manually JSON-encode
`where`/`include` before handing them to Dio; the naive-looking default
already does the right thing.

### 13.7 Numeric field encoding: contradicts §10b.8 for this project

§10b.8 states `integer`/`number` columns always come back as strings. Not
what was observed here, confirmed twice now: `Latitude`/`Longitude` via an
`include`-resolved pointer, and `Rating`/`IsOpen` read directly (no
`include`) on a real, freshly-seeded `Restaurants` row — both cases returned
native JSON numbers (`4.5`, not `"4.5"`), not strings. Whichever project
§10b.8 was originally written against, this project's BaaS version doesn't
match it for numeric encoding. **Practical guidance regardless**: parse
defensively either way — call `.toString()` on the value before
`num.parse`/`parseFloat`, which is correct whether the wire value is a JSON
number or a numeric string, and cheap insurance either way.

### 13.8 `fields` is not optional in practice; a wrong-token-type 500 on
`/Auth/logout`

Omitting `fields` from a `GET` does **not** return every column the way a
bare SQL `SELECT *` would — it returns only `objectId` plus
`createdAt`/`updatedAt`, and every custom column is silently absent, not an
error. Confirmed live against real, non-empty rows (seeded `Restaurants`
data, queried back with no `fields` param — every custom field came back
`undefined`). Every query needs its column list spelled out explicitly;
there's no safe default to lean on, and the failure mode is silent missing
data, not an exception.

Separately: `POST /Auth/logout` returns a genuine HTTP 500 when called with
an app-level access token (`x-bea-access-token`) instead of a real user
session token (`x-bea-session-token`) — this is NOT the same as an
expired/garbage session token, which the endpoint handles gracefully
(`HTTP 200, {"error":"Invalid token: Incomplete segments"}`). Reproduced via
a real client app hitting this exact failure mode; the client-side root
cause of sending the wrong token type in that instance wasn't nailed down
with certainty (token-store persistence across repeated debug rebuilds on
an iOS Simulator is one plausible culprit, not confirmed). Regardless of
cause: treat any call that's only meaningful for a logged-in user
(`/Auth/logout`, `/Auth/me`) as something to skip entirely client-side when
no real session is stored, rather than trusting a generic access-token
fallback to either work or fail cleanly.

---

## 14. Mobius CSS — the utility scale (verified against `src/css/bea.css`, 2026-08-30)

The spec deliberately doesn't try to be a full Mobius reference (§1), but the
**spacing/size scale is not linear** and inventing an off-scale class is the most
common way to break a Roxyon Console view. An off-scale class fails **silently** —
no error, the rule just isn't there, and the element sits with 0 of whatever you
asked for. `src/css/bea.css` is the ground truth; `src/css/styles.css` holds the
Console's theme classes (`bdgc`, `_cgr`, `_cr`, `_cdg`, `_cgreen`, `iconify`,
`secondary-nav*`, …) and any project-specific additions **go at the bottom of
`styles.css`**.

### 14.1 The spacing scale — `p m` and every side/axis variant

Prefixes: `p pv ph pt pb pl pr` · `m mt mb ml mr` (there is **no `mv`**; `mh` only
exists as `mh100 mh350` — use `mya`/`mxa`/`ma` for auto margins).

Allowed integers (px), **all families identical**:

```
0 1 2 3 4 5 6 8 10 15 20 25 30 40 50 60 70 80 90 100 110 120 130 140 150 160 180 200
```

Gaps between steps: 1 below 6, **no 7**, then 8, **no 9**, 10, then **+5 up to 30**,
then **+10 up to 200**. So `p7 p11 p12 p13 p14 p16 p18 p22 …` **do not exist** —
round to the nearest listed value (`p14`→`p15`, `p18`→`p20`, `mt12`→`mt10`).

### 14.2 Gap — `g`

```
5 8 10 15 20 25 30 35 40 45 50 55 60 65 70 75 80 85 90 95 100
```

Note `g8` exists (added 2026-08-29) but **`g6` and `g12` do not** — use `g5`/`g10`.
`<flx>` / `.df` is the flex container; `g<n>` sets its `gap`.

### 14.3 Font-size / line-height — `fs` / `lh`

Every integer `0`–`30`, then `32 34 36 38 40 42 44 46 48 50 55 60 65 70 75 80 85
90 95 100 110 120 130 140 150 160`. `fs14`/`fs16` are fine; `fs31 fs33 …` are not.

### 14.4 Other scales

- `z` (z-index): `1 10 20…200 300…1000 2000…10000`
- `op` (opacity ×%): `0 5 10 20 30 40 50 60 70 80 90 100`
- `mw` (max-width ×%): `50 60 70 80 100`
- radius: `round` (.25rem) `round2x` (.5) `round3x` (.75) `round4x` (1rem) `round0`
  `round100` `roundl` `roundr`
- weight: `b`/`b700` (bold) `b400 b500 b600 b900` `n`

### 14.5 Layout utilities that trip people up

| class | actual rule | note |
|---|---|---|
| `.l` | `text-align: right` | **RTL-first framework — `l` is RIGHT, `r` is LEFT.** `.c` is centre. |
| `.r` | `text-align: left` | |
| `.h` | hide | part of a giant combined selector in bea.css; toggled at runtime via `addClass('h')`. Note the responsive variants `h-m_sb` etc. |
| `.fh` | `display:none !important` | plain force-hide; use this for a hidden programmatic `modal=` trigger (`.h` sometimes keeps the element out of a `modal` binding — `.fh` is what existing code like `_forms/domains_create.view`'s `._checkModal` uses). |
| `.ns` | `user-select:none` | |
| `.oe` | `white-space:nowrap` | (not ellipsis) |
| `.cc` | `position:absolute;top/left:50%` | centre-absolute; needs a `translate` or it's off by half its own size |
| `.df .fc .fr .fw .f1` | flex shorthands | `<flx>` element == `.df` |
| `.ac .as .ae` / `.jc .js .je .jsb .jsa` | align-items / justify-content | **inert on a plain `<div>`** — they only do anything once the element is `display:flex`. Use `<flx class="je g15 ac">`, not `<div class="je g15 ac">`. Same for `g<n>` (it's `gap`). |
| `.bdgc` | card background+border (theme) | Console-specific, in `styles.css` |

### 14.6 Adding a class

If a value genuinely isn't on the scale and rounding hurts the design, append to
the **bottom of `src/css/styles.css`** (never `bea.css` — that's the vendored
framework). Prefer a scoped `<style>` block in the view with an explicit
`gap:`/`padding:` when the exact px matters for one component only — see the
comment in `_dashboards/dashboard.view` (`.dsh-act`) for the house pattern:
*"A rule that is wrong fails visibly; a class that is not there fails quietly."*

---

## 15. Roxyon Console — house conventions (forms, inputs, modals, colour)

Design reference for the whole Console is **Hetzner Cloud Console, dark mode** — clone
its layout, density and interaction patterns. The rules below are things the user has
asked for more than once; treat them as required, not stylistic.

### 15.1 Forms

- `<form data-theme="dark" o-sub="handler">` — **always** `data-theme="dark"` on the
  `<form>`, and on any non-form container that holds inputs (a card, a list row with
  an inline editor). Without it the fields theme light and read as a bug.
- Field-level validation is only `:required` (§6.6) + your own `b-sub`. There is no
  per-field validator directive and no `v-model`.
- Close a modal form from JS with `$('[close-modal]:last').click()`.

### 15.2 Inputs

```html
<label class="f1 field__input-wrap">
    <input type="text" name="Foo" class="ba0 bgt dark" placeholder="example.com" />
</label>
```

- `.dark` sets **white text only** — the wrapper paints the background. `.dark` + `.input`
  together = white text on white = invisible field. Never pair them.
- Inside the older `.rx-input_wrap` labelled-field pattern the wrapper forces
  `background: transparent`, so there the correct combo is `hc-field__input input dark`
  — and *only* there.

### 15.3 Selects — always `sl`

`<select sl sl-prt="self" :required name="Foo">…</select>`. See §6.7 for the wrapper
details. The two things that bite:

1. A select injected from JS after an async load is a **raw browser control** until
   the next `globalWatch()` (§5.6). Prefer `globalWatch()`; the manual fallback is
   `$(sel).select2({ dropdownParent: $(sel).parent(), … })` guarded by
   `:not(.select2-hidden-accessible)`.
2. The clear-× is **opt-in** — `<select sl clear>` shows the dark-red (`#900`) clear
   button, `<select sl>` doesn't. Add `clear` only when unsetting the field is a real
   choice (rare in this app — most selects always hold a valid value).

### 15.4 Checkbox — the house pattern (not `input-check`)

```html
<div class="round4x checkbox red p8">
    <span class="__nses"><input class="h" type="checkbox" name="Foo"></span>
    <span class="iconify" data-icon="mdi:checkbox-blank-outline"></span>
    <span class="iconify" data-icon="mdi:checkbox-marked"></span>
</div>
```

### 15.5 Modals — the edit-in-place pattern

Beyond §8's basics, the Console pattern for "edit a row from a list without a route
change and without re-rendering the whole list":

1. One **hidden** trigger in the parent view:
   `<div class="fh _fooModal" modal="…/modals/foo" modal-class="gen-modal" @modal-open="_fooArgs"></div>`
   (`.fh`, never `.h` — see §14.5).
2. Parent sets a module-scoped var, then clicks the trigger:
   `_fooPending = { id, record }; $('._fooModal').click();`
   `function _fooArgs() { return _fooPending; }`
3. Modal reads it: `view.scope(function (view, props) { var p = props.modal; … });`
4. **Modal → parent callback:** the parent attaches a function to `window`
   (`window._fooApply = function (row, mode) { … }`); the modal calls it on a
   successful save. (View `<script>`s share globals — this is the same mechanism as
   `myList.refresh()` being visible inside `modals/add_site.view`.)
5. The save API returns the **stored row**, so the parent patches exactly one node
   (`document.querySelector('.row[data-id="'+id+'"]').outerHTML = rowHtml(row)`), or
   inserts one, or removes one. **Re-rendering the whole list on every save/cancel is
   the glitch to avoid** — a modal Cancel should touch nothing, a Save should touch
   one row. After an `outerHTML`/`innerHTML` swap that contains icons, call
   `Iconify.scan()`; `@click` bindings survive the swap on their own (§5.6).

`modal="path"` with a bare `close-modal` and `@modal-open`/`@modal-close`/
`@modal-beforeclose` handlers is all still §8 — this is just how they're wired for
list editing.

### 15.6 `rx.*` — no `rx.del`

The Console wraps only `rx.get`, `rx.post`, `rx.put` (`engine.*` is the same object).
**There is no `rx.del` / `rx.delete`.** For a delete, POST to a `/delete` subpath the
handler understands (the `_payment` block does this: `/_payment/card/delete`,
`/_payment/card/default`, …) — or drop to the raw framework client `API.delete(path)`.

### 15.7 Escape anything you build as an HTML string

Any value interpolated into a `.html(...)` / `insertAdjacentHTML(...)` string must go
through an escaper first (`&  <  >  "`). A DKIM key, a php.ini description containing
`<?`, a domain with odd characters — all have torn a section apart in the past.
Never use `[ctc]`/attribute selectors that match every row for copy affordances — use
`.rx-copy` + `data-copy="…"` + `@click="rxCopy"` (global, in `styles.css` / `index.js`).

### 15.8 Colour

Text-colour helpers (in `styles.css`): `_cr` (red / danger), `_cgreen`, `_camber`,
`_corange`, `_cgr` (muted grey), `_cdg` (darker grey), `_cpurple`, `_cpink`, `_cb`,
`_cw` (white), `_cmain`, `_cp`, `_cg`, `_cgl`, `_cicon`.

Theme CSS variables worth knowing (don't hard-code hex when one of these fits):
`--color-border--dark`, `--color-card-background`, `--color-input--background`,
`--color-box-code-background`, `--color-text`, `--color-text-secondary`,
`--color-status-indicator--{green,amber,orange,red,grey}`,
`--color-status-badge-{green,orange,red}--{background,color}`.

For a set of category badges (DNS record types, service states…) that each need their
own accent, set a single custom prop per class and derive fill/border from it, with an
rgba fallback before the `color-mix()`:

```css
.badge      { color: var(--tc, #9aa0a6);
              background: rgba(138,138,138,.13); border: 1px solid rgba(138,138,138,.38);
              background: color-mix(in srgb, var(--tc) 14%, transparent);
              border-color: color-mix(in srgb, var(--tc) 40%, transparent); }
.badge-a    { --tc: #3b82f6; }   /* set --tc on the ROW too, so a hover accent can read it */
```

### 15.9 "Editable?" — records the platform owns

When surfacing platform-managed data for editing (DNS is the worked example), lock the
records the system re-derives and would silently break: **SOA** and **`*._domainkey.*`
DKIM** (rspamd publishes the key). Leave the ones customers legitimately customise
(SPF `@` TXT, DMARC `_dmarc` TXT, apex `NS` — with a warning). Enforce on the server;
the `managed:true` flag from the API just drives the UI.
