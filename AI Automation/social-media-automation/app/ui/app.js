// Social Media Automation page. Plain JS, no build step.

const $ = (s) => document.querySelector(s)
const $$ = (s) => [...document.querySelectorAll(s)]
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])

let state = { connected: {}, channels: [], projects: [], library: [], posts: [], claude: false }
let current = null
try {
  current = localStorage.getItem("sma.current")
} catch {}

const call = async (url, data) => {
  const res = await fetch(url, data === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Something went wrong (${res.status})`)
  return json
}

const say = (el, text, kind = "") => {
  el.textContent = text
  el.className = `msg ${kind}`
}

const busy = async (btn, fn) => {
  btn.disabled = true
  try {
    await fn()
  } finally {
    btn.disabled = false
  }
}

// ───────────── tabs (in the URL hash, so Back works) ─────────────

const showTab = () => {
  const id = (location.hash || "#connect").slice(1)
  $$(".tab").forEach((t) => t.classList.toggle("on", t.id === id))
  $$("#tabs a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#${id}`))
}
window.addEventListener("hashchange", showTab)

// ───────────── jobs ─────────────

const follow = (id, box) =>
  new Promise((resolve, reject) => {
    box.classList.remove("hidden")
    const tick = async () => {
      let j
      try {
        j = await call(`/api/job/${id}`)
      } catch (e) {
        box.innerHTML = `<div class="err">${esc(e.message)}</div>`
        return reject(e)
      }
      const bar = j.progress != null ? `<div class="bar"><span style="width:${Math.round(j.progress * 100)}%"></span></div>` : ""
      const waiting = j.status === "waiting" ? "Waiting for the job before this one to finish...\n" : ""
      box.innerHTML = esc(waiting + j.steps.join("\n")) + bar
      if (j.status === "done") {
        box.innerHTML += `<div class="ok">Done.</div>`
        return resolve(j.result)
      }
      if (j.status === "failed") {
        box.innerHTML += `<div class="err">${esc(j.error)}</div>`
        return reject(new Error(j.error))
      }
      box.scrollTop = box.scrollHeight
      setTimeout(tick, 1000)
    }
    tick()
  })

// ───────────── state ─────────────

const project = () => state.projects.find((p) => p.slug === current)

const load = async () => {
  state = await call("/api/state")
  if (!project() && state.projects[0]) current = state.projects[0].slug
  render()
}

const render = () => {
  renderConnect()
  renderPicker()
  renderEditor()
  renderMake()
  renderPost()
}

const renderPicker = () => {
  const sel = $("#current")
  sel.innerHTML = state.projects.length
    ? state.projects.map((p) => `<option value="${esc(p.slug)}" ${p.slug === current ? "selected" : ""}>${esc(p.name)}</option>`).join("")
    : `<option>No project yet</option>`
  sel.disabled = !state.projects.length
}
$("#current").addEventListener("change", (e) => {
  current = e.target.value
  try {
    localStorage.setItem("sma.current", current)
  } catch {}
  render()
})

// ───────────── Connect ─────────────

const renderConnect = () => {
  const c = state.connected
  $("#connect-status").innerHTML = [
    c.buffer
      ? `<span class="pill good">Buffer connected · ${state.channels.length} account${state.channels.length === 1 ? "" : "s"}</span>`
      : `<span class="pill bad">Buffer not connected</span>`,
    c.cloudflare && c.pagesHost ? `<span class="pill good">Cloudflare connected · ${esc(c.pagesHost)}</span>` : `<span class="pill bad">Cloudflare not connected</span>`,
  ].join("")
  if (state.channelError) $("#connect-status").innerHTML += `<span class="pill bad">${esc(state.channelError)}</span>`
  $("#cf-account").value ||= c.accountId || ""
  $("#cf-project").value ||= c.pagesProject || ""
  $("#channels").classList.toggle("hidden", !state.channels.length)
  $("#channel-list").innerHTML = state.channels
    .map((ch) => `<li><span class="svc">${esc(ch.service)}</span> ${esc(ch.displayName || ch.name)}${ch.isQueuePaused ? " <span class='hint'>(queue paused in Buffer)</span>" : ""}</li>`)
    .join("")
}

