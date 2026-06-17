# 🪁 WingSpot

Webová appka, která ti ukáže, **kde a kdy bude dostatečně foukat na wingfoiling**.
Funguje na Windows, Macu, iPhonu i Androidu (v prohlížeči, a jde si ji „nainstalovat" na plochu).

Data o počasí bere zdarma z [Open-Meteo](https://open-meteo.com) – žádná registrace
ani placení.

---

## Co appka umí

- 📅 **Kalendář na 22 dní** – každý den je barevně podle toho, jak to vypadá:
  - 🔥 tyrkysová = skvělé podmínky
  - ✅ zelená = jezditelné
  - 🤞 oranžová = potenciál (skoro, nebo se předpověď může zlepšit)
  - · šedá = slabý vítr
  - Předpověď = **vážený průměr více modelů** (jako Windguru). Modely s vyšším
    rozlišením mají větší váhu: AROME 1,3 km a ICON-D2 2,2 km, HARMONIE 2/5 km,
    ICON-EU 7 km, ECMWF 9 km, GFS 13 km. Tím prvních ~3 dny vedou jemné modely,
    dál postupně hrubší.
  - Dny 17–22: **„výhled"** z ansámblu GEFS (čárkovaný okraj, nízká spolehlivost).
  - Pozn.: ALADIN (ČHMÚ, pro Česko nejpřesnější) zatím není – Open-Meteo ho nemá
    a ČHMÚ ho dává jen jako GRIB soubory bez CORS (šlo by doplnit přes malý
    serverový/naplánovaný job, viz komentář v `src/lib/weather.ts`).
- 👆 **Rozkliknutí dne** → seznam všech spotů seřazený od nejlepšího, s předpovědí
  větru po hodinách. U každého spotu je **odkaz na Windguru** pro kontrolu.
- 💨 O jezditelnosti rozhoduje **rychlost větru** (ne nárazy). Nárazy se jen zobrazují.
- 🏄 **Lišta nahoře** ukazuje **nejbližší jízdu** – kdy a kde nejdřív dostatečně foukne.
- 📍 **Výběr výchozího místa a max. vzdálenosti** (např. Praha, do 250 km).
- ⏱ Bere v potaz, **jak dlouho fouká** – krátká chvilka se nepočítá jako jezditelný den.
- 📊 **Spolehlivost / potenciál** – počítá se z rozptylu 31 variant ansámblu GEFS.
  Když se shodují → vysoká spolehlivost. Když se rozcházejí a část ukazuje vítr →
  „↑ potenciál", že se předpověď zlepší.
- ⭐ **Oblíbené spoty**, ☀ čas svítání/soumraku, 💨 nárazy větru.

Vše se dá nastavit přes ozubené kolečko ⚙ vpravo nahoře.

---

## Jak appku spustit u sebe v počítači

Potřebuješ mít nainstalovaný [Node.js](https://nodejs.org) (stáhni LTS verzi).

1. Otevři Terminál a přejdi do složky s projektem:
   ```bash
   cd ~/Desktop/wingspot
   ```
2. Jednou nainstaluj všechno potřebné:
   ```bash
   npm install
   ```
3. Spusť appku:
   ```bash
   npm run dev
   ```
4. V prohlížeči otevři adresu, kterou Terminál vypíše (obvykle `http://localhost:5173`).

Když budeš chtít skončit, v Terminálu stiskni `Ctrl + C`.

---

## Jak appku dostat na internet (zdarma, přes Netlify)

Stejně jako u tvého webu Sweet Puff:

1. Nahraj tuhle složku na GitHub (nový repozitář).
2. Na [netlify.com](https://www.netlify.com) dej **Add new site → Import from GitHub**
   a vyber repozitář.
3. Netlify si build nastaví sám (je to v souboru `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Klikni na **Deploy**. Za chvíli dostaneš adresu typu `https://nazev.netlify.app`.

> Tip: appku pak na telefonu otevři v prohlížeči a dej **„Přidat na plochu"**.
> Bude se chovat jako normální appka s ikonou.

---

## Jak si upravit spoty

Spoty (jména a GPS) jsou v jednom souboru:

```
src/data/spots.ts
```

Teď tam je 5 spotů: Nechranice, Rozkoš, Labuť (Myštice), Štěpánský rybník (u Mýta)
a Berzdorfer See. Je tam u každého komentář. Klidně přidávej nebo uprav GPS
(souřadnice u Labutě a Štěpánského rybníku si případně dolaď přesněji).
Po uložení se appka sama aktualizuje.

---

## Z čeho je to postavené

- **Vite + React + TypeScript** (moderní, rychlé)
- **vite-plugin-pwa** – aby šla appka nainstalovat
- **Open-Meteo API** – zdroj předpovědí (zdarma, bez klíče)

---

## Nápady na později

- 🔔 Upozornění (push), když se objeví dobrá foukačka v dosahu
- 🗺️ Mapa spotů
- 🌡️ Teplota vody
- 👥 Sdílení plánu s partou
- 🚗 Vzdálenost autem (ne jen vzdušnou čarou)
