# LinkedIn Save to PDF (Ingenarte) — Unofficial

Export a clean, print-ready view of your LinkedIn profile as PDF — even if the official “Save to PDF” option is missing.  
All processing happens **locally** in your browser. No data is collected or transmitted.

---

## Demo Video

[![Watch the video](https://img.youtube.com/vi/DqYbSY7tKAo/0.jpg)](https://www.youtube.com/watch?v=DqYbSY7tKAo)

---

## Features

- **One-click export** from any LinkedIn profile.
- **Clean layout** optimized for printing or PDF saving.
- **Light mode only** for consistent print results.
- **Customizable sections** (photo, contact info, experience, education, skills, etc.).
- Works with **LinkedIn profiles in any language**.
- **Full Profile export (opt-in)** — after explicit confirmation, the extension opens same-profile `/details/<section>/` pages in temporary background tabs, one at a time, so entries truncated on the main profile page can be included in the PDF. Runs locally, serially, only on user action.

---

## Installation (Developer Mode)

1. Download the latest ZIP of the extension source.
2. Extract it to a local folder.
3. Open Chrome → `chrome://extensions`.
4. Enable **Developer mode** (top right).
5. Click **Load unpacked** and select the folder containing `manifest.json`.
6. Open any LinkedIn profile (`linkedin.com/in/...`) and click the extension icon → **Export to PDF**.

---

## Privacy

- **No data collection, transmission, or sale.**
- Processing happens locally after you click **Export to PDF**.
- Temporary use of `chrome.storage.local` to pass extracted profile data to the print view.
- Data is removed from storage immediately after printing.
- No programmatic external requests are made. Profile photos, when enabled, are rendered from the image URL already present in the LinkedIn page.

See [PRIVACY.md](./PRIVACY.md) for details.

---

## Permissions

| Permission | Purpose |
| --- | --- |
| `activeTab` | Allows extracting data from the currently active LinkedIn profile tab after a user click. |
| `storage` | Saves user settings and temporarily stores extracted data to pass it to the print view. |
| `scripting` | Re-injects the declared local content scripts after a user action if a LinkedIn tab was opened before install or update. |
| `tabs` | Opens, monitors, restores focus from, and closes temporary same-profile detail tabs for Full Profile export. |
| `host_permissions` | Restricted to `https://*.linkedin.com/*` for content extraction on profile and detail pages. |

---

## Development

### Folder Structure

```
Linkedin_Save_to_PDF-main/
├── LICENSE
├── COMPLIANCE.md
├── PRIVACY.md
├── PRIVACY.html
├── README.md
├── manifest.json
├── public/
│   └── icons/
├── src/
│   ├── popup/
│   ├── content/
│   └── print/
```

### Build a Clean Release ZIP

```bash
rm -rf dist && mkdir -p dist/Linkedin_Save_to_PDF
rsync -a \
  --exclude '.git' \
  --exclude '.gitignore' \
  --exclude 'AUDIT_REPORT.md' \
  ./ ./dist/Linkedin_Save_to_PDF/
(cd dist && zip -r Linkedin_Save_to_PDF_vX.X.X.zip Linkedin_Save_to_PDF)
```

> The browser extension itself has no build step. Load the project root
> directly in Chrome when testing locally, or package the clean ZIP for
> Chrome Web Store submission.

---

## License

This project is **source-available, NOT open source**.

Starting with version **1.0.2**, the Software is distributed under a
**proprietary, end-user, non-commercial license** (see [LICENSE](./LICENSE)).
Personal, non-commercial use of the unmodified extension is permitted.

The following are **NOT permitted** without written consent from the author:

- Copying, mirroring, or republishing the Software.
- Modifying, forking, translating, or creating derivative works.
- Redistributing, sublicensing, selling, renting, or transferring the Software.
- Commercial use of any kind.
- Removing or altering author attribution / branding.
- Publishing competing products based on this Software.

> Note: versions of this project distributed before 1.0.2 under the MIT
> License remain MIT for the copies already distributed; the proprietary
> license applies to 1.0.2 onward.

For commercial licensing or any usage outside the personal end-user
scope, contact **contacto.ingenarte@gmail.com**.

---

## Disclaimer

This extension is **not affiliated with or endorsed by LinkedIn Corporation**.  
LinkedIn® is a registered trademark of LinkedIn Corporation.

---

## Author

- **Franco Mariano Rodrigo** — [LinkedIn Profile](https://www.linkedin.com/in/fmrodrigo/)
- Company: [Ingenarte](https://www.ingenarte.com)
- Email: contacto.ingenarte@gmail.com
- GitHub: [Ingenarte/Linkedin_Save_to_PDF](https://github.com/Ingenarte/Linkedin_Save_to_PDF)
