# Optional admin Cloud Functions

The admin panel works without this folder. Deploy it only if you want:

| Feature | Without functions | With functions |
| --- | --- | --- |
| Change another user's password from the Users page | Not possible from the browser — reset it in the Firebase console, or send a reset email if the account uses a real address | Works from the **Reset** button |
| Delete a user | The Firestore record is deleted and they lose access immediately; the Authentication login stays until you remove it in the console | Both are removed |

The Firebase client SDK cannot change someone else's password by design, which is why this needs a privileged backend.

## Deploy

```bash
npm install -g firebase-tools
firebase login
firebase init functions      # choose JavaScript, keep this folder
npm --prefix functions install
firebase deploy --only functions
```

Cloud Functions require the project to be on the Blaze (pay-as-you-go) plan. These three callables are tiny and stay inside the free monthly allowance for normal campus use.

If you deploy to a region other than `us-central1`, add `functionsRegion: 'your-region'` to `FIREBASE_CONFIG` in `firebase-config.js`.
