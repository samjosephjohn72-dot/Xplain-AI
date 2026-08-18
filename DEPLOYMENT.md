# Deploying NovaXplain

NovaXplain is deployed as two services:

- `backend/` is a Docker-based Flask API hosted on Render. This is necessary
  because Whisper and PyTorch are too large for a Vercel Function.
- `frontend/` is the static website hosted on Vercel.

## 1. Push the repository to GitHub

Create a GitHub repository and push this project. The `.gitignore` file keeps
the local virtual environments and `backend/.env` (which contains secrets) out
of the repository.

## 2. Deploy the backend on Render

1. In Render, select **New > Blueprint** and connect the GitHub repository.
2. Render detects `render.yaml`. Create the `novaxplain-api` service.
3. In the service's **Environment** page, set `GEMINI_API_KEY` to the value
   from your local `backend/.env` file.
4. After deployment, copy the public service URL, for example:
   `https://novaxplain-api.onrender.com`.
5. Set `CORS_ORIGINS` to your Vercel website URL after step 3. Before that,
   use `*` temporarily for testing.
6. Open `https://YOUR-RENDER-URL/health`; it should return
   `{"status":"ok"}`.

Whisper needs more memory than a free service commonly provides. Use a Render
instance with at least 2 GB RAM for reliable audio transcription.

## 3. Connect the frontend to Render

Edit `frontend/config.js` and replace:

```js
https://YOUR-RENDER-SERVICE.onrender.com
```

with your real Render service URL. Do not add a trailing slash.

## 4. Deploy the frontend on Vercel

1. In Vercel, select **Add New > Project** and import the same GitHub
   repository.
2. Set **Root Directory** to `frontend`.
3. Select the **Other** framework preset; no build command is required.
4. Deploy.
5. Copy the Vercel URL and set it as `CORS_ORIGINS` in Render, then redeploy
   the Render service.

Vercel serves the HTML, CSS, JavaScript, and `config.js` as a static site;
Render processes the API requests and audio files.