$("#connect-save").addEventListener("click", (e) =>
  busy(e.target, async () => {
    const msg = $("#connect-msg")
    say(msg, "Checking the keys...")
    try {
      const r = await call("/api/connect", {
        bufferKey: $("#buffer-key").value,
        accountId: $("#cf-account").value,
        cfToken: $("#cf-token").value,
        pagesProject: $("#cf-project").value,
      })
      const parts = []
      if (r.channels) parts.push(`Buffer works: ${r.channels.length} account${r.channels.length === 1 ? "" : "s"} found.`)
      if (r.pagesHost) parts.push(`Cloudflare works: files will live at https://${r.pagesHost}`)
      say(msg, parts.join("\n") + "\nSaved.", "good")
      $("#buffer-key").value = ""
      $("#cf-token").value = ""
      await load()
    } catch (err) {
      say(msg, err.message, "bad")
    }
  }),
)

$("#channels-refresh").addEventListener("click", (e) =>
  busy(e.target, async () => {
    try {
      await call("/api/channels", {})
      await load()
    } catch (err) {
      say($("#connect-msg"), err.message, "bad")
    }
  }),
)

// ───────────── Project ─────────────

$("#read-go").addEventListener("click", (e) =>
  busy(e.target, async () => {
    const box = $("#read-job")
    box.textContent = ""
    try {
      const { job } = await call("/api/read", { website: $("#read-website").value, github: $("#read-github").value })
      const brief = await follow(job, box)
      current = brief.slug
      try {
        localStorage.setItem("sma.current", current)
      } catch {}
      await load()
    } catch {}
  }),
)

const renderEditor = () => {
  const p = project()
  $("#editor").classList.toggle("hidden", !p)
  if (!p) return
  for (const k of ["name", "oneLine", "forWho", "hook", "handle", "website", "accent"]) $(`#f-${k}`).value = p[k] || ""
  $$(".f-feature").forEach((el, i) => (el.value = p.features[i] || ""))
  $("#f-pages").innerHTML = p.pages
    .map(
      (pg, i) => `<div class="page">
        <img src="/files/projects/${esc(p.slug)}/${esc(pg.shot)}" alt="">
        <div class="row"><input type="checkbox" data-use="${i}" ${pg.use !== false ? "checked" : ""} aria-label="Use this page">
        <input type="text" data-title="${i}" value="${esc(pg.title)}" maxlength="40"></div></div>`,
    )
    .join("")
  $("#f-polish").classList.toggle("hidden", !state.claude)
  const missing = []
  if (!p.oneLine) missing.push("what it does (question 2)")
  if (p.features.filter(Boolean).length < 2) missing.push("at least two things it can do (question 5)")
  if (!p.forWho) missing.push("who it is for (question 3)")
  $("#f-warn").classList.toggle("hidden", !missing.length)
  $("#f-warn").textContent = missing.length ? `Still to answer: ${missing.join(", ")}.` : ""
}

const draft = () => ({
  slug: current,
  name: $("#f-name").value,
  oneLine: $("#f-oneLine").value,
  forWho: $("#f-forWho").value,
  hook: $("#f-hook").value,
  handle: $("#f-handle").value,
  website: $("#f-website").value,
  accent: $("#f-accent").value,
  features: $$(".f-feature").map((el) => el.value),
  pages: project().pages.map((pg, i) => ({ title: $(`[data-title="${i}"]`).value, use: $(`[data-use="${i}"]`).checked })),
})

