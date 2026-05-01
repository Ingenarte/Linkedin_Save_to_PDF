# Privacy Policy — LinkedIn Save to PDF (Unofficial by Ingenarte)

_Last updated: 2026-05-01_

---

## 1. Data Collection

We **do not** collect, store, transmit, or sell any personal data.

All operations are performed **locally** in your browser.  
No information leaves your device.

---

## 2. Data Processing

The extension processes data **only** when you explicitly click the **Export to PDF** button.

Steps:

1. The extension extracts profile information from the active LinkedIn tab.
2. If **Full Profile export** is confirmed by the user, the extension additionally opens each selected section's `/in/<slug>/details/<section>/` sub-page (of the same profile you are currently viewing) in a temporary background tab, extracts the full list, and immediately closes the tab. Sub-pages are visited **serially** with a short throttle between them.
3. Data is temporarily stored in `chrome.storage.local` to transfer it to the print view.
4. Once the print view is loaded, the temporary data is **immediately deleted**.

Full Profile export is **opt-in** and requires confirmation. It never visits profiles other than the one active in your browser and only opens pages you could reach yourself from that same profile.

---

## 3. External Requests

The extension does **not** make programmatic network requests to external servers.  
The only network activity it triggers is loading LinkedIn sub-pages of the profile you are already viewing, in the same way your own browser does when you click on "Show all". If profile photos are enabled, the print page renders the image URL already present in the LinkedIn page.

---

## 4. Permissions Usage

- **`activeTab`** — Needed to read the content of the currently active LinkedIn profile tab after you click export.
- **`storage`** — Used for user settings and short-term data transfer between scripts; profile export data is cleared immediately after printing.
- **`scripting`** — Used only after a user action to recover the declared content script on LinkedIn tabs opened before install or update.
- **`tabs`** — Used for the opt-in Full Profile export to open, monitor, restore focus from, and close same-profile LinkedIn detail tabs.

---

## 5. Contact

If you have any questions about this privacy policy, please contact:

**Email:** contacto.ingenarte@gmail.com  
**Website:** [https://www.ingenarte.com](https://www.ingenarte.com)

---

## 6. Disclaimer

This extension is **not affiliated with or endorsed by LinkedIn Corporation**.  
LinkedIn® is a registered trademark of LinkedIn Corporation.
