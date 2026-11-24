# Nixtio Content Studio

This project pairs a responsive recreation of [Nixtio](https://nixtio.com/) with a custom content editor. The original page layouts, typography, styles, and motion remain in the website. The editor changes copy, links, media, visibility, case studies, and navigation. Reference imagery and trademarks belong to their respective owners; replace them with content you have permission to publish before sharing the site publicly.

## Open the studio

Run `npm ci` once, then `npm run dev`. Open [the content studio](http://127.0.0.1:5186/admin/) or [the website](http://127.0.0.1:5186/). To use the disconnected editor, open [local preview mode](http://127.0.0.1:5186/admin/?preview=local). It is available only on loopback. Draft text stays in this browser; newly selected local media stays available until you reload. The Publish button is disabled.

- **Pages:** choose a page and section. Edit its content and check desktop and mobile previews. Hide a section where the toggle is available. Restore an individual field to return to the reference value.
- **Projects:** enter a title, cover, description, and summary. Use a wide cover (16:10), keep the subject in the center, and describe the image for readers who cannot see it. Add and reorder case study blocks. Preview the detail page, the project listing, and the homepage before publishing.
- **Remove a project:** use Unpublish to remove its public page and cards while retaining the draft. Delete an unpublished draft to remove it from the editor. Existing reference cards can be hidden individually in the Home and Projects page editors.
- **Site menu:** rename, add, reorder, or hide links. One menu controls both desktop and mobile.
- **Media:** upload or reuse an image or video. Removing media from a field keeps it in the library. R2 originals are private; Cloudinary delivery URLs are accessible to anyone who has the link.

## Deploy to Vercel

Import `muhirwacoder1/visionstartup` in Vercel. Use the repository root and set **Production Branch** to `master`. The checked-in [Vercel configuration](vercel.json) uses the **Other** framework preset, builds with `npm run build:cms`, and publishes `dist`.

Open `/admin/` on your deployed domain. On Vercel, `/cms` also redirects there. In the Vercel environment for your deployment, set `PUBLIC_CONVEX_URL` and `PUBLIC_CLERK_PUBLISHABLE_KEY`, then redeploy. For a preview on `*.vercel.app`, use the Clerk development key and development Convex deployment. For a production Clerk instance, use a domain you own, a Clerk production publishable key, and the production Convex URL.

If the homepage itself returns 404, open the latest **Ready** deployment directly from Vercel and confirm the intended domain is assigned to it. If the homepage loads and `/admin/` displays a setup message, check the two Vercel environment variables and redeploy.

## Connect the services

1. **Clerk.** A claimable Clerk development application was created for this checkout. From this project folder, run `npx -y clerk@latest auth login` to claim it into your [Clerk account](https://dashboard.clerk.com/). Enable or confirm [Clerk's Convex integration](https://docs.convex.dev/auth/clerk) so tokens use the `convex` audience. Add your intended editor to the Clerk app and copy their Clerk user ID. If the Clerk instance allows registration, new users still cannot edit without being listed in Convex.
2. **Convex.** The development deployment for this project is [brainy-jaguar-989](https://dashboard.convex.dev/d/brainy-jaguar-989). Set `CLERK_JWT_ISSUER_DOMAIN` to the Clerk Frontend API origin and `CMS_ADMIN_USER_IDS` to a comma-separated list of approved Clerk user IDs. Deploy with `npx convex dev --once`. Use a dedicated production deployment for a public launch.
3. **R2.** Use the private bucket `nixtio-cms-originals`. Create an Object Read & Write API token scoped only to that bucket and set `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` in Convex. The bucket CORS rule allows signed uploads from the local preview and existing private Site. Add a new origin if you change the site's address. Do not enable public R2 access.
4. **Cloudinary.** Create or choose a product environment in the [Cloudinary Console](https://console.cloudinary.com/), then add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` to Convex. Originals go to R2; the backend signs a request to create an optimized delivery copy in Cloudinary. No unsigned upload preset is needed. Test with a file you own; images are limited to 10 MB and videos to 50 MB.
5. **Website.** Put only `PUBLIC_CLERK_PUBLISHABLE_KEY` and `PUBLIC_CONVEX_URL` in `.env.local` or the build environment, then run `npm run build:cms`. The generated `dist/cms-config.js` contains only public settings. Include it with the static deployment. Set `NIXTIO_HOSTED_BUILD=1` when packaging so local test settings are excluded unless you explicitly provide the hosted keys. Keep the Clerk secret and all storage credentials out of the web directory and Git.

Once connected, sign in at `/admin/`, upload a test file, and verify that its original can be downloaded from the library. Save and preview a draft, publish it, and verify the result in a signed-out tab before unpublishing it.

## Verify and maintain

- `npm run check` checks scripts, builds the studio, and checks backend types.
- `npm test` checks editor permissions, draft isolation, validation, and the publication lifecycle.
- With the local server running, `npx playwright test` checks the editor and its embedded website. Use `npx playwright install chromium` or point `CHROMIUM_EXECUTABLE` to an installed Chrome.
- `tools/prepare-cms.py` builds the field catalog from the reference HTML. If you change its field mapping after connecting the CMS, migrate saved overrides before deploying the new mapping.
- `dist/recreation.js` contains the independent interaction layer. Contact forms still show a local demo confirmation and do not send messages.
