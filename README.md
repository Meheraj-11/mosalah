# MoSalah v1.0.0

A production-ready Islamic prayer & ibadah progressive web app.

**Stack:** HTML5, CSS3, vanilla JavaScript. No build step.

## Features

- Dashboard with live clock, Hijri/Gregorian dates, next salah countdown
- Astronomical prayer times (not hard-coded) with multiple calculation methods
- GPS or manual city / coordinates
- Qibla bearing; live compass when the device supports it, static fallback otherwise
- Qur’an: 114 surahs, Arabic (Uthmani), Bengali & English translations, audio, bookmarks
- Authentic Hadith & dua collections with references
- Learn Salah (Wudu + five prayers, Witr, recitations) — Hanafi-oriented, differences labeled
- Digital tasbih, ibadah tracker, Ramadan view, Hijri calendar, zakat estimator
- English, Bengali, Arabic UI
- Light / dark / system theme
- PWA: installable, offline app shell, cached Qur’an after first load

## Run locally

Serve the `MoSalah` folder over HTTP (required for geolocation, notifications, and the service worker):

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```

Open `http://localhost:8080`.

## Prayer times

Computed from solar position (PrayTimes-style). Methods: Muslim World League, Egyptian, Karachi (default, common in South Asia), Umm Al-Qura, Moonsighting Committee, ISNA, Tehran, Jafari, Gulf, Custom angles. Asr: Standard or Hanafi (default). High-latitude adjustments included. Manual minute offsets in Settings.

Default location if GPS is unavailable: Chattogram, Bangladesh.

## Religious sources

- **Qur’an text & translations:** [AlQuran Cloud](https://alquran.cloud/api) — Uthmani script, Saheeh International, Taisirul Quran. Audio via islamic.network (Alafasy).
- **Hadith & dua:** well-known reports from Bukhari, Muslim, Abu Dawud, Tirmidhi, Nasa’i, Ibn Majah, Muwatta, and Hisnul Muslim. Every item shows its reference. Nothing is fabricated.
- **Hijri dates:** civil/tabular calendar. Local moon sighting may differ by a day.

MoSalah is educational. It does not issue fatwas.

## Privacy

Settings, bookmarks, tasbih and tracker data stay on the device (`localStorage` / IndexedDB). Location is used only to compute prayer times and Qibla. There is no MoSalah tracking backend.

## Browser notifications

Reminders work while the app is open (or installed, depending on the browser). Background delivery is **not** guaranteed — this limitation is stated in Settings.

## License

App code is provided for the MoSalah project. Qur’an, Hadith and dua texts remain the work of their respective transmitters and publishers.
