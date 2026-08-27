import { useState, useEffect, useCallback } from "react";
import "./App.css";
import Database from "./Database";

// ─── Photo prompts ────────────────────────────────────────────────────────────
const PHOTO_PROMPTS = {
  laki:      "cute smiling baby boy sitting chair indoor warm soft lighting elegant home background realistic professional photo",
  perempuan: "cute smiling baby girl sitting chair indoor warm soft lighting elegant home background realistic professional photo",
  umum:      "cute adorable smiling baby indoor warm natural lighting elegant cozy home background realistic professional photo",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function combineMeaning(parts) {
  const m = parts.map(p => p.meaning.replace(/^yang /i, ""));
  return `Sosok ${m[0]}, ${m[1]}, dan ${m[2]}.`;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  const lines = [];
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return lines.length;
}

// ─── Canvas ───────────────────────────────────────────────────────────────────
function drawFallbackBg(ctx, S) {
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, "#1a1205"); g.addColorStop(0.5, "#0d1a2e"); g.addColorStop(1, "#0d1205");
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
}

function drawContent(ctx, type, data, S) {
  // Dark gradient overlay (bottom)
  const grad = ctx.createLinearGradient(0, S - 520, 0, S);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.3, "rgba(0,0,0,0.52)");
  grad.addColorStop(1, "rgba(0,0,0,0.90)");
  ctx.fillStyle = grad; ctx.fillRect(0, S - 520, S, 520);

  // Top vignette
  const topG = ctx.createLinearGradient(0, 0, 0, 160);
  topG.addColorStop(0, "rgba(0,0,0,0.32)"); topG.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topG; ctx.fillRect(0, 0, S, 160);

  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";

  if (type === "hook") {
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "italic 58px Georgia, serif";
    const hookLines = [];
    for (const line of data.text.split("\n")) {
      const words = line.trim().split(" ");
      let cur = "";
      for (const w of words) {
        const test = cur ? cur + " " + w : w;
        if (ctx.measureText(test).width > S - 100 && cur) { hookLines.push(cur); cur = w; }
        else cur = test;
      }
      if (cur) hookLines.push(cur);
    }
    const startY = S - 160 - (hookLines.length - 1) * 72;
    hookLines.forEach((l, i) => ctx.fillText(l.trim(), S / 2, startY + i * 72));

  } else if (type === "main") {
    let fs = 78;
    ctx.font = `bold ${fs}px Georgia, serif`;
    while (ctx.measureText(data.fullName).width > S - 80 && fs > 42) {
      fs -= 3; ctx.font = `bold ${fs}px Georgia, serif`;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillText(data.fullName, S / 2, S - 215);

    ctx.font = "42px Georgia, serif";
    ctx.fillStyle = "rgba(255,255,255,0.87)";
    const combined = data.combined || combineMeaning(data.parts || []);
    wrapText(ctx, combined, S / 2, S - 148, S - 100, 60);

  } else if (type === "cta") {
    const ctaLines = [];
    for (const line of data.text.split("\n")) {
      const tempCtx = ctx;
      const words = line.trim().split(" ");
      let cur = "";
      for (const w of words) {
        const fSize = ctaLines.length === 0 && cur === "" ? 64 : 54;
        ctx.font = `bold ${fSize}px Georgia, serif`;
        const test = cur ? cur + " " + w : w;
        if (ctx.measureText(test).width > S - 80 && cur) { ctaLines.push(cur); cur = w; }
        else cur = test;
      }
      if (cur) ctaLines.push(cur);
    }
    const startY = S - 175 - (ctaLines.length - 1) * 80;
    ctaLines.forEach((l, i) => {
      ctx.font = `bold ${i === 0 ? 64 : 54}px Georgia, serif`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(l.trim(), S / 2, startY + i * 82);
    });
  }
}