$("#f-save").addEventListener("click", (e) =>
  busy(e.target, async () => {
    try {
      await call("/api/project", { brief: draft() })
      await load()
      say($("#f-msg"), "Saved. Go to Make.", "good")
    } catch (err) {
      say($("#f-msg"), err.message, "bad")
    }
  }),
)

$("#f-polish").addEventListener("click", (e) =>
  busy(e.target, async () => {
    say($("#f-msg"), "Asking Claude. This can take a minute...")
    try {
      const d = draft()
      const r = await call("/api/polish", { slug: current, draft: d })
      $("#f-hook").value = r.hook
      $("#f-oneLine").value = r.oneLine
      $("#f-forWho").value = r.forWho
      $$(".f-feature").forEach((el, i) => (el.value = r.features[i] || ""))
      say($("#f-msg"), "New words are in the boxes. Read them, change anything that is not true, then Save.", "good")
    } catch (err) {
      say($("#f-msg"), err.message, "bad")
    }
  }),
)

$("#f-forget").addEventListener("click", (e) =>
  busy(e.target, async () => {
    const p = project()
    if (!p || !window.confirm(`Forget ${p.name}? The pictures of its pages are removed. Files you already made stay.`)) return
    await call("/api/forget", { slug: p.slug })
    current = null
    await load()
  }),
)

// ───────────── Make ─────────────

// rough length of the long video, same rules as video/Tour.tsx
const longSeconds = (p, shape) => {
  const viewPx = shape === "wide" ? 753 : 2003
  const pages = p.pages.filter((x) => x.use !== false && !x.section)
  let s = 4.5 + 5 + (p.recording ? p.recording.seconds + 1 : 0)
  for (const pg of pages) s += Math.min(24, 1.4 + Math.max(0, pg.fullHeight - viewPx) / 320 + 1)
  const n = p.features.filter(Boolean).length
  if (n) s += 2 + n * 1.6
  return Math.round(s)
}

const channelBoxes = (el, isVideo = true) => {
  const kept = new Set($$(`#${el.id} input:checked`).map((x) => x.value))
  el.innerHTML = state.channels.length
    ? state.channels
        .map((c) => {
          const no = c.service === "youtube" && !isVideo ? "YouTube only takes video" : ""
          return `<label class="inline"><input type="checkbox" value="${esc(c.id)}" ${no ? "disabled" : ""} ${kept.has(c.id) ? "checked" : ""}> <span class="svc">${esc(c.service)}</span> ${esc(c.displayName || c.name)} ${no ? `<span class="hint">(${no})</span>` : ""}</label>`
        })
        .join("")
    : `<p class="warn">Connect Buffer first (Connect tab).</p>`
}

const renderMake = () => {
  const p = project()
  $("#make-none").classList.toggle("hidden", !!p)
  $("#make-cards").classList.toggle("hidden", !p)
  $("#auto").classList.toggle("hidden", !p)
  if (!p) return
  channelBoxes($("#a-channels"))
  if (!$("#a-date").value) $("#a-date").value = tomorrowAt10().slice(0, 10)
  $("#m-feature").innerHTML = p.features
    .filter(Boolean)
    .map((f, i) => `<option value="${i}">${esc(f)}</option>`)
    .join("")
  $("#m-long-length").textContent = `About ${longSeconds(p, $("#m-long-shape").value)} seconds.`
  $("#m-recording-now").innerHTML = p.recording
    ? `Added: ${p.recording.seconds} seconds. <a href="#" id="m-recording-remove">Remove</a>`
    : ""
  $("#m-recording-remove")?.addEventListener("click", async (e) => {
    e.preventDefault()
    await call("/api/remove-recording", { slug: p.slug })
    await load()
  })
}
$("#m-post").addEventListener("change", () => $("#m-feature-wrap").classList.toggle("hidden", $("#m-post").value !== "feature"))
$("#m-long-shape").addEventListener("change", renderMake)

