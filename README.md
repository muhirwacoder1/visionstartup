# Nixtio design recreation

A self-contained, responsive recreation of [nixtio.com](https://nixtio.com/), prepared for private design review. The reference's public page markup, styles, fonts, videos, brand imagery, and copy are preserved for fidelity. Those assets and trademarks belong to their respective owners.

The independent interaction layer in `dist/recreation.js` recreates scroll reveals, hero perspective, project image reveals, count-up statistics, services, FAQ, mobile navigation, video controls, presenter preview, and local demo forms. It does not use the reference's Next.js runtime or send data to its services. Some animation details are approximations, including the original shader and Lottie effects.

## Preview

Run `npm run dev` and open `http://127.0.0.1:5186/`. No dependency installation or build step is needed. Run `npm run check` to check the interaction script.

## Included pages

Home, Projects, Studio, Testimonials, Contact, Start a Project, Privacy, Cookie Policy, and the six homepage case studies: Passion Finder, KazaSwap, Xefag, Linkmatch, InputNinja, and Payoneer. Other case-study links open the original site.

Forms are explicitly marked as previews, validate locally, and display a confirmation that nothing was sent. A restrictive content policy prevents form delivery, external scripts, and application network connections. Case studies retain the reference's Vimeo video embeds, which require internet access. Reduced-motion preferences are respected.

## Editing

Page content lives in `dist/**/index.html`; interaction styles and behavior live in `dist/recreation.css` and `dist/recreation.js`. Local media lives in `dist/assets/`. `asset-manifest.json` records the source URLs. The optional `tools/import_reference.py` script refreshes public reference content and requires Python's `beautifulsoup4` and `requests` packages. It retains the custom CSS and JavaScript files.