// Load image dari URL → canvas-safe (file lokal = same-origin)
function loadImgFromUrl(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function renderFrame(type, data, bgImg) {
  const S = 1080;
  const c = document.createElement("canvas"); c.width = S; c.height = S;
  const ctx = c.getContext("2d");
  if (bgImg && bgImg.naturalWidth > 0) {
    try { ctx.drawImage(bgImg, 0, 0, S, S); } catch { drawFallbackBg(ctx, S); }
  } else drawFallbackBg(ctx, S);
  drawContent(ctx, type, data, S);
  return new Promise(resolve =>
    c.toBlob(b => resolve(b ? URL.createObjectURL(b) : c.toDataURL("image/jpeg", 0.92)), "image/jpeg", 0.92)
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]         = useState("main"); // "main" | "database"

  if (page === "database") return <Database onBack={() => setPage("main")} />;

  return <MainPage onGoToDb={() => setPage("database")} />;
}

function MainPage({ onGoToDb }) {
  const [step, setStep]         = useState(1);
  const [dbPhotos, setDbPhotos] = useState({ male:[], female:[], all:[] });
  const [inputMode, setMode]    = useState("ai");
  const [aiPrompt, setPrompt]   = useState("10 nama bayi laki-laki islami modern yang unik dan bermakna");
  const [manualInput, setManual]= useState("");
  const [hookText, setHook]     = useState("Jika anak laki-laki ku lahir,\nakan ku beri nama...");
  const [ctaText, setCta]       = useState("Mau nama bayi lagi?\nKlik link di bio! 👆");
  const [gender, setGender]     = useState("laki");
  const [isLoading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [namesData, setNames]   = useState([]);
  const [frameUrls, setFrames]  = useState([]);
  const [JsZip, setJsZip]       = useState(null);
  const [aiStatus, setAiStatus] = useState(null); // null | "ok" | "no-key"

  useEffect(() => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload = () => setJsZip(() => window.JSZip);
    document.head.appendChild(s);

    // Cek apakah Groq key tersedia
    fetch("/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "reply with valid json: {\"ok\":true}" }) })
      .then(r => r.json()).then(d => setAiStatus(d.error ? "no-key" : "ok")).catch(() => setAiStatus("no-key"));
  }, []);

  // Load foto dari database — pisah per gender
  const loadDbPhotos = useCallback(async () => {
    try {
      const r = await fetch("/api/photos");
      const data = await r.json();
      const male   = Object.values(data).flatMap(c => c["laki-laki"] || []).sort((a,b) => b.mtime - a.mtime);
      const female = Object.values(data).flatMap(c => c["perempuan"]  || []).sort((a,b) => b.mtime - a.mtime);
      const all    = [...male, ...female].sort((a,b) => b.mtime - a.mtime);
      setDbPhotos({ male, female, all });
    } catch (e) { console.warn("Gagal load db photos:", e.message); }
  }, []);
  useEffect(() => { loadDbPhotos(); }, [loadDbPhotos]);

  // ── Smart Auto-Run: kategori + foto per-folder ───────────────────────────────
  const [categories, setCategoriesList]   = useState([]);
  const [photosByCat, setPhotosByCat]     = useState({}); // { catId: { 'laki-laki':[...], 'perempuan':[...] } }
  const [folderMode, setFolderMode]       = useState("auto"); // "auto" | catId
  const [smartGender, setSmartGender]     = useState("laki"); // "laki" | "perempuan" | "mix"
  const [isSmartRunning, setIsSmartRunning] = useState(false);

  const loadCategoriesAndPhotos = useCallback(async () => {
    try {
      const [catsRes, photosRes] = await Promise.all([fetch("/api/categories"), fetch("/api/photos")]);
      setCategoriesList(await catsRes.json());
      setPhotosByCat(await photosRes.json());
    } catch (e) { console.warn("Gagal load categories:", e.message); }
  }, []);
  useEffect(() => { loadCategoriesAndPhotos(); }, [loadCategoriesAndPhotos]);

  // ── Schedule / TikTok state ──────────────────────────────────────────────────
  const [sched, setSched]       = useState(null);
  const [exports2, setExports2] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showTikTok, setShowTT] = useState(false);

  const loadSched = useCallback(async () => {
    try { setSched(await fetch('/api/schedule').then(r=>r.json())) } catch {}
  }, [])
  const loadExports = useCallback(async () => {
    try { setExports2(await fetch('/api/exports').then(r=>r.json())) } catch {}
  }, [])
  useEffect(() => { loadSched(); loadExports() }, [loadSched, loadExports])

  const saveSched = async (patch) => {
    await fetch('/api/schedule', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)})
    await loadSched()
  }

  // Simpan APP_URL ke schedule saat pertama load (dipakai cron untuk ngrok URL)
  useEffect(() => {
    fetch('/api/schedule').then(r=>r.json()).then(s => {
      if (!s.appUrl) {
        // Detect APP_URL dari window.location kalau diakses via ngrok
        const detected = window.location.origin
        if (detected && detected !== 'http://localhost:5173') {
          saveSched({ appUrl: detected })
        }
      }
    }).catch(()=>{})
  }, [])

  const scheduleForTikTok = async () => {
    if (!frameUrls.length) { alert('Generate konten dulu!'); return }
    setIsSaving(true)
    try {
      const labels = ['hook',...namesData.map(n=>n.fullName.replace(/\s+/g,'_').slice(0,20)),'cta']
      const frames = await Promise.all(frameUrls.map(url =>
        fetch(url).then(r=>r.blob()).then(blob => new Promise(res => {
          const reader = new FileReader()
          reader.onload = e => res(e.target.result.split(',')[1])
          reader.readAsDataURL(blob)
        }))
      ))
      const r = await fetch('/api/exports/save', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({frames, meta:{labels, nameCount:namesData.length}})
      })
      const d = await r.json()
      if (d.ok) { await loadExports(); alert('✅ '+frames.length+' foto disimpan ke antrian TikTok!') }
      else throw new Error(d.error)
    } catch(e) { alert('Error menyimpan: '+e.message) }
    finally { setIsSaving(false) }
  }

  const callAI = async (prompt) => {
    const res = await fetch("/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const { text, error } = await res.json();
    if (error) throw new Error(error);
    return text;
  };

  const generate = async (autoMode = false) => {
    setLoading(true);
    try {
      setProgress("🤖 AI generate nama...");
      let finalNames = [];

      if (inputMode === "ai") {
        const msg = `Generate exactly 10 Indonesian baby names based on this request: "${aiPrompt}".
Rules:
- Each name MUST have exactly 3 words
- Provide a SHORT meaning (max 7 words in Bahasa Indonesia) for each word
- Names should be beautiful and meaningful
Return ONLY valid JSON:
{"names":[{"fullName":"Word1 Word2 Word3","parts":[{"word":"Word1","meaning":"arti singkat"},{"word":"Word2","meaning":"arti singkat"},{"word":"Word3","meaning":"arti singkat"}]}]}`;

        const raw = await callAI(msg);
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) finalNames = JSON.parse(match[0]).names?.slice(0, 10) || [];

      } else {
        // Manual mode — AI generate meanings for user's names
        const names = manualInput.trim().split("\n").filter(Boolean).slice(0, 10);
        const msg = `For each of these Indonesian baby names, provide the SHORT meaning (max 7 words in Bahasa Indonesia) of each word.
Names: ${names.join(", ")}
Return ONLY valid JSON:
{"names":[{"fullName":"full name","parts":[{"word":"Word1","meaning":"arti"},{"word":"Word2","meaning":"arti"},{"word":"Word3","meaning":"arti"}]}]}`;

        const raw = await callAI(msg);
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) finalNames = JSON.parse(match[0]).names?.slice(0, 10) || [];
      }

      if (!finalNames.length) throw new Error("AI tidak bisa generate nama. Coba lagi.");
      setNames(finalNames);

      // ── Pilih foto berdasarkan folderMode + gender ────────────────────────────
      const r2   = await fetch("/api/photos");
      const dbData = await r2.json();

      // Filter by folder
      const catData = folderMode !== "auto"
        ? { [folderMode]: dbData[folderMode] || {} }
        : dbData;

      const shuffle = (arr) => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };

      const malePool   = shuffle(Object.values(catData).flatMap(c => c["laki-laki"] || []));
      const femalePool = shuffle(Object.values(catData).flatMap(c => c["perempuan"]  || []));
      const allPool    = shuffle([...malePool, ...femalePool]);

      const folderLabel = folderMode !== "auto"
        ? categories.find(c => c.id === folderMode)?.label || folderMode
        : "semua folder";

      if (allPool.length === 0) throw new Error(`Tidak ada foto di ${folderLabel}! Generate foto dulu di halaman Database.`);
      if (gender === "laki" && !malePool.length) throw new Error(`Tidak ada foto laki-laki di "${folderLabel}".`);
      if (gender === "perempuan" && !femalePool.length) throw new Error(`Tidak ada foto perempuan di "${folderLabel}".`);

      const pickPool = (nameGender) => {
        if (gender === "laki")      return malePool.length ? malePool : allPool;
        if (gender === "perempuan") return femalePool.length ? femalePool : allPool;
        // Mix: sesuaikan foto dengan gender nama
        if (nameGender === "F") return femalePool.length ? femalePool : allPool;
        return malePool.length ? malePool : allPool;
      };

      const getPhoto = async (nameGender, idx) => {
        const pool = pickPool(nameGender);
        return loadImgFromUrl(pool[idx % pool.length].url);
      };

      const gLabel = gender==="laki"?"👦":gender==="perempuan"?"👧":"🌟";
      setProgress(`📁 ${folderLabel} · ${gLabel} ${allPool.length} foto tersedia · Render...`);

      const urls = [];
      const hookPool = gender === "umum" ? allPool : pickPool(gender === "laki" ? "M" : "F");
      urls.push(await renderFrame("hook", { text: hookText }, await loadImgFromUrl(hookPool[0 % hookPool.length].url)));

      for (let i = 0; i < finalNames.length; i++) {
        const nameG = finalNames[i].gender || (gender === "perempuan" ? "F" : "M");
        urls.push(await renderFrame("main", {
          ...finalNames[i],
          combined: combineMeaning(finalNames[i].parts),
        }, await getPhoto(nameG, i)));
      }

      const ctaPool = hookPool;
      urls.push(await renderFrame("cta", { text: ctaText }, await loadImgFromUrl(ctaPool[1 % ctaPool.length].url)));

      setFrames(urls);
      if (!autoMode) setStep(2);
      return { urls, names: finalNames };
    } catch (err) {
      alert("❌ " + err.message);
      console.error(err);
      return null;
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  // ── 1-Click Full Auto: generate nama + foto → langsung masuk antrian TikTok ──
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const runFullAuto = async () => {
    setIsAutoRunning(true);
    try {
      setProgress("🚀 Auto: generate nama + foto...");
      const result = await generate(true); // autoMode=true, skip step 2
      if (!result) return; // generate() sudah alert error-nya

      setProgress("📅 Auto: simpan ke antrian TikTok...");
      const labels = ['hook', ...result.names.map(n => n.fullName.replace(/\s+/g, '_').slice(0, 20)), 'cta'];
      const frames = await Promise.all(result.urls.map(url =>
        fetch(url).then(r => r.blob()).then(blob => new Promise(res => {
          const reader = new FileReader();
          reader.onload = e => res(e.target.result.split(',')[1]);
          reader.readAsDataURL(blob);
        }))
      ));
      const r = await fetch('/api/exports/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames, meta: { labels, nameCount: result.names.length } })
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);

      await loadExports();
      setStep(2); // tampilkan preview hasil setelah selesai
      alert(`✅ Selesai! ${result.names.length} nama + ${frames.length} foto otomatis masuk antrian TikTok.`);
    } catch (e) {
      alert('❌ Auto gagal: ' + e.message);
    } finally {
      setIsAutoRunning(false);
      setProgress("");
    }
  };

  // ── Smart Auto-Run: AI tentuin tema, hook, CTA, nama & folder foto sendiri ───

  // Shuffle array secara random (Fisher-Yates)
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const runSmartAuto = async () => {
    setIsSmartRunning(true);
    try {
      setProgress("🎯 Pilih folder tema...");
      const [photosFresh, catsFresh] = await Promise.all([
        fetch("/api/photos").then(r => r.json()),
        fetch("/api/categories").then(r => r.json()),
      ]);
      setCategoriesList(catsFresh); setPhotosByCat(photosFresh);

      // Tentukan pool foto berdasarkan smartGender
      const getPool = (catId) => {
        const male   = shuffle(photosFresh[catId]?.["laki-laki"] || []);
        const female = shuffle(photosFresh[catId]?.["perempuan"]  || []);
        if (smartGender === "laki")      return { pool: male,   poolLabel: "👦 Laki-laki", male, female };
        if (smartGender === "perempuan") return { pool: female, poolLabel: "👧 Perempuan", male, female };
        return { pool: shuffle([...male, ...female]), poolLabel: "🌟 Mix", male, female };
      };

      // Pilih kategori
      const cat = folderMode !== "auto"
        ? catsFresh.find(c => c.id === folderMode)
        : (() => {
            const eligible = catsFresh.filter(c => {
              const { pool } = getPool(c.id);
              return pool.length > 0;
            });
            return eligible.length ? eligible[Math.floor(Math.random() * eligible.length)] : null;
          })();

      if (!cat) throw new Error("Tidak ada folder dengan foto yang cukup. Generate foto dulu di halaman Database.");

      const { pool, poolLabel, male: malePool, female: femalePool } = getPool(cat.id);
      if (!pool.length) throw new Error(`Folder "${cat.label}" tidak punya foto untuk gender ${poolLabel}.`);

      // Nama AI: sesuaikan gender dengan smartGender
      const genderCtx = smartGender === "laki" ? "laki-laki saja" : smartGender === "perempuan" ? "perempuan saja" : "campuran laki-laki dan perempuan";
      setProgress(`🤖 AI buat hook, CTA & nama bertema "${cat.label}" (${poolLabel})...`);
      const msg = `Kamu membuat konten media sosial nama bayi Indonesia bertema: "${cat.label}".
Nama bayi yang akan dibuat adalah untuk: ${genderCtx}.
Buat:
1. "hook": kalimat pembuka menarik gaya hook TikTok (boleh 2 baris dipisah \\n), maksimal 14 kata, sesuai tema "${cat.label}".
2. "cta": 1-2 baris ajakan klik link di bio untuk lihat nama lainnya, sesuai tema.
3. "names": PERSIS 10 nama bayi 3 kata sesuai tema "${cat.label}" untuk ${genderCtx}, tiap kata dengan arti singkat (maks 7 kata Bahasa Indonesia) dan gender M atau F.
Balas HANYA JSON valid, tanpa penjelasan:
{"hook":"baris1\\nbaris2","cta":"baris1\\nbaris2","names":[{"fullName":"Kata1 Kata2 Kata3","gender":"M","parts":[{"word":"Kata1","meaning":"arti"},{"word":"Kata2","meaning":"arti"},{"word":"Kata3","meaning":"arti"}]}]}`;

      const raw = await callAI(msg);
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("AI gagal generate konten. Coba lagi.");
      const result = JSON.parse(match[0]);
      const finalNames = (result.names || []).slice(0, 10);
      const finalHook  = result.hook || hookText;
      const finalCta   = result.cta  || ctaText;
      if (!finalNames.length) throw new Error("AI tidak menghasilkan nama yang valid.");

      setNames(finalNames); setHook(finalHook); setCta(finalCta);

      // Pilih foto: random dari pool spesifik folder + gender, cycling jika kurang dari 12
      const pickPhoto = (nameGender, idx) => {
        if (smartGender === "laki")      return pool[idx % pool.length];
        if (smartGender === "perempuan") return pool[idx % pool.length];
        // Mix: sesuaikan foto dengan gender nama
        const p = nameGender === "F"
          ? (femalePool.length ? femalePool : pool)
          : (malePool.length  ? malePool   : pool);
        return p[idx % p.length];
      };

      setProgress(`🎨 Render 12 foto dari "${cat.label}" (${poolLabel})...`);
      const urls = [];
      // Hook & CTA: ambil dari pool utama secara random
      urls.push(await renderFrame("hook", { text: finalHook }, await loadImgFromUrl(pool[0].url)));
      for (let i = 0; i < finalNames.length; i++) {
        const nameG  = finalNames[i].gender || (smartGender === "perempuan" ? "F" : "M");
        const photo  = pickPhoto(nameG, i + 1);
        urls.push(await renderFrame("main", {
          ...finalNames[i],
          combined: combineMeaning(finalNames[i].parts),
        }, await loadImgFromUrl(photo.url)));
      }
      urls.push(await renderFrame("cta", { text: finalCta }, await loadImgFromUrl(pool[Math.min(1, pool.length-1)].url)));
      setFrames(urls);

      setProgress("📅 Simpan ke antrian TikTok...");
      const labels = ['hook', ...finalNames.map(n => n.fullName.replace(/\s+/g, '_').slice(0, 20)), 'cta'];
      const frameB64 = await Promise.all(urls.map(url =>
        fetch(url).then(r => r.blob()).then(blob => new Promise(res => {
          const reader = new FileReader();
          reader.onload = e => res(e.target.result.split(',')[1]);
          reader.readAsDataURL(blob);
        }))
      ));
      const r = await fetch('/api/exports/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames: frameB64, meta: { labels, nameCount: finalNames.length, theme: cat.label, category: cat.id, genderLabel: poolLabel } })
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);

      await loadExports();
      setStep(2);
      alert(`✅ Smart Auto selesai!\nFolder: ${cat.emoji} ${cat.label}\nGender: ${poolLabel}\n${finalNames.length} nama + 12 foto masuk antrian TikTok.`);
    } catch (e) {
      alert('❌ Smart Auto gagal: ' + e.message);
    } finally {
      setIsSmartRunning(false);
      setProgress("");
    }
  };




  const exportZip = async () => {
    if (!JsZip) { alert("JSZip belum siap."); return; }
    setLoading(true); setProgress("📦 Membuat ZIP...");
    try {
      const zip = new JsZip();
      const folder = zip.folder("baby-names");
      for (let i = 0; i < frameUrls.length; i++) {
        const blob = await fetch(frameUrls[i]).then(r => r.blob());
        const b64 = await new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result.split(",")[1]); r.readAsDataURL(blob); });
        const slug = (namesData[i - 1]?.fullName || "main").replace(/\s+/g, "_");
        const fname = i === 0 ? "00_hook.jpg" : i === frameUrls.length - 1 ? `${String(i).padStart(2,"0")}_cta.jpg` : `${String(i).padStart(2,"0")}_${slug}.jpg`;
        folder.file(fname, b64, { base64: true });
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "baby-names.zip"; a.click();
    } catch (err) { alert("Export error: " + err.message); }
    finally { setLoading(false); setProgress(""); }
  };

  const downloadOne = (url, i) => {
    const slug = (namesData[i - 1]?.fullName || "main").replace(/\s+/g, "_");
    const fname = i === 0 ? "00_hook.jpg" : i === frameUrls.length - 1 ? `${String(i).padStart(2,"0")}_cta.jpg` : `${String(i).padStart(2,"0")}_${slug}.jpg`;
    Object.assign(document.createElement("a"), { href: url, download: fname }).click();
  };

  // ── TikTok Panel ────────────────────────────────────────────────────────────
  const [previewExport, setPreviewExport] = useState(null); // export object being previewed

  const TikTokPanel = () => {
    const connected = !!sched?.tiktok?.accessToken
    const nextPost  = exports2.filter(e=>e.pending)[0]

    const connectTikTok = async () => {
      const r = await fetch('/api/tiktok/authurl')
      const { authUrl, error } = await r.json()
      if (error) return alert('Error: '+error)
      window.open(authUrl, '_blank', 'width=600,height=700')
    }
    const disconnect = async () => {
      if (!window.confirm('Putuskan koneksi TikTok?')) return
      await fetch('/api/tiktok/disconnect', {method:'POST'})
      await loadSched()
    }
    const postNow = async () => {
      if (!window.confirm('Post ke TikTok sekarang?')) return
      await fetch('/api/tiktok/post', {method:'POST'})
      await loadSched(); await loadExports()
    }
    const removeExport = async (id) => {
      await fetch('/api/exports/delete', {method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
      await loadExports()
    }

    return (
      <div className="card" style={{marginTop:4}}>
        <div className="card-title" style={{marginBottom:16}}>📱 TikTok Auto-Post</div>

        {/* Connection */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',background:connected?'#f0fdf4':'#fdf9f0',borderRadius:12,marginBottom:14,border:'1px solid '+(connected?'#bbf0cc':'#f0dca0')}}>
          <div>
            <div style={{fontWeight:700,fontSize:13,color:connected?'#166534':'#7a5a20'}}>
              {connected ? '✅ Terhubung sebagai @'+sched.tiktok.username : '⚠️ Belum terhubung ke TikTok'}
            </div>
            <div style={{fontSize:11,color:'#9a9080',marginTop:2}}>
              {connected ? 'Siap auto-post ke TikTok' : 'Butuh TIKTOK_CLIENT_KEY & SECRET di .env'}
            </div>
          </div>
          {connected
            ? <button onClick={disconnect} style={{background:'#fee2e2',color:'#991b1b',border:'none',borderRadius:9,padding:'6px 14px',cursor:'pointer',fontSize:12,fontWeight:700}}>Disconnect</button>
            : <button onClick={connectTikTok} style={{background:'#000',color:'#fff',border:'none',borderRadius:9,padding:'6px 14px',cursor:'pointer',fontSize:12,fontWeight:700}}>🔗 Hubungkan</button>
          }
        </div>

        {/* Schedule config */}
        <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'10px 14px',alignItems:'center',marginBottom:14}}>
          <label className="label" style={{margin:0}}>Jadwal Harian</label>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <input type="number" min={0} max={23} value={sched?.hour??15}
              onChange={e=>saveSched({hour:+e.target.value})}
              style={{width:52,padding:'6px 8px',borderRadius:8,border:'1.5px solid #e8e4dc',textAlign:'center',fontSize:14,fontWeight:700}}/>
            <span style={{fontWeight:700}}>:</span>
            <input type="number" min={0} max={59} value={sched?.minute??0}
              onChange={e=>saveSched({minute:+e.target.value})}
              style={{width:52,padding:'6px 8px',borderRadius:8,border:'1.5px solid #e8e4dc',textAlign:'center',fontSize:14,fontWeight:700}}/>
            <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',marginLeft:8}}>
              <input type="checkbox" checked={!!sched?.enabled} onChange={e=>saveSched({enabled:e.target.checked})} style={{width:16,height:16}}/>
              <span style={{fontSize:13,fontWeight:600,color:sched?.enabled?'#166534':'#9a9080'}}>
                {sched?.enabled?'✅ Aktif':'Nonaktif'}
              </span>
            </label>
          </div>

          <label className="label" style={{margin:0}}>Caption</label>
          <textarea value={sched?.caption||''} onChange={e=>saveSched({caption:e.target.value})}
            rows={3} className="textarea" placeholder="Caption + hashtag TikTok..."/>
        </div>

        {/* Export queue — sekarang dengan thumbnail preview */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:700,color:'#5a5040',marginBottom:8}}>
            📤 Antrian ({exports2.filter(e=>e.pending).length} konten)
          </div>
          {exports2.length === 0
            ? <div style={{fontSize:12,color:'#b0a898',textAlign:'center',padding:'12px 0'}}>Belum ada konten dijadwalkan — Generate konten lalu klik "📅 Jadwalkan"</div>
            : <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {exports2.slice(0,8).map(ex=>(
                  <div key={ex.id} onClick={()=>setPreviewExport(ex)} style={{
                    display:'flex',alignItems:'center',gap:10,padding:'8px 10px',
                    background:ex.pending?'#f0fdf4':'#f5f3ef',borderRadius:10,
                    border:'1px solid '+(ex.pending?'#bbf0cc':'#e8e4dc'), cursor:'pointer',
                  }}>
                    {/* Thumbnail strip */}
                    <div style={{display:'flex',gap:2,flexShrink:0}}>
                      {(ex.files||[]).slice(0,3).map((f,i)=>(
                        <img key={i} src={f.url} alt="" style={{width:28,height:28,borderRadius:5,objectFit:'cover',border:'1px solid #fff'}}/>
                      ))}
                      {(ex.frameCount||0) > 3 && (
                        <div style={{width:28,height:28,borderRadius:5,background:'#e8e4dc',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:'#7a7060'}}>
                          +{ex.frameCount-3}
                        </div>
                      )}
                    </div>
                    <span style={{fontSize:11,fontWeight:700,color:ex.pending?'#166534':'#9a9080',flexShrink:0}}>{ex.pending?'⏳':'✅'}</span>
                    <span style={{fontSize:12,flex:1,color:'#5a5040'}}>
                      {ex.meta?.theme ? `🎯 ${ex.meta.theme} · ` : ''}
                      {new Date(+ex.id).toLocaleString('id-ID',{dateStyle:'short',timeStyle:'short'})} · {ex.frameCount} foto
                    </span>
                    <button onClick={e=>{e.stopPropagation();removeExport(ex.id)}} style={{background:'none',border:'none',color:'#c00',cursor:'pointer',fontSize:14,padding:'2px 6px',flexShrink:0}}>✕</button>
                  </div>
                ))}
              </div>
          }
        </div>

        {/* Manual post */}
        {connected && nextPost && (
          <button onClick={postNow} style={{width:'100%',padding:'11px 0',borderRadius:12,border:'none',background:'linear-gradient(135deg,#000,#333)',color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}}>
            📤 Post Sekarang (konten terdepan)
          </button>
        )}

        {sched?.lastPost && (
          <div style={{marginTop:10,fontSize:11,color:'#9a9080',textAlign:'center'}}>
            Post terakhir: {new Date(sched.lastPost.time).toLocaleString('id-ID')} {sched.lastPost.error ? '❌ '+sched.lastPost.error : '✅ '+sched.lastPost.publishId}
          </div>
        )}

        {/* Preview Modal — lihat 12 foto asli sebelum di-post */}
        {previewExport && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
            onClick={()=>setPreviewExport(null)}>
            <div style={{background:'#fff',borderRadius:20,maxWidth:560,width:'100%',maxHeight:'88vh',overflow:'auto',padding:24}}
              onClick={e=>e.stopPropagation()}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                <div>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700}}>
                    {previewExport.meta?.theme ? `🎯 ${previewExport.meta.theme}` : '📋 Preview Konten'}
                  </div>
                  <div style={{fontSize:12,color:'#9a9080',marginTop:2}}>
                    {new Date(+previewExport.id).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})} · {previewExport.frameCount} foto
                  </div>
                </div>
                <button onClick={()=>setPreviewExport(null)} style={{background:'#f0ece4',border:'none',borderRadius:9,width:32,height:32,cursor:'pointer',fontSize:16}}>✕</button>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:16}}>
                {(previewExport.files||[]).map((f,i)=>(
                  <div key={i} style={{position:'relative',borderRadius:10,overflow:'hidden',aspectRatio:'1',background:'#eee'}}>
                    <img src={f.url} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                    <span style={{position:'absolute',top:4,left:4,background:'rgba(0,0,0,0.6)',color:'#fff',fontSize:9,fontWeight:700,padding:'2px 5px',borderRadius:4}}>
                      {i===0?'HOOK':i===previewExport.files.length-1?'CTA':`#${i}`}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <button onClick={()=>{removeExport(previewExport.id);setPreviewExport(null)}}
                  style={{padding:12,borderRadius:12,border:'1.5px solid #fcc',background:'#fff0f0',color:'#c00',cursor:'pointer',fontWeight:700,fontSize:13}}>
                  🗑️ Hapus dari Antrian
                </button>
                <button onClick={()=>setPreviewExport(null)}
                  style={{padding:12,borderRadius:12,border:'none',background:'#1a1814',color:'#f5f0e8',cursor:'pointer',fontWeight:700,fontSize:13}}>
                  ✓ Tutup
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }


  const LABELS = ["HOOK", ...Array.from({length:10},(_,i)=>`#${i+1}`), "CTA"];
  const BADGE_BG = ["#f59e0b", ...Array(10).fill("#0ea5e9"), "#10b981"];

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="header-brand">
            <span>🍼</span>
            <div>
              <div className="header-title">Baby Name Creator</div>
              <div className="header-sub">AI · 12 Foto Instagram 1:1 · Export ZIP</div>
            </div>
          </div>
          <div className="steps">
            {["Config","Preview"].map((s,i)=>(
              <div key={i} className="steps-row">
                {i>0 && <div className="step-line"/>}
                <div className={`step-badge ${step===i+1?"active":step>i+1?"done":""}`}>{step>i+1?"✓":i+1}</div>
                <span className={`step-label ${step===i+1?"active":""}`}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="main">
        {step === 1 && (
          <div className="fade-in col-gap">

            {/* AI Status */}
            {aiStatus === "no-key" && (
              <div className="card card-yellow">
                <div className="card-title">⚠️ Groq API Key belum terpasang</div>
                <p className="hint" style={{marginTop:6}}>
                  1. Daftar gratis di <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com</a> (pakai email, no CC)<br/>
                  2. Copy API key (format: <code>gsk_...</code>)<br/>
                  3. Buat file <code>.env</code> di folder project:<br/>
                  <code style={{display:"block",marginTop:6,padding:"8px 12px",background:"#1a1a1a",color:"#4ade80",borderRadius:8}}>GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxx</code>
                  4. Restart <code>npm run dev</code>
                </p>
              </div>
            )}
            {aiStatus === "ok" && (
              <div className="card card-green" style={{padding:"12px 20px"}}>
                <span className="card-title">✅ Groq AI siap — generate nama bebas tiap klik!</span>
              </div>
            )}

            {/* Input */}
            <div className="card">
              <div className="card-title">📝 Input Nama Bayi</div>
              <div className="toggle-group">
                {[["ai","🤖 AI Generate"],["manual","✍️ Input Manual"]].map(([m,l])=>(
                  <button key={m} className={`toggle-btn ${inputMode===m?"active":""}`} onClick={()=>setMode(m)}>{l}</button>
                ))}
              </div>
              {inputMode === "ai" ? (
                <>
                  <label className="label">Prompt</label>
                  <textarea value={aiPrompt} onChange={e=>setPrompt(e.target.value)} rows={3} className="textarea"
                    placeholder="10 nama bayi laki-laki islami modern yang unik"/>
                  <p className="hint">AI Groq generate 10 nama 3 kata + arti tiap klik ✨</p>
                </>
              ) : (
                <>
                  <label className="label">Daftar Nama (1 per baris · maks 10)</label>
                  <textarea value={manualInput} onChange={e=>setManual(e.target.value)} rows={7} className="textarea mono"
                    placeholder={"Akhyar Dika Maulana\nRaihan Faris Akbar\nZaidan Naufal Ibrahim"}/>
                  <p className="hint">AI generate arti tiap kata otomatis</p>
                </>
              )}
            </div>

            {/* Hook & CTA */}
            <div className="card">
              <div className="card-title">🎣 Teks Hook & CTA</div>
              <div className="two-col">
                <div>
                  <label className="label">Hook</label>
                  <textarea value={hookText} onChange={e=>setHook(e.target.value)} rows={4} className="textarea"/>
                </div>
                <div>
                  <label className="label">CTA</label>
                  <textarea value={ctaText} onChange={e=>setCta(e.target.value)} rows={4} className="textarea"/>
                </div>
              </div>
            </div>

            {/* Folder + Gender foto dari database */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">📸 Foto dari Database</span>
                <span className="badge badge-green">Local · Random per slide</span>
              </div>
              <p className="hint" style={{marginBottom:12}}>Pilih folder dan gender foto yang akan dipakai — dipilih random dari stok yang tersedia</p>

              {/* Folder dropdown */}
              <label className="label">📁 Folder</label>
              <select value={folderMode} onChange={e=>setFolderMode(e.target.value)}
                className="input" style={{marginBottom:12, cursor:"pointer"}}>
                <option value="auto">🔀 Semua folder (random)</option>
                {categories.map(c => {
                  const m = photosByCat[c.id]?.["laki-laki"]?.length || 0;
                  const f = photosByCat[c.id]?.["perempuan"]?.length || 0;
                  return (
                    <option key={c.id} value={c.id} disabled={m===0&&f===0}>
                      {c.emoji} {c.label} — 👦{m} · 👧{f}{m===0&&f===0?" (kosong)":""}
                    </option>
                  );
                })}
              </select>

              {/* Gender buttons */}
              <label className="label">🧒 Gender</label>
              <div className="gender-row">
                {[["laki","👦","Laki-laki"],["perempuan","👧","Perempuan"],["umum","👶","Mix"]].map(([k,e,l]) => {
                  const src = folderMode !== "auto" ? photosByCat[folderMode] : Object.values(photosByCat).reduce((acc,c)=>({
                    "laki-laki":[...(acc["laki-laki"]||[]),...(c["laki-laki"]||[])],
                    "perempuan":[...(acc["perempuan"]||[]),...(c["perempuan"]||[])],
                  }),{});
                  const m = src?.["laki-laki"]?.length || 0;
                  const f = src?.["perempuan"]?.length  || 0;
                  const n = k==="laki" ? m : k==="perempuan" ? f : m+f;
                  return (
                    <button key={k} className={`gender-btn ${gender===k?"active":""}`} onClick={()=>setGender(k)}>
                      <span className="gender-emoji">{e}</span>
                      <span className="gender-label">{l}</span>
                      <span style={{fontSize:10,opacity:0.7}}>{n} foto</span>
                    </button>
                  );
                })}
              </div>

              {/* Info stok */}
              {(() => {
                const src = folderMode !== "auto" ? photosByCat[folderMode] : Object.values(photosByCat).reduce((acc,c)=>({
                  "laki-laki":[...(acc["laki-laki"]||[]),...(c["laki-laki"]||[])],
                  "perempuan":[...(acc["perempuan"]||[]),...(c["perempuan"]||[])],
                }),{});
                const m = src?.["laki-laki"]?.length||0;
                const f = src?.["perempuan"]?.length||0;
                const total = gender==="laki"?m:gender==="perempuan"?f:m+f;
                const cat = folderMode !== "auto" ? categories.find(c=>c.id===folderMode) : null;
                return total > 0 ? (
                  <div style={{marginTop:10,padding:"8px 12px",background:"#f0fdf4",borderRadius:9,border:"1px solid #bbf0cc",fontSize:12,color:"#166534"}}>
                    ✅ {cat ? `${cat.emoji} ${cat.label}` : "Semua folder"} · {gender==="laki"?"👦":gender==="perempuan"?"👧":"🌟"} <strong>{total} foto</strong> tersedia, dipilih random per slide
                  </div>
                ) : (
                  <div style={{marginTop:10,padding:"8px 12px",background:"#fdf9f0",borderRadius:9,border:"1px solid #f0dca0",fontSize:12,color:"#7a5a20"}}>
                    ⚠️ Belum ada foto untuk pilihan ini. Generate foto dulu di halaman Database.
                  </div>
                );
              })()}
            </div>

            {/* DB Status */}
            {(() => {
              const total = dbPhotos.all?.length || 0;
              const male  = dbPhotos.male?.length || 0;
              const female= dbPhotos.female?.length || 0;
              return (
                <div style={{ background: total > 0 ? "#f8fdf9" : "#fffdf0", border: `1px solid ${total > 0 ? "#b8e0c8" : "#e8c96e"}`, borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontSize: 13, color: total > 0 ? "#2d6a4a" : "#7a5a20", lineHeight: 1.5 }}>
                    {total > 0
                      ? <>{`📁 ${total} foto `}<span style={{opacity:.7}}>· 👦 {male} laki-laki · 👧 {female} perempuan</span></>
                      : "⚠️ Database kosong! Generate foto dulu sebelum membuat konten."}
                  </span>
                  <button onClick={onGoToDb} style={{ background: "#1a1814", color: "#c9a96e", border: "none", borderRadius: 10, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif" }}>
                    📁 Kelola Foto
                  </button>
                </div>
              );
            })()}

            {/* TikTok Panel toggle */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'#f5f3ef',borderRadius:14,padding:'12px 16px',cursor:'pointer'}}
              onClick={()=>setShowTT(v=>!v)}>
              <span style={{fontSize:13,fontWeight:600,color:'#5a5040'}}>
                📱 TikTok Auto-Post {sched?.enabled?'✅ Aktif':'· Nonaktif'} {sched?.enabled?`· Jam ${sched.hour}:${String(sched.minute).padStart(2,'0')}`:''}
              </span>
              <span style={{fontSize:12,color:'#9a9080'}}>{showTikTok?'▲ Tutup':'▼ Buka'}</span>
            </div>
            {showTikTok && <TikTokPanel />}

            <div className="info-banner">
              ✨ Foto diambil dari database lokal (prioritas terbaru) · Tidak butuh internet untuk generate konten
            </div>

            {/* Smart Auto-Run */}
            <div className="card" style={{border:"2px solid #c9a96e", background:"#fdf9f0"}}>
              <div className="card-header">
                <span className="card-title">🎯 Smart Auto-Run</span>
                <span className="badge" style={{background:"#f0e4ff",color:"#7c3aed"}}>AI Full Otomatis</span>
              </div>
              <p className="hint" style={{marginBottom:14}}>
                AI tentukan tema, hook, CTA, 10 nama, & pilih foto random sesuai folder + gender — kamu tinggal review di antrian TikTok.
              </p>

              {/* Folder selector */}
              <label className="label">📁 Folder Foto</label>
              <select value={folderMode} onChange={e=>setFolderMode(e.target.value)}
                className="input" style={{marginBottom:12, cursor:"pointer"}}>
                <option value="auto">🤖 Otomatis — AI pilih tema dari folder yang tersedia</option>
                {categories.map(c => {
                  const m = photosByCat[c.id]?.["laki-laki"]?.length || 0;
                  const f = photosByCat[c.id]?.["perempuan"]?.length || 0;
                  return (
                    <option key={c.id} value={c.id} disabled={m===0 && f===0}>
                      {c.emoji} {c.label} — 👦{m} · 👧{f}{(m===0&&f===0) ? " (kosong)" : ""}
                    </option>
                  );
                })}
              </select>

              {/* Gender selector */}
              <label className="label">🧒 Gender Foto</label>
              <div style={{display:"flex", gap:8, marginBottom:12}}>
                {[
                  {val:"laki",      icon:"👦", label:"Laki-laki"},
                  {val:"perempuan", icon:"👧", label:"Perempuan"},
                  {val:"mix",       icon:"🌟", label:"Mix"},
                ].map(g => {
                  const catId = folderMode !== "auto" ? folderMode : null;
                  const m = catId ? photosByCat[catId]?.["laki-laki"]?.length||0 : Object.values(photosByCat).reduce((s,c)=>s+(c["laki-laki"]?.length||0),0);
                  const f = catId ? photosByCat[catId]?.["perempuan"]?.length||0  : Object.values(photosByCat).reduce((s,c)=>s+(c["perempuan"]?.length||0),0);
                  const count = g.val==="laki" ? m : g.val==="perempuan" ? f : m+f;
                  const active = smartGender === g.val;
                  return (
                    <button key={g.val} onClick={()=>setSmartGender(g.val)} style={{
                      flex:1, padding:"10px 8px", borderRadius:12, cursor:"pointer", fontSize:12, fontWeight:700,
                      border: active ? "2px solid #c9a96e" : "1.5px solid #e8e4dc",
                      background: active ? "#fdf3e0" : "#fff",
                      color: active ? "#7a5a20" : "#9a9080",
                      display:"flex", flexDirection:"column", alignItems:"center", gap:3,
                      fontFamily:"'DM Sans',sans-serif",
                    }}>
                      <span style={{fontSize:18}}>{g.icon}</span>
                      <span>{g.label}</span>
                      <span style={{fontSize:10, opacity:0.7}}>{count} foto</span>
                    </button>
                  );
                })}
              </div>

              {/* Info box: folder + gender yang akan dipakai */}
              {folderMode !== "auto" && (() => {
                const cat = categories.find(c => c.id === folderMode);
                const m = photosByCat[folderMode]?.["laki-laki"]?.length || 0;
                const f = photosByCat[folderMode]?.["perempuan"]?.length || 0;
                const poolCount = smartGender==="laki" ? m : smartGender==="perempuan" ? f : m+f;
                return (
                  <div style={{background:"#f0fdf4",border:"1px solid #bbf0cc",borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:12,color:"#166534"}}>
                    📁 Akan pakai foto dari <strong>{cat?.emoji} {cat?.label}</strong> · {smartGender==="laki"?"👦 Laki-laki":smartGender==="perempuan"?"👧 Perempuan":"🌟 Mix"} · <strong>{poolCount} foto tersedia</strong> (dipilih random)
                  </div>
                );
              })()}

              <button onClick={runSmartAuto} disabled={isLoading||isAutoRunning||isSmartRunning} style={{
                width:"100%", padding:"16px 0", borderRadius:16, border:"none",
                background: isSmartRunning ? "#d8cdb0" : "linear-gradient(135deg,#7c3aed,#a855f7)",
                color:"#fff", fontFamily:"'DM Sans',sans-serif",
                fontSize:14, fontWeight:700, cursor:(isLoading||isAutoRunning||isSmartRunning)?"not-allowed":"pointer",
                display:"flex", alignItems:"center", justifyContent:"center", gap:10,
                boxShadow: isSmartRunning ? "none" : "0 6px 20px rgba(124,58,237,0.25)",
              }}>
                {isSmartRunning
                  ? <span className="loading-row"><span className="spinner"/>{progress||"Smart running..."}</span>
                  : "🎯 Smart Auto-Run — Tema + Nama + Foto + Jadwal"}
              </button>
            </div>

            <button className="btn-generate" onClick={() => generate(false)} disabled={isLoading || isAutoRunning || isSmartRunning}>
              {isLoading && !isAutoRunning
                ? <span className="loading-row"><span className="spinner"/>{progress||"Generating..."}</span>
                : "🚀  Generate 12 Foto Sekarang"}
            </button>

            <button onClick={runFullAuto} disabled={isLoading || isAutoRunning || isSmartRunning} style={{
              width:"100%", padding:"16px 0", borderRadius:18, border:"2px dashed #c9a96e",
              background: isAutoRunning ? "#f0ece4" : "#fdf7ee",
              color:"#7a5a20", fontFamily:"'DM Sans',sans-serif",
              fontSize:14, fontWeight:700, cursor: (isLoading||isAutoRunning) ? "not-allowed" : "pointer",
              display:"flex", alignItems:"center", justifyContent:"center", gap:10,
            }}>
              {isAutoRunning
                ? <span className="loading-row"><span className="spinner" style={{borderTopColor:"#c9a96e"}}/>{progress||"Auto running..."}</span>
                : "⚡ 1-Click Auto — Generate + Langsung Jadwalkan TikTok"}
            </button>
            <p style={{fontSize:11,color:"#b0a898",textAlign:"center",marginTop:-8}}>
              Sekali klik: buat 10 nama + 12 foto + masuk antrian TikTok otomatis
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="fade-in col-gap">
            <div className="preview-header">
              <div>
                <div className="preview-title">Preview Konten</div>
                <div className="preview-sub">12 foto 1:1 · Klik foto untuk simpan</div>
              </div>
              <button className="btn-back" onClick={()=>setStep(1)}>← Edit Ulang</button>
            </div>

            <div className="grid">
              {frameUrls.map((url,i)=>(
                <div key={i} className="frame-card" onClick={()=>downloadOne(url,i)}>
                  <img src={url} alt={LABELS[i]} className="frame-img"/>
                  <span className="frame-badge" style={{background:BADGE_BG[i]}}>{LABELS[i]}</span>
                  <div className="frame-overlay"><span className="frame-dl">⬇ Simpan</span></div>
                </div>
              ))}
            </div>

            {namesData.length > 0 && (
              <div className="card">
                <div className="card-title" style={{marginBottom:10}}>📋 Nama yang Di-generate</div>
                <div className="name-list">
                  {namesData.map((n,i)=>(
                    <div key={i} className="name-row">
                      <span className="name-num">{i+1}</span>
                      <span className="name-full">{n.fullName}</span>
                      <span className="name-meanings">{n.parts.map(p=>p.meaning).join(" · ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
              <button className="btn-secondary" onClick={()=>setStep(1)}>← Edit</button>
              <button className="btn-export" onClick={exportZip} disabled={isLoading}>
                {isLoading ? <span className="loading-row"><span className="spinner"/>{progress}</span> : "📦 ZIP"}
              </button>
              <button onClick={scheduleForTikTok} disabled={isSaving}
                style={{padding:'15px 0',borderRadius:16,border:'none',background:'linear-gradient(135deg,#000,#333)',color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                {isSaving ? <><span className="spinner" style={{borderTopColor:'#fff'}}/> Saving...</> : '📅 Jadwalkan'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}