$("#m-recording").addEventListener("change", async (e) => {
  const file = e.target.files[0]
  if (!file) return
  const note = $("#m-recording-now")
  note.textContent = `Adding ${file.name}...`
  try {
    const res = await fetch(`/api/upload?slug=${encodeURIComponent(current)}&name=${encodeURIComponent(file.name)}`, { method: "POST", body: file })
    const j = await res.json()
    if (!res.ok) throw new Error(j.error)
    await load()
  } catch (err) {
    note.textContent = err.message
  }
  e.target.value = ""
})

const showResult = (info) => {
  const src = `/files/output/${encodeURIComponent(info.slug)}/${encodeURIComponent(info.file)}?v=${Date.now()}`
  const media = info.file.endsWith(".mp4") ? `<video src="${src}" controls playsinline></video>` : `<img src="${src}" alt="">`
  $("#make-result").classList.remove("hidden")
  $("#make-result").innerHTML = `<h2>Ready</h2>${media}
    <p class="hint">${info.seconds ? `${info.seconds} seconds · ` : ""}${(info.size / 1048576).toFixed(1)} MB · saved in output/${esc(info.slug)}/${esc(info.file)}</p>
    <h3>Words to post with it</h3><pre>${esc(info.caption)}</pre>
    <div class="row"><a href="#post"><button class="primary">Schedule it</button></a></div>`
}

$$("[data-make]").forEach((btn) =>
  btn.addEventListener("click", () =>
    busy(btn, async () => {
      const kind = btn.dataset.make
      const shape = { picture: $("#m-pic-shape"), short: $("#m-short-shape"), long: $("#m-long-shape") }[kind].value
      $("#make-result").classList.add("hidden")
      const box = $("#make-job")
      box.textContent = ""
      try {
        const { job } = await call("/api/make", { slug: current, kind, shape, post: $("#m-post").value, featureIndex: Number($("#m-feature").value || 0) })
        const info = await follow(job, box)
        showResult(info)
        await load()
      } catch {}
    }),
  ),
)

$("#a-go").addEventListener("click", (e) =>
  busy(e.target, async () => {
    const box = $("#a-job")
    box.textContent = ""
    try {
      const { job } = await call("/api/autopilot", {
        slug: current,
        channelIds: $$("#a-channels input:checked").map((x) => x.value),
        startDate: $("#a-date").value,
        time: $("#a-time").value,
        offset: new Date(`${$("#a-date").value}T${$("#a-time").value}`).getTimezoneOffset(),
      })
      const r = await follow(job, box)
      box.innerHTML += r.results
        .map((x) => (x.ok ? `<div class="ok">✓ ${esc(fmt(x.dueAt))} · ${esc(x.service)} · ${esc(x.file.split("/").pop())}</div>` : `<div class="err">${x.skipped ? "–" : "✗"} ${esc(x.service)} · ${esc(x.file.split("/").pop())}: ${esc(x.error)}</div>`))
        .join("")
      await load()
    } catch {}
  }),
)

// ───────────── Post ─────────────

const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "next free slot")

const renderPost = () => {
  $("#library").innerHTML =
    state.library
      .map((it, i) => {
        const src = `/files/output/${encodeURIComponent(it.slug)}/${encodeURIComponent(it.file)}`
        const media = it.file.endsWith(".mp4") ? `<video src="${src}#t=1" muted preload="metadata"></video>` : `<img src="${src}" alt="" loading="lazy">`
        const label = { picture: "Picture", short: "Short video", long: "Long video" }[it.kind]
        const scheduled = state.posts.filter((p) => p.file === `${it.slug}/${it.file}`).length
        return `<button class="item" data-item="${i}">${media}<div><b>${label} · ${esc(it.shape)}</b>${esc(it.slug)}${it.seconds ? ` · ${it.seconds}s` : ""}${scheduled ? ` · scheduled ${scheduled}x` : ""}</div></button>`
      })
      .join("") || `<p class="hint">Nothing made yet. Go to Make.</p>`
  $$("[data-item]").forEach((b) => b.addEventListener("click", () => openDrawer(state.library[Number(b.dataset.item)])))

  $("#posts tbody").innerHTML =
    [...state.posts]
      .sort((a, b) => (b.dueAt || "").localeCompare(a.dueAt || ""))
      .map((p) => `<tr><td>${esc(fmt(p.dueAt))}</td><td><span class="svc">${esc(p.service)}</span> ${esc(p.channel)}</td><td><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.file.split("/").pop())}</a></td><td>${esc(p.status)}${p.error ? `<div class="msg bad">${esc(p.error)}</div>` : ""}</td></tr>`)
      .join("") || `<tr><td colspan="4" class="hint">Nothing scheduled yet.</td></tr>`
}

