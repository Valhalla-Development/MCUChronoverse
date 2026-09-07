<div align="center">
  <img id="top" src="https://raw.githubusercontent.com/Valhalla-Development/MCUChronoverse/main/public/og.png" width="100%" alt="MCU Chronoverse Banner">

  <p>
    <a href="https://discord.gg/Q3ZhdRJ"><img src="https://img.shields.io/discord/495602800802398212.svg?colorB=5865F2&logo=discord&logoColor=white&style=for-the-badge" alt="Discord"></a>
    <a href="https://github.com/Valhalla-Development/MCUChronoverse/stargazers"><img src="https://img.shields.io/github/stars/Valhalla-Development/MCUChronoverse.svg?style=for-the-badge&color=yellow" alt="Stars"></a>
    <a href="https://github.com/Valhalla-Development/MCUChronoverse/network/members"><img src="https://img.shields.io/github/forks/Valhalla-Development/MCUChronoverse.svg?style=for-the-badge&color=orange" alt="Forks"></a>
    <a href="https://github.com/Valhalla-Development/MCUChronoverse/issues"><img src="https://img.shields.io/github/issues/Valhalla-Development/MCUChronoverse.svg?style=for-the-badge&color=red" alt="Issues"></a>
    <a href="https://github.com/Valhalla-Development/MCUChronoverse/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Valhalla-Development/MCUChronoverse.svg?style=for-the-badge&color=blue" alt="License"></a>
    <br>
    <a href="https://app.codacy.com/gh/Valhalla-Development/MCUChronoverse/dashboard"><img src="https://img.shields.io/codacy/grade/31f3e0cceb0f42fe97959d6b7259397e?style=for-the-badge&color=brightgreen" alt="Codacy code quality"></a>
    <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Built%20with-Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Built with Next.js"></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/Made%20with-TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="Made with TypeScript"></a>
    <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Runtime-Bun-f9f1e1?style=for-the-badge&logo=bun&logoColor=000000" alt="Runtime Bun"></a>
  </p>

  <p><em>An interactive 3D archive for exploring the Marvel Cinematic Universe in chronological order.</em></p>
</div>

---

## 🌟 About the Project

MCU Chronoverse is a cinematic, interactive guide to the Marvel Cinematic Universe. Explore the timeline from beginning to end, filter entries by format, compare chronological and release order, and keep track of what you have watched.

The archive includes films, series, specials, shorts, one-shots, and upcoming entries, with enriched metadata and links to IMDb.

## ✨ Features

<table>
  <tr>
    <td width="50%">
      <h3>🌌 Interactive 3D Timeline</h3>
      <p>Navigate a glowing, slightly organic timeline with smooth scrolling, dragging, and pinch zoom.</p>
    </td>
    <td width="50%">
      <h3>🎛️ Flexible Filters</h3>
      <p>Filter the archive by films, series, specials, shorts, one-shots, phases, and timeline order.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>✅ Watch Progress</h3>
      <p>Mark released entries as watched and see what is next in the current filtered view.</p>
    </td>
    <td width="50%">
      <h3>🔐 Optional Accounts</h3>
      <p>Use the site anonymously or sign in with Supabase to keep watch progress available across devices.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🎞️ Rich Metadata</h3>
      <p>View posters, descriptions, ratings, genres, release information, IMDb links, and credit-scene details.</p>
    </td>
    <td width="50%">
      <h3>📝 Community Corrections</h3>
      <p>Suggest timeline corrections, missing entries, and website improvements through GitHub issues.</p>
    </td>
  </tr>
</table>

## 🚀 Requirements

- [Bun](https://bun.sh/)

## 🛠️ Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/Valhalla-Development/MCUChronoverse.git
   cd MCUChronoverse
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Copy `.env.example` to `.env` and add any values needed for the functionality you want to run locally. The example documents the available authentication, contact submission, Turnstile, and metadata enrichment settings.

4. Start the development server:

   ```bash
   bun run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🧪 Development commands

```bash
bun run dev          # Start the local development server
bun run lint         # Run TypeScript and Biome checks
bun run type-check   # Run the TypeScript checker
bun run data:enrich  # Refresh cached metadata with TMDB and Trakt
```

The metadata enrichment script requires TMDB and Trakt API credentials documented in `.env.example`. It is intended for development use and should not be run as part of the production application.

## 🤝 Contributing

Contributions and corrections are welcome.

1. Fork the repository.
2. Create a focused branch for your change.
3. Run `bun run lint` before opening a pull request.
4. Open a pull request using the repository template.

For timeline corrections, missing entries, and suggestions, use the [issue templates](https://github.com/Valhalla-Development/MCUChronoverse/issues/new/choose).

## 📜 License

This project is licensed under the GPL-3.0 License. See [LICENSE](LICENSE) for details.

---

<div align="center">

💻 Crafted with ❤️ by [Valhalla-Development](https://github.com/Valhalla-Development)

[🐛 Report a timeline issue](https://github.com/Valhalla-Development/MCUChronoverse/issues/new/choose) | [💡 Suggest an improvement](https://github.com/Valhalla-Development/MCUChronoverse/issues/new/choose)

<a href="#top">🔝 Back to Top</a>
</div>
