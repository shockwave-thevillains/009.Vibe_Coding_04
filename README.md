# 桜川 Sakura River Valley

Perjalanan perahu 3D real-time menyusuri lembah sungai di Jepang, dibuat dengan **Three.js**.
Proyek ini replikasi dari demo *Sakura River Valley Boat Scene* karya Meng To, salah satu showcase
"vibe coding" Claude Opus 5.5 yang paling banyak dibagikan. Dibangun ulang dari nol: semua geometri,
tekstur, dan audio dibangkitkan secara prosedural, tanpa file aset.

## Fitur

- **Sungai berkelok tanpa ujung.** Lintasannya loop tertutup sepanjang ±1,8 km, dengan medan yang
  diukir mengikuti alur sungai serta pegunungan berhutan sugi.
- **Perahu sampan.** Tukang perahu mendayung dengan galah memakai animasi IK, penumpang berkimono
  memegang payung *wagasa*, dan lentera *chōchin* menyala di malam hari.
- **Air reflektif.** Pantulan cermin real-time, normal map prosedural, serta riak dari galah, haluan,
  dan tetesan hujan.
- **Siklus siang–malam.** Matahari dan bulan bergerak, langit senja, bintang berkelip, kunang-kunang,
  dan lentera batu yang menyala.
- **Cuaca dinamis.** Ada empat mode: Cerah, Sakura (kelopak berguguran), Hujan, dan Badai (petir
  dengan guntur yang tertunda sesuai jarak).
- **Arsitektur Jepang.** Jembatan *taikobashi* merah, pagoda lima tingkat, *torii* di tepi air
  beserta kuil, desa *machiya* dengan *chōchin*, dan jembatan kayu.
- **Pascaproses sinematik.** ACES tone mapping, bloom, vignette, dan film grain.
- **Audio prosedural.** Gemericik sungai, hujan, angin, burung, jangkrik, guntur, dan melodi ala
  koto pada tangga nada *in* Jepang.
- **Kamera.** Mode Ikuti (seret untuk memutar, gulir untuk zoom), Sinematik (enam jenis shot
  otomatis), dan Haluan (sudut pandang orang pertama).

## Kontrol

| Input | Aksi |
| --- | --- |
| `W` / `S` atau `↑` / `↓` | Percepat / perlambat |
| `A` / `D` atau `←` / `→` | Kemudi kiri / kanan |
| Seret mouse / sentuh | Memutar kamera |
| Gulir / cubit | Zoom |
| `C` | Ganti mode kamera |
| `Spasi` | Jeda / lanjutkan waktu |
| `H` | Sembunyikan UI |

Parameter URL opsional: `?t=19.5` (jam awal), `?w=storm` (`clear`, `sakura`, `rain`, `storm`),
`?cam=cinematic` (`follow`, `cinematic`, `bow`), `?pause` (bekukan waktu), dan `?autostart`
(lewati layar pembuka).

## Menjalankan secara lokal

```bash
npm install
npm run dev      # server pengembangan
npm run build    # build produksi ke dist/
npm run preview  # pratinjau hasil build
```

## Deploy ke GitHub Pages

Workflow `.github/workflows/deploy.yml` membangun proyek dan menerbitkan `dist/` ke GitHub Pages
setiap kali ada push ke `main` (atau ke branch pengembangan). Langkah sekali saja:

1. Buka **Settings → Pages** di repo ini.
2. Pada **Build and deployment → Source**, pilih **GitHub Actions**.
3. Push ke branch, atau jalankan workflow *Deploy to GitHub Pages* secara manual dari tab
   **Actions**.

Situs akan tersedia di `https://<username>.github.io/<nama-repo>/`. `vite.config.js` memakai
`base: './'` sehingga path aset tetap benar di subfolder tersebut.

> Catatan: GitHub Pages untuk repo **private** memerlukan paket GitHub Pro, Team, atau Enterprise.
> Di paket Free, ubah dulu repo menjadi public.

## Struktur kode

```
src/
  main.js        renderer, post-processing, loop, UI
  river.js       kurva sungai + query jarak cepat (spatial hash)
  terrain.js     height field, warna medan, siluet gunung jauh
  water.js       air reflektif + normal map prosedural
  sky.js         kubah langit (matahari, bulan, bintang, awan), palet siang-malam, kabut
  flora.js       sakura, sugi, alang-alang, batu (instanced + shader angin)
  structures.js  jembatan, pagoda, torii, kuil, desa, lentera (geometri digabung per material)
  boat.js        sampan, tukang perahu (IK lengan), penumpang, lentera
  particles.js   kelopak, hujan, riak, kunang-kunang, petir (dianimasikan di GPU)
  weather.js     preset cuaca + penjadwalan petir
  camera.js      kamera ikuti / sinematik / haluan
  audio.js       soundscape Web Audio prosedural
```
