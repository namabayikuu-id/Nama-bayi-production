import { useState, useEffect, useCallback, useRef } from "react";

const GENDERS = [
  { id: "laki-laki",  label: "Laki-laki", emoji: "👦" },
  { id: "perempuan",  label: "Perempuan",  emoji: "👧" },
]

const PROMPT_TEMPLATE = {
  "laki-laki": "Professional portrait photo of a cute healthy chubby baby boy, [GAYA: misal 'wearing white thobe, Muslim Islamic style'], sitting upright, upper body visible, chubby cheeks bright eyes, warm indoor lighting, bokeh background, sharp focus face, high quality DSLR photography",
  "perempuan":  "Professional portrait photo of a cute healthy chubby baby girl, [GAYA: misal 'wearing hijab pastel outfit, Muslim Islamic style'], sitting upright, upper body visible, chubby cheeks bright eyes, warm indoor lighting, bokeh background, sharp focus face, high quality DSLR photography",
}

const EMOJIS = ["🕌","🌿","🌙","🌸","✨","🦋","🌺","🍀","⭐","🎀","🌼","💎","🏡","🌈","🦄","🍃","🌻","💫","🎋","🏔️"]

// ── Helpers ────────────────────────────────────────────────────────────────────
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function Card({ children, style = {} }) {
  return <div style={{ background:"#fff", borderRadius:20, border:"1px solid #ece9e3", boxShadow:"0 2px 12px rgba(0,0,0,0.04)", ...style }}>{children}</div>
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Database({ onBack }) {
  const [categories, setCategories] = useState([])
  const [photos, setPhotos]         = useState({})
  const [quota, setQuota]           = useState(null) // {used, budget, remaining, estimatedPhotosLeft}
  const [generating, setGenerating] = useState({}) // {catId_gender: "1/4 ✓ — jeda 5d..."}
  const [toast, setToast]           = useState(null)
  const [preview, setPreview]       = useState(null)
  const [editPrompt, setEditPrompt] = useState(null) // {cat, gender}
  const [newCatModal, setNewCat]    = useState(false)
  const [editCat, setEditCat]       = useState(null)  // category being label-edited

  const showToast = (msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null), 3500) }

  // ── Auto-Run state ──────────────────────────────────────────────────────────
  const isRunningRef  = useRef(false)
  const [isRunning,  setIsRunning]  = useState(false)
  const [runStatus,  setRunStatus]  = useState("")
  const [targetCount,setTargetCount]= useState(10)   // target foto per folder
  const DELAY_BETWEEN = 3 // detik antar foto (Cloudflare Workers tidak ada rate-limit ketat)

  const stopAll = () => {
    isRunningRef.current = false
    setRunStatus("⏹ Menghentikan setelah foto ini selesai...")
  }

  const runAll = async () => {
    if (isRunningRef.current) return
    isRunningRef.current = true
    setIsRunning(true)
    setRunStatus("🚀 Mulai auto-run...")

    const step = targetCount        // kelipatan kenaikan = target awal yang diinput user
    let currentTarget = targetCount // target ini akan naik terus: 10 → 20 → 30 → ...

    const countdown = async (seconds, prefix="") => {
      for (let s = seconds; s > 0; s--) {
        if (!isRunningRef.current) return false
        setRunStatus(`${prefix} — jeda ${s}d...`)
        await new Promise(r => setTimeout(r, 1000))
      }
      return true
    }

    outer: while (isRunningRef.current) {
      // Refresh data terbaru
      const r   = await fetch("/api/photos")
      const data = await r.json()
      const cats = await fetch("/api/categories").then(r=>r.json())

      let anyGenerated = false

      for (const cat of cats) {
        for (const gObj of [{ id:"laki-laki", label:"👦 Laki-laki" },{ id:"perempuan", label:"👧 Perempuan" }]) {
          if (!isRunningRef.current) break outer

          const current = data[cat.id]?.[gObj.id]?.length || 0
          if (current >= currentTarget) {
            setRunStatus(`✅ ${cat.emoji} ${cat.label} / ${gObj.label} sudah ${current}/${currentTarget} — skip`)
            await new Promise(r => setTimeout(r, 500))
            continue
          }

          const needed = currentTarget - current
          for (let i = 0; i < needed; i++) {
            if (!isRunningRef.current) break outer

            // Cek quota sebelum generate — stop otomatis kalau hampir habis
            const q = await fetch("/api/quota").then(r => r.json()).catch(() => null)
            if (q) {
              setQuota(q)
              if (q.remaining < q.neuronsPerImage) {
                showToast(`🛑 Quota neuron harian habis (${q.used}/${q.budget}). Auto-Run berhenti, reset jam 00:00 UTC.`, "warn")
                setRunStatus(`🛑 Quota habis — berhenti otomatis. Reset 00:00 UTC.`)
                isRunningRef.current = false
                break outer
              }
            }

            const photoNum = current + i + 1
            setRunStatus(`📸 ${cat.emoji} ${cat.label} / ${gObj.label} — foto ${photoNum}/${currentTarget}${q ? ` · 🔋${q.estimatedPhotosLeft} foto lagi` : ''}`)

            try {
              await generateOne(cat, gObj.id, Math.floor(Math.random() * 99999))
              anyGenerated = true
              await load()
              await loadQuota()
            } catch(e) {
              showToast(`⚠️ ${e.message}`, "warn")
              if (e.message.includes("QUOTA_EXCEEDED")) {
                setRunStatus(`🛑 Quota habis — berhenti otomatis. Reset 00:00 UTC.`)
                isRunningRef.current = false
                break outer
              }
              if (e.message.includes("Cloudflare") || e.message.includes("ECONNREFUSED")) {
                const ok = await countdown(10, "⚠️ Worker error, tunggu")
                if (!ok) break outer
              }
            }

            // Jeda antar foto (kecuali foto terakhir di semua folder untuk target ini)
            const isLast = i === needed - 1
            const nextCatHasNeeded = cats.slice(cats.indexOf(cat)+1).some(c =>
              (data[c.id]?.["laki-laki"]?.length||0) < currentTarget ||
              (data[c.id]?.["perempuan"]?.length||0) < currentTarget
            )
            if (!isLast || nextCatHasNeeded) {
              const ok = await countdown(DELAY_BETWEEN, `✅ Foto ${photoNum} OK`)
              if (!ok) break outer
            }
          }
        }
      }

      if (!isRunningRef.current) break

      if (!anyGenerated) {
        // Semua folder sudah penuh currentTarget → naikkan target & lanjut loop selamanya
        const oldTarget = currentTarget
        currentTarget += step
        setTargetCount(currentTarget) // sinkronkan ke input UI juga
        setRunStatus(`🎉 Semua folder sudah ${oldTarget} foto! Naik target ke ${currentTarget} dan lanjut...`)
        const ok = await countdown(5, `🔼 Lanjut ke target ${currentTarget}`)
        if (!ok) break
      }
    }

    isRunningRef.current = false
    setIsRunning(false)
    setRunStatus("")
    showToast("⏹ Auto-run dihentikan")
  }

  const load = useCallback(async () => {
    const [catsRes, photosRes] = await Promise.all([fetch("/api/categories"), fetch("/api/photos")])
    setCategories(await catsRes.json())
    setPhotos(await photosRes.json())
  }, [])

  const loadQuota = useCallback(async () => {
    try { const r = await fetch("/api/quota"); setQuota(await r.json()) } catch {}
  }, [])

  useEffect(() => { load(); loadQuota() }, [load, loadQuota])

  const totalPhotos = Object.values(photos).flatMap(c => Object.values(c)).flat().length

  // ── CRUD Categories ──────────────────────────────────────────────────────────
  const saveCategory = async (cat) => {
    await fetch("/api/categories", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(cat) })
    await load()
  }

  const deleteCategory = async (id) => {
    if (!window.confirm("Hapus kategori ini beserta semua fotonya?")) return
    await fetch("/api/categories", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id}) })
    await load()
    showToast("🗑️ Kategori dihapus")
  }

  // ── Generate Photos ──────────────────────────────────────────────────────────
  const DELAY = 8000
  const generateOne = async (cat, gender, seed) => {
    const prompt = gender === "laki-laki" ? cat.promptMale : cat.promptFemale
    const r = await fetch("/api/photos/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, category: cat.id, gender, seed }),
    })
    const data = await r.json()
    if (data.error) throw new Error(data.error)
    if (data.quota) setQuota(q => ({ ...q, used: data.quota.used, remaining: Math.max(0, (q?.budget||10000) - data.quota.used) }))
    return data
  }

  // Upload foto manual dari komputer
  const handleUpload = async (cat, gender, files) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const base64 = await new Promise(res => {
        const reader = new FileReader()
        reader.onload = e => res(e.target.result.split(',')[1])
        reader.readAsDataURL(file)
      })
      const seed = Date.now()
      const r = await fetch('/api/photos/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, category: cat.id, gender, seed }),
      })
      const d = await r.json()
      if (d.error) showToast('⚠️ Upload gagal: ' + d.error, 'warn')
      else { showToast('✅ Foto berhasil diupload!'); await load() }
    }
  }

  const handleGenerate = async (cat, gender, count=1) => {
    const key = `${cat.id}_${gender}`
    let ok=0, fail=0
    for (let i=0; i<count; i++) {
      setGenerating(g => ({...g, [key]: `${i+1}/${count}`}))
      try {
        await generateOne(cat, gender, Math.floor(Math.random()*99999))
        ok++
        await load()
        showToast(`✅ Foto ${i+1}/${count} (${gender}) berhasil!`)
      } catch(e) {
        fail++
        showToast(`⚠️ Foto ${i+1}/${count} gagal: ${e.message}`, "warn")
      }
      if (i < count-1) {
        for (let s=DELAY/1000; s>0; s--) {
          setGenerating(g => ({...g, [key]: `${i+1}/${count} ✓ — jeda ${s}d`}))
          await new Promise(r=>setTimeout(r,1000))
        }
      }
    }
    setGenerating(g => ({...g, [key]: null}))
    showToast(`🎉 ${ok} berhasil${fail>0?`, ${fail} gagal`:""}`)
  }

  const handleDelete = async (catId, gender, filename) => {
    await fetch("/api/photos/delete", {
      method:"DELETE", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({category:catId, gender, filename}),
    })
    await load()
    showToast("🗑️ Foto dihapus")
  }

  // ── New Category Modal ────────────────────────────────────────────────────────
  function NewCategoryModal({ onClose }) {
    const [label, setLabel]   = useState("")
    const [emoji, setEmoji]   = useState("✨")
    const [pMale, setPMale]   = useState(PROMPT_TEMPLATE["laki-laki"])
    const [pFemale, setPFemale] = useState(PROMPT_TEMPLATE["perempuan"])

    const handleCreate = async () => {
      if (!label.trim()) return alert("Nama kategori tidak boleh kosong")
      const id = slugify(label)
      await saveCategory({ id, label: label.trim(), emoji, promptMale: pMale, promptFemale: pFemale })
      showToast(`✅ Kategori "${label}" ditambahkan!`)
      onClose()
    }

    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
        <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:620,maxHeight:"90vh",overflow:"auto",padding:28}} onClick={e=>e.stopPropagation()}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,marginBottom:20}}>➕ Kategori Baru</div>

          {/* Name + emoji */}
          <label style={labelStyle}>Nama Kategori</label>
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <select value={emoji} onChange={e=>setEmoji(e.target.value)} style={{...inputStyle,width:60,padding:"10px 8px",cursor:"pointer"}}>
              {EMOJIS.map(e=><option key={e}>{e}</option>)}
            </select>
            <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="misal: Bayi Islami, Bayi Eropa..."
              style={{...inputStyle,flex:1}} onKeyDown={e=>e.key==="Enter"&&handleCreate()} />
          </div>

          {/* Prompts */}
          {[["laki-laki","👦 Prompt Laki-laki",pMale,setPMale],["perempuan","👧 Prompt Perempuan",pFemale,setPFemale]].map(([g,lbl,val,set])=>(
            <div key={g} style={{marginBottom:16}}>
              <label style={labelStyle}>{lbl}</label>
              <textarea value={val} onChange={e=>set(e.target.value)} rows={4} style={{...inputStyle,resize:"vertical"}} />
              <p style={hintStyle}>Ubah bagian [GAYA] sesuai tema. Sisanya biarkan untuk hasil terbaik.</p>
            </div>
          ))}

          <div style={{display:"flex",gap:10,marginTop:8}}>
            <button onClick={onClose} style={btnSecondary}>Batal</button>
            <button onClick={handleCreate} style={btnPrimary}>✅ Buat Kategori</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Edit Prompt Modal ─────────────────────────────────────────────────────────
  function EditPromptModal({ cat, onClose }) {
    const [pMale, setPMale]     = useState(cat.promptMale)
    const [pFemale, setPFemale] = useState(cat.promptFemale)

    const handleSave = async () => {
      await saveCategory({...cat, promptMale:pMale, promptFemale:pFemale})
      showToast("✅ Prompt disimpan!")
      onClose()
    }

    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
        <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:640,maxHeight:"90vh",overflow:"auto",padding:28}} onClick={e=>e.stopPropagation()}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700,marginBottom:20}}>
            ✏️ Edit Prompt — {cat.emoji} {cat.label}
          </div>
          {[["laki-laki","👦 Prompt Laki-laki",pMale,setPMale],["perempuan","👧 Prompt Perempuan",pFemale,setPFemale]].map(([g,lbl,val,set])=>(
            <div key={g} style={{marginBottom:16}}>
              <label style={labelStyle}>{lbl}</label>
              <textarea value={val} onChange={e=>set(e.target.value)} rows={5} style={{...inputStyle,resize:"vertical"}} />
            </div>
          ))}
          <div style={{background:"#fdf7ee",borderRadius:12,padding:"10px 14px",marginBottom:16,fontSize:12,color:"#7a5a20",lineHeight:1.6}}>
            💡 Tips: Bagian yang perlu diubah biasanya nama style (islami, eropa, dll) dan pakaian bayi. Bagian "sitting upright, upper body visible..." sebaiknya dipertahankan agar hasil lebih bagus.
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={onClose} style={btnSecondary}>Batal</button>
            <button onClick={handleSave} style={btnPrimary}>💾 Simpan</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Gender Section ────────────────────────────────────────────────────────────
  function GenderSection({ cat, gender }) {
    const key = `${cat.id}_${gender.id}`
    const isGen = !!generating[key]
    const genLabel = generating[key]
    const gPhotos = photos[cat.id]?.[gender.id] || []

    return (
      <div style={{padding:"14px 20px",borderTop:"1px solid #f0ece4"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <span style={{fontSize:13,fontWeight:700,color:"#5a5040"}}>{gender.emoji} {gender.label} — {gPhotos.length} foto</span>
          <div style={{display:"flex",gap:6}}>
            {isGen ? (
              <div style={{display:"flex",alignItems:"center",gap:7,background:"#fdf7ee",border:"1px solid #e8d5a0",borderRadius:9,padding:"6px 12px"}}>
                <span style={{width:12,height:12,border:"2px solid #c9a96e",borderTopColor:"transparent",borderRadius:"50%",display:"inline-block",animation:"spin 0.8s linear infinite"}}/>
                <span style={{fontSize:11,fontWeight:700,color:"#7a5a20"}}>{genLabel} (~90dtk/foto)</span>
              </div>
            ) : (<>
              {[1,4].map(n => (
                <button key={n} onClick={()=>handleGenerate(cat,gender.id,n)} style={{
                  padding:"6px 12px",borderRadius:9,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                  background: n===1?"#f0ece4":"linear-gradient(135deg,#1a1814,#3d2f1f)",
                  color: n===1?"#5a5040":"#f5f0e8",
                  fontFamily:"'DM Sans',sans-serif",
                }}>+{n}</button>
              ))}
              <label style={{padding:"6px 12px",borderRadius:9,border:"1.5px dashed #c9a96e",cursor:"pointer",fontSize:11,fontWeight:700,color:"#c9a96e",background:"#fdf7ee",fontFamily:"'DM Sans',sans-serif"}}>
                📁 Upload
                <input type="file" accept="image/*" multiple style={{display:"none"}}
                  onChange={e=>handleUpload(cat,gender.id,e.target.files)}/>
              </label>
            </>)}
          </div>
        </div>

        {gPhotos.length === 0 ? (
          <div style={{padding:"16px 0",textAlign:"center",color:"#c0b8a8",fontSize:12}}>
            Belum ada foto — klik +1 atau +4 untuk generate
          </div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:8}}>
            {gPhotos.map(ph => (
              <div key={ph.filename} style={{position:"relative",borderRadius:10,overflow:"hidden",aspectRatio:"1",background:"#eee",cursor:"pointer",flexShrink:0}}
                onClick={()=>setPreview({...ph,catId:cat.id,gender:gender.id})}>
                <img src={ph.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                {gPhotos[0].filename===ph.filename && <span style={{position:"absolute",top:4,left:4,background:"#c9a96e",color:"#1a1814",fontSize:8,fontWeight:800,padding:"1px 5px",borderRadius:4}}>BARU</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:"#f2efe9",fontFamily:"'DM Sans',system-ui,sans-serif"}}>

      <header style={{background:"#1a1814",position:"sticky",top:0,zIndex:50,boxShadow:"0 2px 20px rgba(0,0,0,0.25)"}}>
        <div style={{maxWidth:900,margin:"0 auto",padding:"0 20px",height:64,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <button onClick={onBack} style={{background:"#2a2520",border:"none",color:"#c9a96e",padding:"7px 14px",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:600}}>← Kembali</button>
            <div>
              <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:17,color:"#f5f0e8"}}>📁 Database Foto</div>
              <div style={{fontSize:11,color:"#7a7060"}}>{totalPhotos} foto · {categories.length} kategori</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {/* Quota badge */}
            {quota && (() => {
              const pct = Math.min(100, (quota.used / quota.budget) * 100)
              const isLow = quota.remaining < quota.neuronsPerImage * 5
              const isOut = quota.remaining < quota.neuronsPerImage
              return (
                <div title={`${quota.used} / ${quota.budget} neurons hari ini · reset 00:00 UTC`}
                  style={{display:"flex",alignItems:"center",gap:8,background:"#2a2520",borderRadius:10,padding:"6px 12px"}}>
                  <span style={{fontSize:14}}>🔋</span>
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color: isOut?"#e74c3c":isLow?"#f5c842":"#a8d8b8"}}>
                      {isOut ? "Quota habis" : `~${quota.estimatedPhotosLeft} foto lagi`}
                    </div>
                    <div style={{width:90,height:4,background:"#3a3530",borderRadius:99,marginTop:3,overflow:"hidden"}}>
                      <div style={{width:pct+"%",height:"100%",background: isOut?"#e74c3c":isLow?"#f5c842":"#4a9d6f",transition:"width 0.3s"}}/>
                    </div>
                  </div>
                </div>
              )
            })()}
            {/* Target count */}
            {!isRunning && (
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:11,color:"#7a7060"}}>Target/folder:</span>
                <input type="number" min={1} max={100} value={targetCount}
                  onChange={e=>setTargetCount(Math.max(1,parseInt(e.target.value)||1))}
                  style={{width:52,padding:"5px 8px",borderRadius:8,border:"1px solid #3a3530",background:"#2a2520",color:"#f5f0e8",fontSize:13,textAlign:"center"}}/>
              </div>
            )}

            {/* Auto-Run / Stop */}
            {isRunning ? (
              <button onClick={stopAll}
                style={{background:"#c0392b",color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:7}}>
                <span style={{width:10,height:10,background:"#fff",borderRadius:2,display:"inline-block"}}/>
                Stop
              </button>
            ) : (
              <button onClick={runAll}
                style={{background:"linear-gradient(135deg,#1a5a30,#2d7a52)",color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:7}}>
                ▶ Auto-Run
              </button>
            )}

            <button onClick={()=>setNewCat(true)} style={{...btnPrimary,padding:"8px 16px",fontSize:13}}>➕ Kategori Baru</button>
          </div>
        </div>
      </header>

      {/* Auto-Run status bar */}
      {isRunning && (
        <div style={{background:"#1a3a20",borderBottom:"2px solid #2d7a52",padding:"10px 20px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:64,zIndex:40}}>
          <span style={{width:10,height:10,borderRadius:"50%",background:"#2ecc71",display:"inline-block",animation:"pulse 1s ease-in-out infinite",flexShrink:0}}/>
          <span style={{color:"#a8f0c0",fontSize:13,fontWeight:600,flex:1}}>{runStatus}</span>
          <button onClick={stopAll} style={{background:"rgba(255,255,255,0.12)",color:"#fff",border:"none",borderRadius:8,padding:"4px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>⏹ Stop</button>
        </div>
      )}

      <main style={{maxWidth:900,margin:"0 auto",padding:"24px 20px 60px",display:"flex",flexDirection:"column",gap:16}}>

        {categories.length === 0 && (
          <Card style={{padding:40,textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:12}}>📁</div>
            <div style={{fontWeight:700,marginBottom:6}}>Belum ada kategori</div>
            <div style={{color:"#9a9080",fontSize:13,marginBottom:16}}>Klik "Kategori Baru" untuk mulai membuat database foto</div>
            <button onClick={()=>setNewCat(true)} style={btnPrimary}>➕ Buat Kategori Pertama</button>
          </Card>
        )}

        {categories.map(cat => (
          <Card key={cat.id}>
            {/* Category header */}
            <div style={{padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
                <span style={{fontSize:26}}>{cat.emoji}</span>
                <div>
                  {editCat===cat.id ? (
                    <input defaultValue={cat.label} autoFocus
                      onBlur={e=>{ saveCategory({...cat,label:e.target.value.trim()}); setEditCat(null) }}
                      onKeyDown={e=>{ if(e.key==="Enter"){saveCategory({...cat,label:e.target.value.trim()});setEditCat(null)} }}
                      style={{...inputStyle,padding:"4px 10px",fontSize:15,fontWeight:700,width:200}} />
                  ) : (
                    <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:700,cursor:"pointer"}}
                      onClick={()=>setEditCat(cat.id)}>{cat.label} <span style={{fontSize:11,color:"#b0a898"}}>✏️</span></div>
                  )}
                  <div style={{fontSize:11,color:"#9a9080",marginTop:2}}>
                    👦 {photos[cat.id]?.["laki-laki"]?.length||0} · 👧 {photos[cat.id]?.["perempuan"]?.length||0} foto
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setEditPrompt(cat)}
                  style={{...btnSecondary,padding:"6px 14px",fontSize:12}}>✏️ Edit Prompt</button>
                <button onClick={()=>deleteCategory(cat.id)}
                  style={{background:"#fff0f0",border:"1px solid #fcc",color:"#c00",borderRadius:10,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>🗑️</button>
              </div>
            </div>

            {/* Gender sections */}
            {GENDERS.map(g => <GenderSection key={g.id} cat={cat} gender={g} />)}
          </Card>
        ))}
      </main>

      {/* Modals */}
      {newCatModal && <NewCategoryModal onClose={()=>setNewCat(false)} />}
      {editPrompt  && <EditPromptModal cat={editPrompt} onClose={()=>setEditPrompt(null)} />}

      {/* Preview modal */}
      {preview && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setPreview(null)}>
          <div style={{maxWidth:480,width:"100%"}} onClick={e=>e.stopPropagation()}>
            <img src={preview.url} alt="" style={{width:"100%",borderRadius:16,display:"block"}}/>
            <div style={{display:"flex",gap:10,marginTop:12}}>
              <button onClick={()=>setPreview(null)} style={{...btnSecondary,flex:1}}>Tutup</button>
              <button onClick={()=>{handleDelete(preview.catId,preview.gender,preview.filename);setPreview(null)}}
                style={{flex:1,padding:12,borderRadius:12,border:"none",background:"#e53e3e",color:"#fff",cursor:"pointer",fontWeight:700,fontSize:14}}>
                🗑️ Hapus Foto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:toast.type==="warn"?"#f59e0b":"#1a4a30",color:"#fff",padding:"12px 24px",borderRadius:12,fontSize:14,fontWeight:600,boxShadow:"0 8px 32px rgba(0,0,0,0.25)",zIndex:200,whiteSpace:"nowrap"}}>
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  )
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const inputStyle = {
  width:"100%", border:"1.5px solid #e8e4dc", borderRadius:12,
  padding:"10px 14px", fontSize:13, fontFamily:"'DM Sans',sans-serif",
  background:"#fdfcfa", color:"#1a1a1a", outline:"none", boxSizing:"border-box",
}
const labelStyle = { fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px", color:"#9a9080", display:"block", marginBottom:6 }
const hintStyle  = { fontSize:11, color:"#b0a898", marginTop:5, lineHeight:1.5 }
const btnPrimary  = { background:"linear-gradient(135deg,#1a1814,#3d2f1f)", color:"#f5f0e8", border:"none", borderRadius:12, padding:"10px 20px", cursor:"pointer", fontWeight:700, fontSize:13, fontFamily:"'DM Sans',sans-serif" }
const btnSecondary = { background:"#fff", color:"#5a5040", border:"1.5px solid #e8e4dc", borderRadius:12, padding:"10px 20px", cursor:"pointer", fontWeight:600, fontSize:13, fontFamily:"'DM Sans',sans-serif" }