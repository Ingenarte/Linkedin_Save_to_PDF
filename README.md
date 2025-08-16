# LinkedIn Save to PDF (Ingenarte) — Unofficial

Export a clean, print-ready view of your LinkedIn profile as PDF — even if the official “Save to PDF” option is missing.  
All processing happens **locally** in your browser. No data is collected or transmitted.

---

## 🚀 Features

- **One-click export** from any LinkedIn profile.
- **Clean layout** optimized for printing or PDF saving.
- **Light mode only** for consistent print results.
- **Customizable sections** (photo, contact info, experience, education, skills, etc.).
- Works with **LinkedIn profiles in any language**.

---

## 📦 Installation (Developer Mode)

1. Download the latest ZIP of the extension source.
2. Extract it to a local folder.
3. Open Chrome → `chrome://extensions`.
4. Enable **Developer mode** (top right).
5. Click **Load unpacked** and select the folder containing `manifest.json`.
6. Open any LinkedIn profile (`linkedin.com/in/...`) and click the extension icon → **Export to PDF**.

---

## 🔒 Privacy

- **No data collection, transmission, or sale.**
- Processing happens locally after you click **Export to PDF**.
- Temporary use of `chrome.storage.local` to pass extracted profile data to the print view.
- Data is removed from storage immediately after printing.
- No external requests are made.

See [PRIVACY.md](./PRIVACY.md) for details.

---

## 🛠 Permissions

| Permission         | Purpose                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| `activeTab`        | Allows extracting data from the currently active LinkedIn profile tab. |
| `storage`          | Temporarily stores extracted data to pass it to the print view.        |
| `scripting`        | Allows injecting content scripts programmatically if needed.           |
| `host_permissions` | Restricted to `https://*.linkedin.com/*` for content extraction.       |

---

## 🧪 Development

### Folder Structure

```
Linkedin_Save_to_PDF-main/
├── LICENSE
├── PRIVACY.md
├── README.md
├── manifest.json
├── page-hook.js
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
rsync -a   ./Linkedin_Save_to_PDF-main/ ./dist/Linkedin_Save_to_PDF/
(cd dist && zip -r Linkedin_Save_to_PDF_v0.3.0.zip Linkedin_Save_to_PDF)
```

---

## 📌 Disclaimer

This extension is **not affiliated with or endorsed by LinkedIn Corporation**.  
LinkedIn® is a registered trademark of LinkedIn Corporation.

---

## 👨‍💻 Author

- **Franco Mariano Rodrigo** — [LinkedIn Profile](https://www.linkedin.com/in/fmrodrigo/)
- Company: [Ingenarte](https://www.ingenarte.com)
- Email: contacto.ingenarte@gmail.com
- GitHub: [Ingenarte/Linkedin_Save_to_PDF](https://github.com/Ingenarte/Linkedin_Save_to_PDF)
