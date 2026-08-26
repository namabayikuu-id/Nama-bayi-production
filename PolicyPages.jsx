export function PrivacyPolicy() {
  return <PolicyLayout title="Privacy Policy" lastUpdated="Juni 2026">
    <Section title="1. Overview">
      <p>BabyName Creator adalah alat produktivitas pribadi untuk membuat konten nama bayi di media sosial. Tidak mengumpulkan data pengguna apapun.</p>
    </Section>
    <Section title="2. Data yang Tidak Kami Kumpulkan">
      <ul>
        <li>Tidak mengumpulkan nama, email, atau informasi pribadi apapun</li>
        <li>Tidak menggunakan cookies atau teknologi tracking</li>
        <li>Tidak menjalankan analytics atau iklan</li>
        <li>Tidak menjual atau membagikan data apapun ke pihak ketiga</li>
      </ul>
    </Section>
    <Section title="3. Penggunaan TikTok API">
      <ul>
        <li>Hanya memposting konten ke akun TikTok operator sendiri</li>
        <li>Tidak mengakses data pengguna TikTok manapun selain akun operator</li>
        <li>Access token disimpan di database terenkripsi</li>
      </ul>
    </Section>
    <Section title="4. Layanan Pihak Ketiga">
      <ul>
        <li><strong>TikTok API</strong> — publikasi konten</li>
        <li><strong>Groq API</strong> — generasi teks nama bayi</li>
        <li><strong>Cloudflare Workers AI</strong> — generasi gambar</li>
        <li><strong>Supabase</strong> — penyimpanan foto sementara (auto-delete 4 hari)</li>
        <li><strong>Vercel</strong> — hosting aplikasi</li>
      </ul>
    </Section>
    <Section title="5. Retensi Data">
      <p>Foto yang di-generate otomatis dihapus setelah <strong>4 hari</strong>.</p>
    </Section>
    <Section title="6. Kontak">
      <p>Untuk pertanyaan, hubungi operator aplikasi secara langsung.</p>
    </Section>
  </PolicyLayout>
}

export function TermsOfService() {
  return <PolicyLayout title="Terms of Service" lastUpdated="Juni 2026">
    <Section title="1. Penerimaan Ketentuan">
      <p>Dengan menggunakan BabyName Creator, Anda menyetujui Ketentuan Layanan ini. Aplikasi ini hanya untuk penggunaan pribadi/internal oleh operator yang ditunjuk.</p>
    </Section>
    <Section title="2. Penggunaan yang Diizinkan">
      <ul>
        <li>Hanya boleh digunakan oleh operator yang berwenang</li>
        <li>Konten yang dipublikasikan harus mematuhi Panduan Komunitas TikTok</li>
        <li>Tidak boleh digunakan untuk konten menyesatkan atau berbahaya</li>
      </ul>
    </Section>
    <Section title="3. Tanggung Jawab Konten">
      <p>Operator bertanggung jawab penuh atas semua konten yang dibuat dan dipublikasikan. Pengembang tidak bertanggung jawab atas pelanggaran ketentuan platform pihak ketiga.</p>
    </Section>
    <Section title="4. Layanan Pihak Ketiga">
      <p>Aplikasi bergantung pada API TikTok, Groq, Cloudflare, dan Supabase. Operator setuju mematuhi syarat layanan masing-masing.</p>
    </Section>
    <Section title="5. Penafian Garansi">
      <p>Aplikasi disediakan "apa adanya" tanpa garansi apapun.</p>
    </Section>
    <Section title="6. Perubahan Ketentuan">
      <p>Ketentuan dapat diperbarui sewaktu-waktu. Penggunaan berkelanjutan berarti penerimaan atas ketentuan yang diperbarui.</p>
    </Section>
  </PolicyLayout>
}

function PolicyLayout({ title, lastUpdated, children }) {
  return (
    <div style={{ minHeight:'100vh', background:'#faf8f4', fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      <nav style={{ background:'#1a1814', padding:'0 24px', height:60, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:50 }}>
        <a href="/" style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none' }}>
          <span style={{ fontSize:22 }}>🍼</span>
          <strong style={{ color:'#f5f0e8', fontSize:16 }}>BabyName Creator</strong>
        </a>
        <div style={{ display:'flex', gap:16 }}>
          <a href="/privacy" style={{ color:'#9a9080', fontSize:13, textDecoration:'none' }}>Privacy Policy</a>
          <a href="/tos" style={{ color:'#9a9080', fontSize:13, textDecoration:'none' }}>Terms of Service</a>
        </div>
      </nav>
      <div style={{ maxWidth:760, margin:'0 auto', padding:'48px 24px 80px' }}>
        <div style={{ fontSize:11, color:'#b0a898', textTransform:'uppercase', letterSpacing:'0.8px', fontWeight:600, marginBottom:8 }}>Legal</div>
        <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:36, fontWeight:800, marginBottom:8, color:'#1a1814' }}>{title}</h1>
        <p style={{ fontSize:13, color:'#b0a898', marginBottom:40 }}>Terakhir diperbarui: {lastUpdated}</p>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>{children}</div>
      </div>
      <footer style={{ background:'#1a1814', color:'#5a5040', textAlign:'center', padding:'28px 24px', fontSize:13 }}>
        <p>🍼 BabyName Creator · Internal Content Tool</p>
        <p style={{ marginTop:8 }}>
          <a href="/privacy" style={{ color:'#c9a96e', textDecoration:'none' }}>Privacy Policy</a>
          {' · '}
          <a href="/tos" style={{ color:'#c9a96e', textDecoration:'none' }}>Terms of Service</a>
        </p>
      </footer>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ background:'#fff', borderRadius:16, padding:'22px 26px', border:'1px solid #ece9e3', boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
      <h3 style={{ fontSize:15, fontWeight:700, marginBottom:12, color:'#1a1814' }}>{title}</h3>
      <div style={{ fontSize:14, color:'#555', lineHeight:1.75 }}>{children}</div>
    </div>
  )
}