$("#posts-refresh").addEventListener("click", (e) =>
  busy(e.target, async () => {
    try {
      await call("/api/refresh", {})
      await load()
    } catch (err) {
      alert(err.message)
    }
  }),
)

let open = null
const tomorrowAt10 = () => {
  const d = new Date(Date.now() + 86400000)
  d.setHours(10, 0, 0, 0)
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`
}

const openDrawer = (it) => {
  open = it
  const src = `/files/output/${encodeURIComponent(it.slug)}/${encodeURIComponent(it.file)}`
  $("#d-title").textContent = `Schedule ${it.file}`
  $("#d-preview").innerHTML = it.file.endsWith(".mp4") ? `<video src="${src}" controls playsinline></video>` : `<img src="${src}" alt="">`
  $("#d-caption").value = it.caption
  $("#d-time").value = tomorrowAt10()
  $("#d-job").classList.add("hidden")
  $("#d-channels").innerHTML = ""
  channelBoxes($("#d-channels"), it.file.endsWith(".mp4"))
  $("#drawer").classList.remove("hidden")
  $("#drawer").setAttribute("aria-hidden", "false")
}
const closeDrawer = () => {
  $("#drawer").classList.add("hidden")
  $("#drawer").setAttribute("aria-hidden", "true")
  $("#d-preview").innerHTML = ""
}
$("#d-close").addEventListener("click", closeDrawer)
$("#drawer").addEventListener("click", (e) => e.target.id === "drawer" && closeDrawer())
document.addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer())

$("#d-go").addEventListener("click", (e) =>
  busy(e.target, async () => {
    const box = $("#d-job")
    box.textContent = ""
    const channelIds = $$("#d-channels input:checked").map((x) => x.value)
    const when = $$("input[name=d-when]").find((x) => x.checked).value
    const local = $("#d-time").value
    try {
      const { job } = await call("/api/schedule", {
        slug: open.slug,
        file: open.file,
        channelIds,
        when,
        dueAt: when === "time" && local ? new Date(local).toISOString() : null,
        caption: $("#d-caption").value,
      })
      const r = await follow(job, box)
      box.innerHTML += r.results
        .map((x) => (x.ok ? `<div class="ok">✓ ${esc(x.service)} ${esc(x.channel)}: ${esc(fmt(x.dueAt))}</div>` : `<div class="err">✗ ${esc(x.service)} ${esc(x.channel)}: ${esc(x.error)}</div>`))
        .join("")
      await load()
    } catch {}
  }),
)

$("#d-delete").addEventListener("click", (e) =>
  busy(e.target, async () => {
    if (!window.confirm("Delete this file from the computer?")) return
    try {
      await call("/api/delete-file", { slug: open.slug, file: open.file })
      closeDrawer()
      await load()
    } catch (err) {
      alert(err.message)
    }
  }),
)

showTab()
load()
  .then(() => {
    if (!location.hash) location.hash = state.connected.buffer && state.connected.cloudflare ? (state.projects.length ? "#make" : "#project") : "#connect"
  })
  .catch((e) => alert(e.message))
