import { useState, useEffect, useCallback, useRef } from "react";

// ── Canvas renderer (sama logikanya dengan App.jsx) ─────────────────────────
const S = 1080;

function loadImg(url) {
  return new Promise(res => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}

function wrapText(ctx, text, maxW) {
  const lines = [];
  for (const raw of (text || "").split("\n")) {
    const words = raw.trim().split(" ");
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

function combineMeaning(parts) {
  return (parts || []).map(p => `${p.word} = ${p.meaning}`).join(" · ");
}

async function renderFrame(type, data, bgUrl) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d");
  const img = bgUrl ? await loadImg(bgUrl) : null;

  if (img) { ctx.drawImage(img, 0, 0, S, S); }
  else { ctx.fillStyle = "#1a1814"; ctx.fillRect(0, 0, S, S); }

  // Overlay
  const grad = ctx.createLinearGradient(0, S * 0.55, 0, S);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.5, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0.82)");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, S, S);

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 14;

  if (type === "hook") {
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = `italic bold 58px Georgia, serif`;
    const lines = wrapText(ctx, data.text, S - 100);
    const startY = S - 160 - (lines.length - 1) * 72;
    lines.forEach((l, i) => ctx.fillText(l, S / 2, startY + i * 72));

    ctx.fillStyle = "rgba(201,169,110,0.9)";
    ctx.beginPath();
    ctx.roundRect(S/2 - 80, 30, 160, 50, 12);
    ctx.fill();
    ctx.fillStyle = "#1a1814"; ctx.font = "bold 26px sans-serif";
    ctx.fillText("HOOK", S / 2, 56);

  } else if (type === "main") {
    ctx.fillStyle = "#fff"; ctx.font = "bold 68px Georgia, serif";
    ctx.fillText(data.fullName || "", S / 2, S * 0.6);
    ctx.fillStyle = "#c9a96e"; ctx.font = "bold 24px sans-serif";
    ctx.fillText("✦", S / 2, S * 0.675);
    (data.parts || []).forEach((p, i) => {
      const y = S * 0.735 + i * 52;
      ctx.fillStyle = "#c9a96e"; ctx.font = "bold 32px sans-serif";
      ctx.fillText(p.word, S / 2, y);
      ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = "300 26px sans-serif";
      ctx.fillText(p.meaning || "", S / 2, y + 30);
    });

  } else if (type === "cta") {
    ctx.font = "bold 58px Georgia, serif";
    const lines = wrapText(ctx, data.text, S - 80);
    const startY = S - 175 - (lines.length - 1) * 80;
    lines.forEach((l, i) => {
      ctx.fillStyle = "#fff"; ctx.fillText(l, S / 2, startY + i * 82);
    });
    ctx.fillStyle = "rgba(201,169,110,0.9)";
    ctx.beginPath(); ctx.roundRect(S/2 - 60, 30, 120, 50, 12); ctx.fill();
    ctx.fillStyle = "#1a1814"; ctx.font = "bold 26px sans-serif";
    ctx.fillText("CTA", S / 2, 56);
  }

  return canvas;
}

async function buildFrames(pkg) {
  const frames = [];
  // Hook
  frames.push({ label: "HOOK", canvas: await renderFrame("hook", { text: pkg.hook }, pkg.photo_urls?.hook) });
  // Names
  for (let i = 0; i < (pkg.names || []).length; i++) {
    const n = pkg.names[i];
    frames.push({ label: `#${i+1} ${n.fullName}`, canvas: await renderFrame("main", n, pkg.photo_urls?.names?.[i]) });
  }
  // CTA
  frames.push({ label: "CTA", canvas: await renderFrame("cta", { text: pkg.cta }, pkg.photo_urls?.cta) });
  return frames;
}

// ── Main History Component ───────────────────────────────────────────────────
export default function History({ onBack }) {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [preview, setPreview]   = useState(null);  // package being previewed
  const [frames, setFrames]     = useState([]);    // rendered canvases
  const [rendering, setRendering] = useState(false);
  const [toast, setToast]       = useState(null);
  const isMounted = useRef(true);

  const showToast = (msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000) };

  const loadPackages = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/packages");
      setPackages(await r.json());
    } catch(e) { console.warn(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadPackages(); return () => { isMounted.current = false } }, [loadPackages]);

  const openPreview = async (pkg) => {
    setPreview(pkg); setFrames([]); setRendering(true);
    try {
      const f = await buildFrames(pkg);
      if (isMounted.current) setFrames(f);
    } catch(e) { showToast("❌ Render gagal: " + e.message, "warn"); }
    setRendering(false);
  };

  const deletePackage = async (id) => {
    if (!window.confirm("Hapus paket ini?")) return;
    await fetch("/api/packages", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id}) });
    setPackages(p => p.filter(x => x.id !== id));
    if (preview?.id === id) setPreview(null);
    showToast("🗑️ Paket dihapus");
  };

  // ── Download functions ─────────────────────────────────────────────────────
  const canvasToBlob = (canvas) => new Promise(res => canvas.toBlob(b => res(b), "image/jpeg", 0.92));

  const downloadOne = async (frame, idx) => {
    const blob = await canvasToBlob(frame.canvas);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${String(idx).padStart(2,"0")}_${frame.label.replace(/[^a-zA-Z0-9]/g,"_")}.jpg`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const downloadAll = async () => {
    showToast("⏳ Download semua foto...");
    for (let i = 0; i < frames.length; i++) {
      await downloadOne(frames[i], i);
      await new Promise(r => setTimeout(r, 200));
    }
    showToast("✅ Semua foto selesai didownload!");
  };

  const downloadZip = async () => {
    const JsZip = (await import("jszip")).default;
    showToast("⏳ Membuat ZIP...");
    const zip = new JsZip();
    const folder = zip.folder(preview.theme || preview.id);
    for (let i = 0; i < frames.length; i++) {
      const blob = await canvasToBlob(frames[i].canvas);
      const fname = `${String(i).padStart(2,"0")}_${frames[i].label.replace(/[^a-zA-Z0-9]/g,"_")}.jpg`;
      folder.file(fname, blob);
    }
    const blob = await zip.generateAsync({ type:"blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${preview.theme || preview.id}.zip`;
    a.click(); URL.revokeObjectURL(a.href);
    showToast("✅ ZIP berhasil didownload!");
  };

  const shareToTikTok = () => {
    showToast("⏳ TikTok API belum disetujui — fitur akan aktif setelah approval.", "warn");
    // TODO: aktifkan setelah TikTok API approved:
    // 1. Upload frames ke Supabase exports
    // 2. Call /api/tiktok/post
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:"#f2efe9",fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      {/* Header */}
      <header style={{background:"#1a1814",position:"sticky",top:0,zIndex:50,boxShadow:"0 2px 20px rgba(0,0,0,0.25)"}}>
        <div style={{maxWidth:900,margin:"0 auto",padding:"0 20px",height:64,display:"flex",alignItems:"center",gap:16}}>
          <button onClick={onBack} style={{background:"#2a2520",border:"none",color:"#c9a96e",padding:"7px 14px",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:600}}>← Kembali</button>
          <div>
            <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:17,color:"#f5f0e8"}}>📋 Histori Konten</div>
            <div style={{fontSize:11,color:"#7a7060"}}>{packages.length} paket tersimpan</div>
          </div>
        </div>
      </header>

      <main style={{maxWidth:900,margin:"0 auto",padding:"24px 20px 60px"}}>
        {loading && <div style={{textAlign:"center",padding:60,color:"#9a9080"}}>Memuat histori...</div>}

        {!loading && packages.length === 0 && (
          <div style={{textAlign:"center",padding:60,background:"#fff",borderRadius:20,border:"1px solid #ece9e3"}}>
            <div style={{fontSize:48,marginBottom:12}}>📭</div>
            <div style={{fontWeight:700,fontSize:17,marginBottom:8}}>Belum ada konten</div>
            <div style={{color:"#9a9080",fontSize:14}}>Generate konten dulu atau tunggu jadwal otomatis</div>
          </div>
        )}

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {packages.map(pkg => (
            <div key={pkg.id} onClick={() => openPreview(pkg)}
              style={{background:"#fff",borderRadius:16,border:"1px solid #ece9e3",padding:"16px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
              {/* Thumbnail strip */}
              <div style={{display:"flex",gap:4,flexShrink:0}}>
                {[pkg.photo_urls?.hook, ...(pkg.photo_urls?.names||[]).slice(0,2), pkg.photo_urls?.cta].filter(Boolean).map((url,i)=>(
                  <img key={i} src={url} alt="" style={{width:44,height:44,borderRadius:8,objectFit:"cover",border:"2px solid #fff",boxShadow:"0 1px 4px rgba(0,0,0,0.1)"}} crossOrigin="anonymous"/>
                ))}
              </div>
              {/* Info */}
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{fontSize:18}}>{pkg.emoji||"🍼"}</span>
                  <span style={{fontWeight:700,fontSize:15,color:"#1a1814"}}>{pkg.theme}</span>
                  {pkg.auto_generated && <span style={{fontSize:10,background:"#f0e4ff",color:"#7c3aed",padding:"2px 8px",borderRadius:20,fontWeight:700}}>AUTO</span>}
                </div>
                <div style={{fontSize:12,color:"#9a9080",marginBottom:4}}>
                  {new Date(+pkg.id).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})} · {(pkg.names||[]).length} nama
                </div>
                <div style={{fontSize:12,color:"#7a7060",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {pkg.hook?.replace(/\n/g," ")}
                </div>
              </div>
              <button onClick={e=>{e.stopPropagation();deletePackage(pkg.id)}}
                style={{background:"#fff0f0",border:"1px solid #fcc",color:"#c00",borderRadius:9,padding:"6px 10px",cursor:"pointer",fontSize:13,flexShrink:0}}>🗑️</button>
            </div>
          ))}
        </div>
      </main>

      {/* Preview Modal */}
      {preview && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:100,display:"flex",flexDirection:"column",overflow:"auto"}}>
          {/* Modal header */}
          <div style={{background:"#1a1814",padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,position:"sticky",top:0,zIndex:10}}>
            <div>
              <div style={{color:"#f5f0e8",fontWeight:700,fontSize:16}}>{preview.emoji} {preview.theme}</div>
              <div style={{color:"#7a7060",fontSize:12}}>{new Date(+preview.id).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})}</div>
            </div>
            <button onClick={()=>{setPreview(null);setFrames([])}}
              style={{background:"#2a2520",border:"none",color:"#c9a96e",padding:"8px 16px",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:600}}>✕ Tutup</button>
          </div>

          {/* Download buttons */}
          <div style={{background:"#111",padding:"12px 20px",display:"flex",gap:10,flexWrap:"wrap",flexShrink:0}}>
            <button onClick={downloadZip} disabled={!frames.length}
              style={dlBtn("#c9a96e","#1a1814")}>📦 Download ZIP</button>
            <button onClick={downloadAll} disabled={!frames.length}
              style={dlBtn("#2d7a52","#fff")}>⬇️ Semua Foto (tanpa ZIP)</button>
            <button onClick={shareToTikTok}
              style={dlBtn("#333","#fff")}>📱 Share ke TikTok <span style={{fontSize:10,opacity:0.6}}>(belum aktif)</span></button>
          </div>

          {/* Frames grid */}
          <div style={{padding:20,flex:1}}>
            {rendering && (
              <div style={{textAlign:"center",color:"#c9a96e",padding:40,fontSize:14}}>
                <div style={{width:32,height:32,border:"3px solid #c9a96e",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 12px"}}/>
                Render 12 foto...
              </div>
            )}
            {!rendering && frames.length === 0 && (
              <div style={{textAlign:"center",color:"#7a7060",padding:40}}>Gagal render foto. Cek koneksi ke Supabase.</div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
              {frames.map((f, i) => (
                <div key={i} style={{position:"relative",borderRadius:12,overflow:"hidden",cursor:"pointer"}}
                  onClick={() => downloadOne(f, i)}>
                  <canvas ref={el => { if(el && f.canvas) { el.width=f.canvas.width; el.height=f.canvas.height; el.getContext("2d").drawImage(f.canvas,0,0) } }}
                    style={{width:"100%",display:"block",borderRadius:12}}/>
                  <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0)",display:"flex",alignItems:"flex-end",padding:8}}>
                    <span style={{background:"rgba(0,0,0,0.6)",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20}}>
                      {f.label} · klik untuk download
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:toast.type==="warn"?"#f59e0b":"#1a4a30",color:"#fff",padding:"12px 24px",borderRadius:12,fontSize:14,fontWeight:600,boxShadow:"0 8px 32px rgba(0,0,0,0.3)",zIndex:300,whiteSpace:"nowrap",maxWidth:"90vw",textAlign:"center"}}>
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

const dlBtn = (bg, color) => ({
  background: bg, color, border:"none", borderRadius:10, padding:"9px 16px",
  cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
  opacity: 1, display:"flex", alignItems:"center", gap:6,
})
